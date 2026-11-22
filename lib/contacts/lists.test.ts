import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { setCompanyCountForTests } from "@/lib/accounts/company";
import { MemoryCampaignStore, setCampaignStoreForTests, type Campaign } from "@/lib/campaigns/store";
import { createCampaign, enrollFrom, parseSource, type Senders } from "@/lib/campaigns/service";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryTouchStore, setTouchStoreForTests, type Touch } from "@/lib/messaging/store";
import { resetMemoryCounters } from "@/lib/m8/kv";
import { listCallQueue } from "@/lib/calls/session";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { RELATIONSHIP_LABELS, type ImportRecord } from "./mapping";
import { cleanRule, describeRule, matches, permissionClass, ruleFromParams, ruleKey, ruleSql, ruleToParams, sameRule, type ListRule } from "./filter";
import { DEFAULT_LISTS, deleteList, listById, listsFor, MAX_LISTS, MemoryListStore, NeonListStore, peopleIn, renameList, saveList, setListStoreForTests } from "./lists";
import { bulkAssign, bulkCsv, bulkDelete, bulkEnroll, resolveTarget } from "./bulk";
import { contactsCsv } from "./sheet";
import { checkScope, scopePeople } from "./scope";
import { importBatch, summarize } from "./service";
import { setContactTags } from "./tagging";
import { MemoryContactStore, NeonContactStore, setContactStoreForTests, type ConsentEntry, type Contact } from "./store";

const NOW = new Date("2026-11-18T19:00:00Z"); // Wednesday, 11:00 in Seattle
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();
const user = (id: string, role: User["role"], extra: Partial<User> = {}): User => ({ id, email: `${id}@x.com`, name: id.toUpperCase(), role, mloId: "mlo-001", status: "active", createdAt: "2026-11-01T00:00:00Z", createdBy: "t", ...extra });
const lo = user("lo1", "lo");
const lo2 = user("lo2", "lo");
const owner = user("own", "owner");
const lead = user("tl1", "team_lead");
const asst = user("as1", "assistant", { assistsUserId: "lo1", mloId: null });

const base = (over: Partial<Contact>): Contact => ({
  firstName: "X", lastName: "Lee", email: null, phone: null, phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null,
  id: "c_xxxxxxxx", ownerUserId: "lo1", kind: "contact", provenance: "personal", locked: false, source: "test", createdAt: ago(1), updatedAt: ago(1), ...over,
});
const consent = (contactId: string, over: Partial<ConsentEntry>): ConsentEntry => ({ contactId, channel: "text", purpose: "service", granted: true, evidence: "written", proof: "form", at: ago(5), actor: "t", ...over });
const touch = (contactId: string, direction: "in" | "out", at: string, status = "sent"): Touch => ({ id: `t_${contactId}_${at}_${direction}`, contactId, ownerUserId: "lo1", channel: "text", purpose: "service", direction, body: "hi", status, providerId: null, note: null, at, actor: "t" });

/** A small book: every filter has someone in and someone out. */
const BOOK: Contact[] = [
  base({ id: "c_annaaaaa", firstName: "Ann", relationship: "past_client", state: "WA", tags: ["Spring"], createdAt: ago(2), phone: "+12065550101", email: "ann@x.com", importId: "imp_aaaaaaaa" }),
  base({ id: "c_bobbbbbb", firstName: "Bo", relationship: "lead", state: "OR", tags: ["Fall"], createdAt: ago(40), phone: "+15035550102" }),
  base({ id: "c_cyyyyyyy", firstName: "Cy", relationship: "sphere", state: "WA", tags: [], createdAt: ago(100), email: "cy@x.com" }),
  base({ id: "c_deeeeeee", firstName: "Dee", relationship: "past_client", state: "CA", tags: ["Spring", "VIP"], createdAt: ago(10), phone: "+14155550104" }),
  base({ id: "c_evvvvvvv", firstName: "Ev", relationship: "lead", state: "WA", tags: [], createdAt: ago(3), locked: true, provenance: "prior_employer", phone: "+12065550105" }),
  base({ id: "c_faaaaaaa", firstName: "Fay", kind: "agent", relationship: "agent", state: "WA", tags: ["Spring"], createdAt: ago(1), agent: { brokerage: "Acme", units: null, volume: null, buyerUnits: null, listingUnits: null, avgPrice: null, topLender: null } }),
  base({ id: "c_gooooooo", firstName: "Gus", ownerUserId: "lo2", relationship: "past_client", state: "WA", tags: ["Spring"], createdAt: ago(1), phone: "+12065550107" }),
];
const CONSENTS: ConsentEntry[] = [
  consent("c_annaaaaa", { evidence: "written" }),
  consent("c_bobbbbbb", { evidence: "attested" }),
  // Dee said yes, then stop: the stop is the latest answer.
  consent("c_deeeeeee", { evidence: "written", at: ago(20) }),
  consent("c_deeeeeee", { granted: false, evidence: "revoked", at: ago(2) }),
  // A copy from a merged record is history only: it never makes Cy "on file".
  consent("c_cyyyyyyy", { evidence: "written", mergedFrom: "c_old" }),
  // Ev is held, whatever is on file.
  consent("c_evvvvvvv", { evidence: "written" }),
];
const TOUCHES: Touch[] = [
  touch("c_annaaaaa", "out", ago(3)),
  touch("c_annaaaaa", "in", ago(2)),
  touch("c_bobbbbbb", "out", ago(45)),
  // A failed send isn't contact.
  touch("c_deeeeeee", "out", ago(1), "failed"),
];

let contacts: MemoryContactStore;
let accounts: MemoryAccountStore;
let campaigns: MemoryCampaignStore;
let touches: MemoryTouchStore;

async function seed() {
  for (const c of BOOK) await contacts.put(c);
  for (const e of CONSENTS) await contacts.addConsent(e);
  for (const t of TOUCHES) await touches.add(t);
}
const names = async (rule: ListRule, ownerUserId = "lo1") => (await contacts.list({ ownerUserId, rule, now: NOW, limit: 100 })).contacts.map((c) => c.firstName).sort();

beforeEach(async () => {
  contacts = new MemoryContactStore();
  accounts = new MemoryAccountStore();
  campaigns = new MemoryCampaignStore();
  touches = new MemoryTouchStore();
  setContactStoreForTests(contacts);
  setAccountStoreForTests(accounts);
  setCampaignStoreForTests(campaigns);
  setTouchStoreForTests(touches);
  setConciergeStoreForTests(new MemoryConciergeStore());
  setListStoreForTests(new MemoryListStore());
  setCompanyCountForTests(1);
  resetMemoryCounters();
  for (const u of [lo, lo2, owner, lead, asst]) await accounts.putUser(u);
  delete process.env.CC_CAMPAIGNS;
});
afterEach(() => {
  for (const f of [setContactStoreForTests, setAccountStoreForTests, setCampaignStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setListStoreForTests, setCompanyCountForTests]) f(null);
});

/** A fake Neon connection that records every query. */
function fakeNeon() {
  const calls: { text: string; params: unknown[] }[] = [];
  const store = new NeonContactStore(async (text, params = []) => {
    calls.push({ text, params });
    return /count\(\*\)/.test(text) ? [{ n: 0 }] : [];
  });
  const listSql = async (rule: ListRule) => {
    calls.length = 0;
    await store.list({ ownerUserId: "lo1", rule, now: NOW });
    const q = calls.find((c) => /count\(\*\)/.test(c.text))!;
    // Every value is a bound parameter: none appears in the SQL text.
    for (const p of q.params) if (typeof p === "string" && p.length > 3 && p !== "contact" && p !== "agent") expect(q.text).not.toContain(p);
    return q;
  };
  return { calls, listSql };
}

describe("filters in both stores (D78)", () => {
  beforeEach(seed);

  it("tag: exact, any of the list's tags", async () => {
    expect(await names({ tagsAny: ["Spring"] })).toEqual(["Ann", "Dee"]);
    expect(await names({ tagsAny: ["Spring", "Fall"] })).toEqual(["Ann", "Bo", "Dee"]);
    expect(await names({ tagsAny: ["spring"] })).toEqual([]);
    const q = await fakeNeon().listSql({ tagsAny: ["Spring"] });
    expect(q.text).toMatch(/body->'tags' \?\| \$\d+::text\[\]/);
    expect(q.params).toContainEqual(["Spring"]);
  });

  it("state and relationship", async () => {
    expect(await names({ state: "WA" })).toEqual(["Ann", "Cy", "Ev"]);
    expect(await names({ relationship: "past_client" })).toEqual(["Ann", "Dee"]);
    const q = await fakeNeon().listSql({ state: "WA", relationship: "past_client" });
    expect(q.text).toMatch(/relationship = \$\d+ AND state = \$\d+/);
    expect(q.params).toEqual(expect.arrayContaining(["WA", "past_client"]));
  });

  it("permission: on file, your word only, relationship only, do not contact, on hold", async () => {
    expect(await names({ permission: "on_file" })).toEqual(["Ann"]);
    expect(await names({ permission: "your_word" })).toEqual(["Bo"]);
    expect(await names({ permission: "relationship" })).toEqual(["Cy"]);
    expect(await names({ permission: "do_not_contact" })).toEqual(["Dee"]);
    expect(await names({ permission: "on_hold" })).toEqual(["Ev"]);
    const neon = fakeNeon();
    const hold = await neon.listSql({ permission: "on_hold" });
    expect(hold.text).toMatch(/body->>'locked' = 'true'/);
    const stop = await neon.listSql({ permission: "do_not_contact" });
    // The newest live entry per channel and purpose decides, as `summarize` does (merged copies are history).
    expect(stop.text).toMatch(/x\.merged_from IS NULL AND NOT EXISTS \(SELECT 1 FROM cc_consents y WHERE y\.contact_id = x\.contact_id AND y\.channel = x\.channel AND y\.purpose = x\.purpose/);
    expect(stop.text).toMatch(/x\.evidence = 'revoked'/);
    const onFile = await neon.listSql({ permission: "on_file" });
    expect(onFile.text).toMatch(/NOT EXISTS \(SELECT 1 FROM cc_consents x .*x\.evidence = 'revoked'.*AND EXISTS \(SELECT 1 FROM cc_consents x .*x\.granted AND x\.evidence IN \('written', 'recorded_call', 'web_form', 'text_reply'\)/s);
    const rel = await neon.listSql({ permission: "relationship" });
    expect(rel.text).toMatch(/coalesce\(body->>'locked', 'false'\) <> 'true'/);
  });

  it("added: 7, 30 or 90 days, or one import", async () => {
    expect(await names({ addedWithinDays: 7 })).toEqual(["Ann", "Ev"]);
    expect(await names({ addedWithinDays: 30 })).toEqual(["Ann", "Dee", "Ev"]);
    expect(await names({ addedWithinDays: 90 })).toEqual(["Ann", "Bo", "Dee", "Ev"]);
    expect(await names({ importId: "imp_aaaaaaaa" })).toEqual(["Ann"]);
    const neon = fakeNeon();
    const q = await neon.listSql({ addedWithinDays: 30 });
    expect(q.text).toMatch(/body->>'createdAt' >= \$\d+/);
    expect(q.params).toContain(ago(30));
    const i = await neon.listSql({ importId: "imp_aaaaaaaa" });
    expect(i.text).toMatch(/body->>'importId' = \$\d+ OR body->'imports' @> \$\d+::jsonb/);
  });

  it("last contacted: within, not in N days, never (a failed send doesn't count)", async () => {
    expect(await names({ contactedWithinDays: 7 })).toEqual(["Ann"]);
    expect(await names({ contactedWithinDays: 90 })).toEqual(["Ann", "Bo"]);
    expect(await names({ quietDays: 30 })).toEqual(["Bo", "Cy", "Dee", "Ev"]);
    expect(await names({ neverContacted: true })).toEqual(["Cy", "Dee", "Ev"]);
    const neon = fakeNeon();
    const w = await neon.listSql({ contactedWithinDays: 7 });
    expect(w.text).toMatch(/EXISTS \(SELECT 1 FROM cc_touches t WHERE t\.contact_id = cc_contacts\.id AND t\.direction = 'out' AND t\.status NOT IN \('failed', 'blocked', 'undelivered'\) AND t\.at >= \$\d+::timestamptz\)/);
    expect(w.params).toContain(ago(7));
    expect((await neon.listSql({ quietDays: 30 })).text).toMatch(/NOT EXISTS \(SELECT 1 FROM cc_touches t WHERE .* AND t\.at >= \$\d+::timestamptz\)/);
    expect((await neon.listSql({ neverContacted: true })).text).toMatch(/NOT EXISTS \(SELECT 1 FROM cc_touches t WHERE t\.contact_id = cc_contacts\.id AND t\.direction = 'out'/);
  });

  it("never replied", async () => {
    expect(await names({ neverReplied: true })).toEqual(["Bo", "Cy", "Dee", "Ev"]);
    expect((await fakeNeon().listSql({ neverReplied: true })).text).toMatch(/NOT EXISTS \(SELECT 1 FROM cc_touches t WHERE t\.contact_id = cc_contacts\.id AND t\.direction = 'in'\)/);
  });

  it("kind, search and combined filters; another book never shows", async () => {
    expect(await names({ kind: "agent" })).toEqual(["Fay"]);
    expect(await names({ q: "ann@" })).toEqual(["Ann"]);
    expect(await names({ state: "WA", tagsAny: ["Spring"], permission: "on_file", neverReplied: false })).toEqual(["Ann"]);
    expect(await names({ tagsAny: ["Spring"] }, "lo2")).toEqual(["Gus"]);
    const q = await fakeNeon().listSql({ kind: "agent", q: "50%_off" });
    expect(q.text).toMatch(/owner_user_id = \$1 AND kind = \$2/);
    expect(q.params).toEqual(["lo1", "agent", "%50off%"]);
  });

  it("the pure matcher agrees with the store on every built-in list", async () => {
    for (const l of DEFAULT_LISTS) {
      const want = await names(l.rule);
      const got: string[] = [];
      for (const c of BOOK.filter((x) => x.ownerUserId === "lo1")) {
        const facts = { consents: CONSENTS.filter((e) => e.contactId === c.id), lastOut: TOUCHES.filter((t) => t.contactId === c.id && t.direction === "out" && t.status !== "failed").map((t) => t.at).sort().pop() ?? null, anyIn: TOUCHES.some((t) => t.contactId === c.id && t.direction === "in") };
        if (matches(c, l.rule, facts, NOW)) got.push(c.firstName);
      }
      expect(got.sort(), l.name).toEqual(want);
    }
  });
});

describe("rules, addresses and chips (D78)", () => {
  it("round-trips through the page address and compares in one order", () => {
    const r: ListRule = { tagsAny: ["Spring"], state: "WA", permission: "on_file", addedWithinDays: 30, quietDays: 90, neverReplied: true, relationship: "past_client", q: "lee" };
    expect(ruleFromParams(new URLSearchParams(ruleToParams(r)))).toEqual(cleanRule(r));
    expect(ruleToParams({ importId: "imp_aaaaaaaa", neverContacted: true, kind: "agent" })).toEqual({ kind: "agent", import: "imp_aaaaaaaa", contacted: "never" });
    expect(ruleFromParams({ added: "imp_aaaaaaaa", contacted: "q30", perm: "nope", state: "wa", rel: "agent" })).toEqual({ importId: "imp_aaaaaaaa", quietDays: 30, state: "WA" });
    expect(sameRule({ tagsAny: ["b", "a"], q: " " }, { tagsAny: ["a", "b"] })).toBe(true);
    expect(ruleKey({ kind: "contact" })).toBe("{}");
  });

  it("says each filter in plain words", () => {
    const chips = describeRule({ tagsAny: ["Spring"], state: "WA", permission: "do_not_contact", quietDays: 90, neverReplied: true }, { relationship: RELATIONSHIP_LABELS, permission: lc.permissionLabels, chip: lc.chip });
    expect(chips.map((c) => c.label)).toEqual(["Tag: Spring", "State: WA", "Do not contact", "Not contacted in 90 days", "Never replied"]);
    expect(chips.map((c) => c.key)).toEqual(["tag", "state", "perm", "contacted", "noreply"]);
  });

  it("reads permission like the list's badge (hold first, a stop next, latest answer wins)", () => {
    expect(permissionClass([consent("c", { evidence: "revoked", granted: false, at: ago(9) }), consent("c", { evidence: "written", at: ago(1) })], false)).toBe("on_file");
    expect(permissionClass([consent("c", { evidence: "attested" }), consent("c", { channel: "email", evidence: "revoked", granted: false })], false)).toBe("do_not_contact");
    expect(permissionClass([consent("c", { evidence: "reset", granted: false })], false)).toBe("relationship");
    expect(permissionClass([], true)).toBe("on_hold");
  });

  it("the SQL builder binds every value", () => {
    const p: unknown[] = [];
    const sql = ruleSql({ q: "o'brien; DROP TABLE x", tagsAny: ["a'); --"], state: "WA" }, NOW, p).join(" AND ");
    expect(sql).not.toMatch(/brien|DROP|--/);
    expect(p).toEqual(["contact", "WA", ["a'); --"], "%o'brien; drop table x%"]);
  });
});

describe("saved lists (D78)", () => {
  it("round-trips: saved, listed after the four built in, opened, renamed, deleted", async () => {
    const r = await saveList(lo, "  WA past clients  ", { relationship: "past_client", state: "WA" }, NOW);
    expect(r.ok).toBe(true);
    const id = r.ok ? r.list.id : "";
    const lists = await listsFor(lo);
    expect(lists.map((l) => l.name)).toEqual([...DEFAULT_LISTS.map((l) => l.name), "WA past clients"]);
    expect((await listById(lo, id))?.rule).toEqual({ relationship: "past_client", state: "WA" });
    expect(await listById(lo2, id)).toBeNull();
    expect((await renameList(lo2, id, "Mine now")).ok).toBe(false);
    expect((await deleteList(lo2, id)).ok).toBe(false);
    expect(await renameList(lo, id, "WA clients")).toEqual({ ok: true });
    expect((await listById(lo, id))?.name).toBe("WA clients");
    expect(await deleteList(lo, id)).toEqual({ ok: true });
    expect(await listById(lo, id)).toBeNull();
  });

  it("refuses a nameless or empty list, a repeated name, the built-in ones and more than the limit", async () => {
    expect(await saveList(lo, "", { state: "WA" })).toEqual({ ok: false, error: lc.nameFirst });
    expect(await saveList(lo, "All", {})).toEqual({ ok: false, error: lc.nothingToSave });
    expect(await saveList(lo, "Past clients", { state: "WA" })).toEqual({ ok: false, error: lc.sameName });
    expect(await saveList(lo, "Bad", { state: "Washington" })).toEqual({ ok: false, error: lc.failed });
    expect((await renameList(lo, "d-past", "X")).ok).toBe(false);
    expect((await deleteList(lo, "d-new")).ok).toBe(false);
    for (let i = 0; i < MAX_LISTS; i++) expect((await saveList(lo, `L${i}`, { addedWithinDays: 7, state: "WA", tagsAny: [`t${i}`] })).ok).toBe(true);
    expect(await saveList(lo, "One more", { state: "OR" })).toEqual({ ok: false, error: lc.tooManyLists(MAX_LISTS) });
  });

  it("is live: someone who fits later is in it", async () => {
    await seed();
    const r = await saveList(lo, "Spring", { tagsAny: ["Spring"] }, NOW);
    const list = r.ok ? r.list : null;
    expect((await peopleIn(lo, list!.rule, 100, NOW)).map((c) => c.firstName).sort()).toEqual(["Ann", "Dee"]);
    await contacts.put(base({ id: "c_hhhhhhhh", firstName: "Hal", tags: ["Spring"] }));
    expect((await peopleIn(lo, list!.rule, 100, NOW)).map((c) => c.firstName).sort()).toEqual(["Ann", "Dee", "Hal"]);
  });

  it("Neon: one row per list, the rule in the body, bound values", async () => {
    const calls: { text: string; params: unknown[] }[] = [];
    const neon = new NeonListStore(async (text, params = []) => (calls.push({ text, params }), []));
    await neon.put({ id: "lst_abcdefgh", userId: "lo1", name: "WA", rule: { state: "WA" }, createdAt: ago(0), updatedAt: ago(0) });
    const ins = calls.find((c) => /INSERT INTO cc_saved_lists/.test(c.text))!;
    expect(ins.params.slice(0, 3)).toEqual(["lst_abcdefgh", "lo1", "WA"]);
    expect(JSON.parse(ins.params[3] as string).rule).toEqual({ state: "WA" });
    await neon.forUser("lo1");
    expect(calls.at(-1)!.text).toMatch(/WHERE user_id = \$1/);
  });
});

describe("campaigns from a list or tag (D78)", () => {
  const rec = (first: string, phone: string, over: Partial<ImportRecord> = {}): ImportRecord => ({ firstName: first, lastName: "Lee", email: null, phone, phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: ["Spring"], notes: null, loan: null, agent: null, attestedOptIns: [], ...over });
  const sent: string[] = [];
  const quiet: Senders = { text: async (_a, c) => (sent.push(c), { ok: true }), email: async (_a, c) => (sent.push(c), { ok: true }) };
  async function textCampaign(over: Partial<Campaign> = {}) {
    const c = await createCampaign(lo, {}, NOW);
    const full: Campaign = { ...c, name: "Spring", purpose: "service", days: [0, 1, 2, 3, 4, 5, 6], hours: { start: 8, end: 20 }, steps: [{ id: "st_a", channel: "text", waitDays: 0, subject: "", body: "Hi {first}, it's {myFirst} with {company}. Checking in." }], status: "active", ...over };
    await campaigns.putCampaign(full);
    return full;
  }
  beforeEach(async () => {
    sent.length = 0;
    // Ann said yes to texts; Bo has nothing on file; Cy's file says stop.
    await importBatch(lo, "contacts", [rec("Ann", "+12065550101", { attestedOptIns: ["text"] }), rec("Bo", "+12065550102"), rec("Cy", "+12065550103", { attestedOptIns: ["text"], optOuts: { text: "f.csv column SMS Opt Out" } })], "f.csv", "personal", NOW);
    await importBatch(lo2, "contacts", [rec("Zed", "+12065550199", { attestedOptIns: ["text"] })], "g.csv", "personal", NOW);
  });
  const enrolledNames = async (cid: string) => Promise.all((await campaigns.enrollments(cid)).map(async (e) => (await contacts.get(e.contactId))!.firstName)).then((n) => n.sort());

  it("enroll by tag only enrolls the people the gate allows", async () => {
    const c = await textCampaign();
    const r = await enrollFrom(lo, c.id, { type: "tag", tag: "Spring" }, NOW);
    expect(r).toMatchObject({ added: 1, already: 0, noPermission: 2, notYours: 0 });
    expect(r!.topReason).toBeTruthy();
    expect(await enrolledNames(c.id)).toEqual(["Ann"]);
    // Again: Ann is already in it; nobody new.
    expect(await enrollFrom(lo, c.id, { type: "tag", tag: "Spring" }, NOW)).toMatchObject({ added: 0, already: 1, noPermission: 2 });
    // Another loan officer's campaign can't be used, and their book is never read.
    expect(await enrollFrom(lo2, c.id, { type: "tag", tag: "Spring" }, NOW)).toBeNull();
  });

  it("from a saved list, an import and a relationship, the same way", async () => {
    const c = await textCampaign();
    const saved = await saveList(lo, "Spring WA", { tagsAny: ["Spring"], state: "WA" }, NOW);
    expect(await enrollFrom(lo, c.id, { type: "list", id: saved.ok ? saved.list.id : "" }, NOW)).toMatchObject({ added: 1, noPermission: 2 });
    expect(await enrollFrom(lo2, c.id, { type: "list", id: saved.ok ? saved.list.id : "" }, NOW)).toBeNull();
    const c2 = await textCampaign();
    expect(await enrollFrom(lo, c2.id, { type: "rel", rel: "past_client" }, NOW)).toMatchObject({ added: 1, noPermission: 2 });
    const c3 = await textCampaign({ steps: [{ id: "st_t", channel: "task", waitDays: 0, subject: "", body: "Call {first}." }] });
    // A campaign of tasks only reaches the loan officer: everyone goes in.
    expect(await enrollFrom(lo, c3.id, { type: "rel", rel: "past_client" }, NOW)).toMatchObject({ added: 3, noPermission: 0 });
    expect(parseSource("list:d-past")).toEqual({ type: "list", id: "d-past" });
    expect(parseSource("tag:Spring")).toEqual({ type: "tag", tag: "Spring" });
    expect(parseSource("rel:boss")).toBeNull();
    expect(parseSource("imp:../x")).toBeNull();
  });

  it("a tag added on a page, in bulk or at import puts allowed people in a 'when I add this tag' campaign", async () => {
    const c = await textCampaign({ trigger: "tag_added", triggerTag: "Hot" });
    const [ann, bo] = await Promise.all(["Ann", "Bo"].map(async (n) => (await contacts.list({ ownerUserId: "lo1" })).contacts.find((x) => x.firstName === n)!));
    const { onTagsAdded } = await import("@/lib/campaigns/service");
    await setContactTags(lo, bo.id, ["Spring", "hot"], NOW);
    expect(await enrolledNames(c.id)).toEqual([]);
    await setContactTags(lo, ann.id, ["Spring", "hot"], NOW);
    expect(await enrolledNames(c.id)).toEqual(["Ann"]);
    // At import too (a new person with permission and the tag).
    await importBatch(lo, "contacts", [rec("Di", "+12065550104", { attestedOptIns: ["text"], tags: ["Hot"] })], "h.csv", "personal", NOW);
    expect(await enrolledNames(c.id)).toEqual(["Ann", "Di"]);
    expect(await onTagsAdded([{ contact: ann, added: ["Cold"] }], NOW, quiet)).toBe(0);
  });

  it("Add to campaign from the bulk bar: one person outside the book refuses all; the rule runs on the server", async () => {
    const c = await textCampaign();
    const all = (await contacts.list({})).contacts;
    const zed = all.find((x) => x.firstName === "Zed")!;
    const ann = all.find((x) => x.firstName === "Ann")!;
    expect(await bulkEnroll(lo, { ids: [ann.id, zed.id] }, c.id, NOW)).toEqual({ ok: false, error: "Some of those people aren't in your book, so nothing was changed." });
    expect(await campaigns.enrollments(c.id)).toHaveLength(0);
    const r = await bulkEnroll(lo, { rule: { tagsAny: ["Spring"] } }, c.id, NOW);
    expect(r).toMatchObject({ ok: true, report: { added: 1, noPermission: 2 } });
    // An assistant works the officer's book, but campaigns are the officer's own.
    expect(await bulkEnroll(asst, { ids: [ann.id] }, c.id, NOW)).toEqual({ ok: false, error: lc.noCampaign });
  });
});

describe("bulk actions (D78)", () => {
  beforeEach(seed);

  it("assign is refused for a loan officer or an assistant; owners and team leads move people and stop their campaigns", async () => {
    expect(await bulkAssign(lo, { ids: ["c_annaaaaa"] }, "lo2", NOW)).toEqual({ ok: false, error: lc.noAssign });
    expect(await bulkAssign(asst, { ids: ["c_annaaaaa"] }, "lo2", NOW)).toEqual({ ok: false, error: lc.noAssign });
    expect(await bulkAssign(owner, { ids: ["c_annaaaaa"] }, "as1", NOW)).toEqual({ ok: false, error: lc.badMember });
    const camp = await createCampaign(lo, {}, NOW);
    await campaigns.putEnrollment({ id: "en_1", campaignId: camp.id, ownerUserId: "lo1", contactId: "c_annaaaaa", status: "active", stepIndex: 0, nextAt: ago(0), startedAt: ago(0), endedAt: null, reason: "", log: [] });
    expect(await bulkAssign(owner, { ids: ["c_annaaaaa", "c_gooooooo"] }, "lo2", NOW)).toEqual({ ok: true, moved: 1, skipped: 1, name: "LO2" });
    expect((await contacts.get("c_annaaaaa"))!.ownerUserId).toBe("lo2");
    expect((await campaigns.getEnrollment("en_1"))!.status).toBe("stopped");
    // Consent stays with the person.
    expect(await contacts.consents("c_annaaaaa")).toHaveLength(1);
    // A team lead works their own book only: someone else's person refuses all.
    expect(await bulkAssign(lead, { ids: ["c_bobbbbbb"] }, "lo2", NOW)).toEqual({ ok: false, error: "Some of those people aren't in your book, so nothing was changed." });
  });

  it("the CSV is formula-safe and has no permission proof", async () => {
    const evil = base({ id: "c_evilevil", firstName: "=HYPERLINK(\"http://x\")", lastName: "@SUM(A1)", city: "+cmd|' /C calc'!A0", tags: ["-2+3", "VIP"], phone: "+12065550199", email: "e@x.com" });
    const csv = contactsCsv([{ contact: evil, summary: summarize([consent("c_evilevil", { proof: "signed form in drawer 3" })]) }]);
    const [head, row] = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(head).toBe("First name,Last name,Phone,Other phone,Email,Street,City,State,ZIP,Relationship,Brokerage,Tags,Can reach,Added");
    expect(row).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(row).toContain("'@SUM(A1)");
    expect(row).toContain(`,'+cmd|' /C calc'!A0,`);
    expect(row).toContain("'-2+3; VIP");
    // A phone number is a number, not a formula.
    expect(row).toContain(",+12065550199,");
    expect(csv).not.toContain("drawer 3");
    const r = await bulkCsv(lo, { rule: { tagsAny: ["Spring"] } }, NOW);
    expect(r.ok && r.count).toBe(2);
    expect((await bulkCsv(lo, { ids: ["c_annaaaaa", "c_gooooooo"] }, NOW)).ok).toBe(false);
  });

  it("delete needs DELETE, never an assistant, refuses all for one outside the book, and keeps the permission history", async () => {
    expect(await bulkDelete(asst, { ids: ["c_annaaaaa"] }, "DELETE", NOW)).toEqual({ ok: false, error: lc.noDelete });
    expect(await bulkDelete(lo, { ids: ["c_annaaaaa"] }, "delete", NOW)).toEqual({ ok: false, error: lc.typeDelete });
    expect((await bulkDelete(lo, { ids: ["c_annaaaaa", "c_gooooooo"] }, "DELETE", NOW)).ok).toBe(false);
    expect(await contacts.get("c_annaaaaa")).not.toBeNull();
    expect(await bulkDelete(lo, { ids: ["c_deeeeeee"] }, "DELETE", NOW)).toEqual({ ok: true, deleted: 1 });
    expect(await contacts.get("c_deeeeeee")).toBeNull();
    expect((await contacts.consents("c_deeeeeee")).some((e) => e.evidence === "revoked")).toBe(true);
  });

  it("an assistant's 'all matching' runs in the officer's book; the legacy D73 filter still works", async () => {
    const r = await resolveTarget(asst, { rule: { tagsAny: ["Spring"] } }, NOW);
    expect(r.ok && r.people.map((c) => c.firstName).sort()).toEqual(["Ann", "Dee"]);
    const l = await resolveTarget(lo, { filter: { kind: "contact", tag: "Spring" } }, NOW);
    expect(l.ok && l.people.length).toBe(2);
    expect((await resolveTarget(user("as2", "assistant", { assistsUserId: null }), { rule: {} }, NOW)).ok && 0).toBe(0);
  });

  it("Check do-not-call and phone type: the picked people or a list, all in the book or nobody", async () => {
    expect(checkScope({ ids: "c_annaaaaa,../etc,c_bobbbbbb" })).toBe("ids=c_annaaaaa,c_bobbbbbb");
    expect(checkScope({ scope: "list", tag: "Spring", perm: "on_file", junk: "x" })).toBe("scope=list&tag=Spring&perm=on_file");
    expect(checkScope({})).toBe("");
    expect((await scopePeople(lo, "ids=c_annaaaaa,c_bobbbbbb")).map((c) => c.firstName)).toEqual(["Ann", "Bo"]);
    expect(await scopePeople(lo, "ids=c_annaaaaa,c_gooooooo")).toEqual([]);
    expect((await scopePeople(lo, "scope=list&tag=Spring")).map((c) => c.firstName).sort()).toEqual(["Ann", "Dee"]);
  });

  it("a call session can start from a list (only its people with a phone)", async () => {
    const q = await listCallQueue(lo, { tagsAny: ["Spring"] }, "From your list", NOW);
    expect([...q.ready, ...q.blocked].map((x) => x.contact.firstName).sort()).toEqual(["Ann", "Dee"]);
    expect(q.blocked.find((x) => x.contact.firstName === "Dee")?.reason).toMatch(/stop/i);
    expect(q.total).toBe(2);
  });
});
