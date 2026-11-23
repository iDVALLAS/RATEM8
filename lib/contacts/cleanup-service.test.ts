import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryCampaignStore, setCampaignStoreForTests, campaignStore, type Enrollment } from "@/lib/campaigns/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryLeadEventStore, setLeadEventStoreForTests } from "@/lib/leads/events";
import { MemoryUsageStore, setUsageStoreForTests } from "@/lib/ai/meter";
import { MemoryImportStore, setImportStoreForTests } from "./imports";
import { MemoryContactStore, setContactStoreForTests, type ConsentEntry, type Contact } from "./store";
import { MemoryCleanupStore, NeonCleanupStore, setCleanupStoreForTests, cleanupStore } from "./cleanup-store";
import { approve, cleanupDigestLine, dismissWeek, homeCleanup, keepSeparate, mergePair, recentRuns, scanFor, skip, undoRun, weeklyScan } from "./cleanup-service";
import { checkGroups, groupLabels, groupMessage, labelsFor, type GroupCall } from "./cleanup-ai";
import { summarize } from "./service";

/** D88: the service around the rules: whole book, skips, the weekly scan, approve, undo, merges, books and M8. */

const user = (id: string, role: User["role"], extra: Partial<User> = {}): User => ({ id, email: `${id}@x.com`, name: id, role, mloId: "mlo-001", status: "active", createdAt: "2026-11-01T00:00:00Z", createdBy: "t", ...extra });
const lo = user("lo1", "lo");
const other = user("lo2", "lo");
const helper = user("as1", "assistant", { assistsUserId: "lo1" });
const NOW = new Date("2026-11-23T18:00:00Z");
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

let seq = 0;
const p = (over: Partial<Contact> = {}): Contact => {
  seq++;
  return {
    id: `c_${String(seq).padStart(5, "0")}`,
    ownerUserId: "lo1",
    kind: "contact",
    provenance: "personal",
    locked: false,
    source: "import: book.csv",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    firstName: `First${seq}`,
    lastName: `Last${seq}`,
    email: `person${seq}@example.com`,
    phone: `+1206555${String(1000 + (seq % 9000)).slice(-4)}`,
    phone2: null,
    street: null,
    city: null,
    state: "WA",
    zip: null,
    relationship: "past_client",
    tags: [],
    notes: null,
    loan: null,
    agent: null,
    ...over,
  };
};

let contacts: MemoryContactStore;
const put = async (...cs: Contact[]) => {
  for (const c of cs) await contacts.put(c);
  return cs;
};
const consentLog = async (ids: string[]) => JSON.stringify(await contacts.consentsFor(ids));

beforeEach(() => {
  seq = 0;
  contacts = new MemoryContactStore();
  setContactStoreForTests(contacts);
  setAccountStoreForTests(new MemoryAccountStore());
  setTouchStoreForTests(new MemoryTouchStore());
  setCampaignStoreForTests(new MemoryCampaignStore());
  setConciergeStoreForTests(new MemoryConciergeStore());
  setPipelineStoreForTests(new MemoryPipelineStore());
  setLeadEventStoreForTests(new MemoryLeadEventStore());
  setImportStoreForTests(new MemoryImportStore());
  setCleanupStoreForTests(new MemoryCleanupStore());
  setUsageStoreForTests(new MemoryUsageStore());
});
afterEach(() => {
  setContactStoreForTests(null);
  setAccountStoreForTests(null);
  setTouchStoreForTests(null);
  setCampaignStoreForTests(null);
  setConciergeStoreForTests(null);
  setPipelineStoreForTests(null);
  setLeadEventStoreForTests(null);
  setImportStoreForTests(null);
  setCleanupStoreForTests(null);
  setUsageStoreForTests(null);
});

describe("the whole book, and only the loan officer's own (D88)", () => {
  it("scans a 1,234-person book whole (one list call returns at most 500)", async () => {
    // Last names sort in id order; the variants and the duplicate sit past the first 500 by name.
    for (let i = 0; i < 1234; i++) await contacts.put(p({ lastName: `A${String(i).padStart(4, "0")}`, tags: i === 900 ? ["vip"] : i === 1230 ? ["V.I.P"] : i < 3 ? ["VIP"] : [] }));
    await put(p({ lastName: "Zz", firstName: "Dee", email: "person1100@example.com" }));
    const s = await scanFor(lo, NOW);
    expect(s!.read).toBe(1235);
    expect(s!.capped).toBe(false);
    const tags = s!.suggestions.find((x) => x.rule === "tags")!;
    expect(tags).toMatchObject({ target: "VIP", count: 2 });
    expect(s!.suggestions.find((x) => x.rule === "duplicates")!.pairs).toHaveLength(1);
  });

  it("an assistant scans and approves in the book of the officer they assist; another book is never read or changed", async () => {
    const [mine, theirs] = await put(p({ tags: ["vip"] }), p({ tags: ["vip"], ownerUserId: "lo2" }));
    await put(p({ tags: ["VIP"] }), p({ tags: ["VIP"] }), p({ tags: ["VIP"], ownerUserId: "lo2" }), p({ tags: ["VIP"], ownerUserId: "lo2" }));
    const s = await scanFor(helper, NOW);
    expect(s!.book).toBe("lo1");
    const g = s!.suggestions.find((x) => x.rule === "tags")!;
    expect(g.people).toEqual([mine.id]);
    // Ticking someone from another book does nothing to them.
    const r = await approve(helper, g.id, g.fingerprint, [mine.id, theirs.id], {}, NOW);
    expect(r).toMatchObject({ ok: true, changed: 1 });
    expect((await contacts.get(theirs.id))!.tags).toEqual(["vip"]);
    expect((await contacts.get(mine.id))!.tags).toEqual(["VIP"]);
    expect((await scanFor(other, NOW))!.suggestions.find((x) => x.rule === "tags")!.people).toEqual([theirs.id]);
    // An assistant with nobody to assist has no book.
    expect(await scanFor(user("as2", "assistant"), NOW)).toBeNull();
  });
});

describe("skip, approve and undo (D88)", () => {
  it("a skipped group stays hidden until the records in it change", async () => {
    const [, , v] = await put(p({ tags: ["VIP"] }), p({ tags: ["VIP"] }), p({ tags: ["vip"] }));
    const g = (await scanFor(lo, NOW))!.suggestions.find((x) => x.rule === "tags")!;
    expect(await skip(lo, g.id, "wrong", NOW)).toEqual({ ok: false, error: "changed" });
    expect(await skip(lo, g.id, g.fingerprint, NOW)).toEqual({ ok: true });
    let s = await scanFor(lo, NOW);
    expect(s!.suggestions.some((x) => x.rule === "tags")).toBe(false);
    expect(s!.skipped).toBe(1);
    // An unrelated edit (a note) doesn't bring it back; another spelling does.
    await contacts.put({ ...v, notes: "Called Tuesday" });
    expect((await scanFor(lo, NOW))!.suggestions.some((x) => x.rule === "tags")).toBe(false);
    await put(p({ tags: ["V.I.P"] }));
    s = await scanFor(lo, NOW);
    expect(s!.suggestions.find((x) => x.rule === "tags")!.count).toBe(2);
  });

  it("approve changes only the ticked people of the group, refuses a stale fingerprint, and undo puts them back without touching consent", async () => {
    const people = await put(p({ relationship: "lead", loan: { closedOn: "2024-01-02", amount: null, noteRate: null } }), p({ relationship: "lead", loan: { closedOn: "2024-03-04", amount: null, noteRate: null } }), p({ relationship: "lead", loan: { closedOn: "2024-05-06", amount: null, noteRate: null } }));
    const ids = people.map((c) => c.id);
    const stop: ConsentEntry = { contactId: ids[0], channel: "text", purpose: "marketing", granted: false, evidence: "revoked", proof: "STOP", at: "2026-02-01T00:00:00.000Z", actor: "inbound" };
    await contacts.addConsent(stop);
    await contacts.addConsent({ ...stop, contactId: ids[1], granted: true, evidence: "written", proof: "signed form", channel: "email" });
    const before = await consentLog(ids);
    const g = (await scanFor(lo, NOW))!.suggestions.find((x) => x.rule === "past_clients")!;
    expect(await approve(lo, g.id, "stale", [ids[0]], {}, NOW)).toEqual({ ok: false, error: "changed" });
    expect(await approve(lo, g.id, g.fingerprint, [], {}, NOW)).toEqual({ ok: false, error: "nobody" });
    const r = await approve(lo, g.id, g.fingerprint, [ids[0], ids[2]], {}, NOW);
    expect(r).toMatchObject({ ok: true, changed: 2 });
    expect((await contacts.getMany(ids)).map((c) => c.relationship).sort()).toEqual(["lead", "past_client", "past_client"]);
    // Someone edited one of them since: that edit wins.
    await contacts.put({ ...(await contacts.get(ids[2]))!, relationship: "sphere" });
    const run = (await recentRuns(lo))[0];
    expect(run).toMatchObject({ rule: "past_clients", count: 2, undoable: true, undone: null });
    expect(await undoRun(lo, run.id, "undo", later(1))).toEqual({ ok: false, error: "type" });
    expect(await undoRun(other, run.id, "UNDO", later(1))).toEqual({ ok: false, error: "gone" });
    expect(await undoRun(lo, run.id, "UNDO", later(31))).toEqual({ ok: false, error: "expired" });
    expect(await undoRun(lo, run.id, "UNDO", later(1))).toEqual({ ok: true, restored: 1, kept: 1 });
    expect(await undoRun(lo, run.id, "UNDO", later(1))).toEqual({ ok: false, error: "undone" });
    expect((await contacts.getMany(ids)).map((c) => [c.id, c.relationship]).sort()).toEqual([[ids[0], "lead"], [ids[1], "lead"], [ids[2], "sphere"]]);
    // The consent log is exactly as it was: nothing added, nothing changed, the stop still the answer.
    expect(await consentLog(ids)).toBe(before);
    expect(summarize(await contacts.consents(ids[0])).text.marketing.evidence).toBe("revoked");
  });

  it("a lead-source group needs a typed source; a move to Agents ends the person's campaigns and is undone whole", async () => {
    const [a, b] = await put(p({ provenance: "lead_vendor", relationship: "lead", importId: "imp_9" }), p({ relationship: "sphere", tags: ["Realtor"] }));
    const s = (await scanFor(lo, NOW))!;
    const src = s.suggestions.find((x) => x.rule === "lead_no_source")!;
    expect(await approve(lo, src.id, src.fingerprint, null, { leadSource: "  " }, NOW)).toEqual({ ok: false, error: "source" });
    expect(await approve(lo, src.id, src.fingerprint, null, { leadSource: "Bankrate" }, NOW)).toMatchObject({ ok: true, changed: 1 });
    expect((await contacts.get(a.id))!.leadSource).toBe("Bankrate");
    const e: Enrollment = { id: "en1", campaignId: "camp1", ownerUserId: "lo1", contactId: b.id, status: "active", stepIndex: 0, nextAt: NOW.toISOString(), startedAt: NOW.toISOString(), endedAt: null, reason: "", log: [] };
    await campaignStore().putEnrollment(e);
    const ag = (await scanFor(lo, NOW))!.suggestions.find((x) => x.rule === "agents")!;
    expect(await approve(lo, ag.id, ag.fingerprint, null, {}, NOW)).toMatchObject({ ok: true, changed: 1 });
    expect((await contacts.get(b.id))!).toMatchObject({ kind: "agent", relationship: "agent" });
    expect(await campaignStore().activeForContact(b.id)).toEqual([]);
    expect((await campaignStore().getEnrollment("en1"))!).toMatchObject({ status: "stopped", reason: "Moved to Agents." });
    const run = (await recentRuns(lo)).find((r) => r.rule === "agents")!;
    expect(run.ended).toBe(1);
    expect(await undoRun(lo, run.id, "UNDO", later(2))).toMatchObject({ ok: true, restored: 1 });
    expect((await contacts.get(b.id))!).toMatchObject({ kind: "contact", relationship: "sphere" });
    // A campaign that ended stays ended.
    expect((await campaignStore().getEnrollment("en1"))!.status).toBe("stopped");
  });
});

describe("duplicates go through D77's merge (D88)", () => {
  it("merges a listed pair (a stop on either stays, both histories kept), keeps another pair separate, and refuses pairs it didn't list", async () => {
    const [keep, drop, x, y, z] = await put(p({ firstName: "Ann", email: "ann@x.com" }), p({ firstName: "Ann", email: "ann@x.com", phone: null }), p({ firstName: "Rob", phone: "+12065550101" }), p({ firstName: "Robert", phone: "+12065550101" }), p({ firstName: "Zed" }));
    await contacts.addConsent({ contactId: drop.id, channel: "email", purpose: "marketing", granted: false, evidence: "revoked", proof: "unsubscribed", at: "2026-03-01T00:00:00.000Z", actor: "inbound" });
    const dup = (await scanFor(lo, NOW))!.suggestions.find((s) => s.rule === "duplicates")!;
    expect(dup.pairs).toHaveLength(2);
    expect(await approve(lo, dup.id, dup.fingerprint, null, {}, NOW)).toEqual({ ok: false, error: "merge_only" });
    expect(await mergePair(lo, keep.id, z.id, NOW)).toEqual({ ok: false, error: "changed" });
    expect(await mergePair(other, keep.id, drop.id, NOW)).toEqual({ ok: false, error: "changed" });
    const m = await mergePair(lo, keep.id, drop.id, NOW);
    expect(m).toMatchObject({ ok: true, keptId: keep.id });
    expect(await contacts.get(drop.id)).toBeNull();
    const log = await contacts.consents(keep.id);
    expect(log.some((e) => e.mergedFrom === drop.id && e.evidence === "revoked")).toBe(true);
    expect(summarize(log).email.marketing.evidence).toBe("revoked");
    expect((await contacts.get(keep.id))!.mergedFrom?.[0].id).toBe(drop.id);
    expect((await recentRuns(lo))[0]).toMatchObject({ rule: "duplicates", undoable: false });
    expect(await undoRun(lo, (await recentRuns(lo))[0].id, "UNDO", NOW)).toEqual({ ok: false, error: "merge" });
    // Keep separate: the other pair never comes back.
    expect(await keepSeparate(other, x.id, y.id, NOW)).toEqual({ ok: false });
    expect(await keepSeparate(lo, x.id, y.id, NOW)).toEqual({ ok: true });
    expect((await scanFor(lo, NOW))!.suggestions.some((s) => s.rule === "duplicates")).toBe(false);
  });
});

describe("the weekly scan, Home and the morning email (D88)", () => {
  it("scans once per ISO week, even when two runs start at once", async () => {
    await put(p({ tags: ["VIP"] }), p({ tags: ["vip"] }));
    const first = await Promise.all([weeklyScan(lo, NOW), weeklyScan(lo, NOW), weeklyScan(lo, later(1))]);
    expect(first.filter((x) => x === "scanned")).toHaveLength(1);
    expect(await weeklyScan(lo, later(5))).toBe("skipped"); // Saturday, same week
    expect(await weeklyScan(lo, later(7))).toBe("scanned"); // next Monday
    expect(await weeklyScan(helper, later(14))).toBe("skipped"); // the officer's book is scanned for them
    expect((await cleanupStore().state("lo1")).scan).toMatchObject({ count: 1, people: 1, byRule: { tags: 1 } });
  });

  it("Home shows the count until hidden for the week, and the email carries one line of counts only", async () => {
    await put(p({ firstName: "Secretname", tags: ["VIP"] }), p({ tags: ["vip"] }), p({ firstName: "", lastName: "" }));
    expect(await homeCleanup(lo, NOW)).toEqual({ count: 0, people: 0, due: "weekly" });
    await weeklyScan(lo, NOW);
    expect(await homeCleanup(lo, NOW)).toEqual({ count: 2, people: 2, due: null });
    expect(await homeCleanup(helper, NOW)).toMatchObject({ count: 2 });
    const line = await cleanupDigestLine(lo, "https://example.com/mlo/contacts/cleanup", NOW);
    expect(line).toBe("Clean up your contacts: 2 suggestions. https://example.com/mlo/contacts/cleanup");
    expect(line).not.toMatch(/Secretname|vip/i);
    await dismissWeek(lo, NOW);
    expect((await homeCleanup(lo, NOW))!.count).toBe(0);
    expect((await homeCleanup(helper, NOW))!.count).toBe(2);
    expect(await cleanupDigestLine(lo, "u", NOW)).toBe("");
    // Next week it shows again (after that week's scan).
    await weeklyScan(lo, later(7));
    expect((await homeCleanup(lo, later(7)))!.count).toBe(2);
  });
});

describe("M8 groups labels only (D88)", () => {
  it("sends only labels and counts in nonce blocks, never names, phones, emails, notes or agents' tags", async () => {
    await put(
      p({ firstName: "Marisol", lastName: "Quintero", email: "marisol@private.com", phone: "+12065550142", notes: "Gate code 4421", tags: ["VIP clients"], leadSource: "Open house leads" }),
      p({ tags: ["VIP"], leadSource: "Open houses" }),
      p({ tags: ["VIP", "Seniors"] }),
      p({ kind: "agent", relationship: "agent", tags: ["RETR top 100"] }),
    );
    let seen: { system: string; user: string } | null = null;
    const call: GroupCall = async ({ system, user: u }) => {
      seen = { system, user: u };
      return { input: { groups: [{ kind: "tag", labels: ["VIP clients", "VIP"], keep: "VIP" }, { kind: "source", labels: ["Open house leads", "Open houses"], keep: "Open houses" }, { kind: "tag", labels: ["VIP", "Made up"], keep: "VIP" }] }, stop: "tool_use" };
    };
    const r = await groupLabels(lo, { call, nonce: "dabc", now: NOW });
    expect(r).toEqual({ ok: true, groups: 2 });
    const msg = seen!.user;
    for (const secret of ["Marisol", "Quintero", "marisol@private.com", "2065550142", "Gate code", "RETR", "Seniors", "c_0000"]) expect(msg).not.toContain(secret);
    expect(msg).toContain('<data-dabc kind="tag" count="2">VIP</data-dabc>');
    expect(msg).toContain('<data-dabc kind="tag" count="1">VIP clients</data-dabc>');
    expect(msg).toContain('<data-dabc kind="source" count="1">Open house leads</data-dabc>');
    // Every line is the rule, a heading or one label block.
    for (const l of msg.split("\n").slice(1)) expect(l).toMatch(/^(Tags|Lead sources) \(name and how many people carry it\):$|^\d+\. <data-dabc kind="(tag|source)" count="\d+">[^<]*<\/data-dabc>$/);
    // The groups come back as suggestions marked as M8's; nothing changed until approved.
    const s = (await scanFor(lo, NOW))!.suggestions;
    expect(s.find((x) => x.rule === "tags" && x.ai)).toMatchObject({ target: "VIP", variants: [{ label: "VIP clients", count: 1 }] });
    expect(s.find((x) => x.rule === "sources" && x.ai)).toMatchObject({ target: "Open houses" });
    expect((await contacts.list({ ownerUserId: "lo1", tag: "VIP clients" })).total).toBe(1);
  });

  it("checks the answer, and falls back to the rules without a key", async () => {
    const labels = labelsFor([p({ tags: ["A one"] }), p({ tags: ["A two"] }), p({ leadSource: "Fair" })], new Set());
    expect(checkGroups({ groups: [{ kind: "tag", labels: ["A one", "A two"], keep: "A one" }] }, labels)).toEqual([{ kind: "tag", labels: ["A one", "A two"], keep: "A one" }]);
    expect(checkGroups({ groups: [{ kind: "source", labels: ["A one", "A two"], keep: "A one" }] }, labels)).toEqual([]);
    expect(checkGroups({ groups: [{ kind: "tag", labels: ["A one", "A two"], keep: "A three" }] }, labels)).toEqual([]);
    expect(checkGroups({ groups: [{ kind: "tag", labels: ["A one", "A two"], keep: "A one", extra: 1 }] }, labels)).toEqual([]);
    expect(checkGroups("nonsense", labels)).toEqual([]);
    expect(groupMessage(labels, "dq").split("\n")[0]).toContain("<data-dq>");
    await put(p({ tags: ["A one"] }), p({ tags: ["A two"] }));
    expect(await groupLabels(lo, { call: null, now: NOW })).toMatchObject({ ok: false, reason: "off" });
    expect(await groupLabels(user("as2", "assistant"), { call: null })).toEqual({ ok: false, reason: "book" });
  });
});

describe("the Neon store binds every value (D88)", () => {
  it("writes and claims with parameters only", async () => {
    const seen: { text: string; params: unknown[] }[] = [];
    const s = new NeonCleanupStore(async (text, params = []) => {
      seen.push({ text, params });
      return /RETURNING/.test(text) ? [{ ok: 1 }] : [];
    });
    expect(await s.claimWeek("lo1", "2026-W48", NOW.toISOString())).toBe(true);
    await s.addSkip("lo1", { id: "tags:vip'; DROP TABLE x;--", fp: "f", at: "a", by: "b" });
    await s.dismiss("lo1", "u1", "2026-W48");
    await s.addSeparate("lo1", "a|b");
    for (const q of seen) expect(q.text).not.toMatch(/DROP TABLE|lo1|2026-W48|a\|b|u1/);
    expect(seen.some((q) => q.params.includes("2026-W48"))).toBe(true);
    expect(seen.some((q) => q.params.some((x) => typeof x === "string" && x.includes("DROP TABLE")))).toBe(true);
  });
});
