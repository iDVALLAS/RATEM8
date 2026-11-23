import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryContactStore, setContactStoreForTests, type Contact } from "@/lib/contacts/store";
import { importBatch } from "@/lib/contacts/service";
import { mergeContacts } from "@/lib/contacts/manage";
import { deleteContact } from "@/lib/contacts/service";
import { MemoryImportStore, setImportStoreForTests, startImport, undoImport } from "@/lib/contacts/imports";
import { buildRecords, autoMap } from "@/lib/contacts/mapping";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, accountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryPipelineStore, setPipelineStoreForTests, type Loan } from "@/lib/pipeline/store";
import { MemoryExpenseStore, NeonExpenseStore, setExpenseStoreForTests } from "@/lib/expenses/store";
import { saveEntry, tellM8, yearSummary } from "@/lib/expenses/service";
import { parseLine, parseText } from "@/lib/expenses/parse";
import { buildExport } from "@/lib/export/service";
import { snapshot } from "@/lib/agents/business";
import { SPONSOR } from "@/config/licensing";
import { ingestLead, readLead } from "./intake";
import { eventId, MemoryLeadEventStore, NeonLeadEventStore, setLeadEventStoreForTests } from "./events";
import { importDate, planLeadEvents } from "./backfill";
import { HISTORY_MARK, syncLeadEvents } from "./sync";
import { guessLeadSource, SPHERE_KEY, sourceKey, sourceLabel, VENDOR_FILE_KEY, WEB_FORM_KEY } from "./source-key";
import { sourceOptions } from "./sources";
import { MemoryMonthlyStore, makeMonthlyDrafts, monthlyDraftId, removeMonthly, setMonthly, setMonthlyStoreForTests } from "./spend";
import { hasRealLeads, isRealLead } from "./mode";
import { findRateMentions } from "@/lib/m8/guard";
import { LEADS, LEAD_SPEND } from "@/lib/content/cc-pages";

/** D83: lead spend tagged by source, and a lead-event log. */

const NOW = new Date("2026-11-22T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const other: User = { ...me, id: "lo2", email: "lo2@x.com" };
const assistant: User = { ...me, id: "as1", email: "as1@x.com", role: "assistant", assistsUserId: "lo1" };
const namesUs = `By submitting, I agree that ${SPONSOR.dba} may call and text me at the number provided, including by autodialer, about mortgage products. Consent isn't required to buy.`;
const partnersOnly = "By submitting, I agree that our partners and up to 5 lenders may call and text me at the number provided about mortgage products.";
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe("one key per lead source (D83)", () => {
  it("normalizes names to one lowercase slug, with aliases for the named sources", () => {
    for (const z of ["Zillow", "zillow", " ZILLOW ", "Zillow.com", "Zillow Premier Agent", "zillow leads", "lead: Zillow"]) expect(sourceKey(z), z).toBe("zillow");
    for (const t of ["LendingTree", "Lending Tree", "lending-tree", "LendingTree - refi"]) expect(sourceKey(t), t).toBe("lendingtree");
    expect(sourceKey("Bankrate")).toBe("bankrate");
    expect(sourceKey("Lower My Bills")).toBe("lowermybills");
    for (const g of ["Google Ads", "AdWords", "google-ads"]) expect(sourceKey(g), g).toBe("google-ads");
    for (const m of ["Meta", "Facebook", "Facebook Lead Ads", "Instagram"]) expect(sourceKey(m), m).toBe("meta");
    for (const w of ["Your web form", "Website", "web form", "Contact form"]) expect(sourceKey(w), w).toBe(WEB_FORM_KEY);
    expect(sourceKey("My Local Vendor!")).toBe("my-local-vendor");
    expect(sourceKey("")).toBe("");
    expect(sourceKey(null)).toBe("");
    expect(sourceKey("x".repeat(80))).toHaveLength(30);
    // A key read again is the same key (the picker sends keys).
    for (const k of ["zillow", "google-ads", "meta", SPHERE_KEY, WEB_FORM_KEY, VENDOR_FILE_KEY, "my-local-vendor"]) expect(sourceKey(k), k).toBe(k);
  });

  it("sends referral, past-client and sphere values to Past clients & sphere (decision 5)", () => {
    for (const v of ["Referral", "referrals", "Client referral", "Agent Referral", "Past client", "Past Clients", "Sphere", "SOI", "Sphere of influence", "Friends & family", "Family", "Word of mouth", "Repeat client", "Past clients & sphere"]) expect(sourceKey(v), v).toBe(SPHERE_KEY);
    expect(sourceLabel(SPHERE_KEY)).toBe("Past clients & sphere");
    expect(sourceLabel(WEB_FORM_KEY)).toBe("Your web form");
    expect(sourceLabel("zillow", "zillow")).toBe("Zillow");
    expect(sourceLabel("my-local-vendor", "My Local Vendor")).toBe("My Local Vendor");
    expect(sourceLabel("my-local-vendor")).toBe("My local vendor");
  });

  it("the picker lists seen sources and connection labels (not the default ones), then sphere and web form", () => {
    const opts = sourceOptions([{ sourceKey: "zillow", sourceLabel: "Zillow" }, { sourceKey: "lendingtree", sourceLabel: "LendingTree" }, { sourceKey: SPHERE_KEY, sourceLabel: "Referral" }, { sourceKey: VENDOR_FILE_KEY, sourceLabel: "Lead vendor file" }], ["Zillow", "Lead vendor", "Loan system", "ARIVE", "Dialer", "Bankrate feed"], ["meta", null]);
    expect(opts).toEqual([
      { key: "bankrate", label: "Bankrate" },
      { key: "lendingtree", label: "LendingTree" },
      { key: "meta", label: "Meta" },
      { key: "zillow", label: "Zillow" },
      { key: SPHERE_KEY, label: "Past clients & sphere" },
      { key: WEB_FORM_KEY, label: "Your web form" },
    ]);
  });
});

describe("lead spend on expenses (D83)", () => {
  let store: MemoryExpenseStore;
  beforeEach(() => {
    store = new MemoryExpenseStore();
    setExpenseStoreForTests(store);
    setAccountStoreForTests(new MemoryAccountStore());
    setMonthlyStoreForTests(new MemoryMonthlyStore());
  });
  afterEach(() => {
    setExpenseStoreForTests(null);
    setAccountStoreForTests(null);
    setMonthlyStoreForTests(null);
  });

  it("the parser pre-selects a named vendor on lead spend only", () => {
    const t = "2026-11-22";
    expect(parseLine("Zillow leads $1,200", t)).toMatchObject({ category: "advertising", leadSource: "zillow" });
    expect(parseLine("LendingTree $450 for leads", t)).toMatchObject({ category: "advertising", leadSource: "lendingtree" });
    expect(parseLine("Bankrate $300", t)).toMatchObject({ category: "advertising", leadSource: "bankrate" });
    expect(parseLine("LowerMyBills $250", t)).toMatchObject({ category: "advertising", leadSource: "lowermybills" });
    expect(parseLine("Google Ads $600", t)).toMatchObject({ category: "advertising", leadSource: "google-ads" });
    expect(parseLine("Facebook ads $200", t)).toMatchObject({ category: "advertising", leadSource: "meta" });
    expect(parseLine("postcards $220", t)).toMatchObject({ category: "advertising", leadSource: null });
    // Not lead spend: no source, even when a vendor is named.
    expect(parseLine("$84 lunch at the Zillow office", t)).toMatchObject({ category: "meals", leadSource: null });
    expect(parseText("Zillow $1,200; drove 12 mi to an appraisal", t).map((d) => d.leadSource)).toEqual(["zillow", null]);
    expect(guessLeadSource("nothing here")).toBeNull();
  });

  it("M8's drafts pre-select it too, and the loan officer's pick is what's saved", async () => {
    const call = async () => ({ json: JSON.stringify({ items: [{ kind: "expense", date: "2026-11-20", amount: 450, miles: 0, vendor: "Bankrate", category: "advertising", businessPct: 100, purpose: "November leads", recipient: "" }, { kind: "expense", date: "2026-11-20", amount: 60, miles: 0, vendor: "Daniel's", category: "meals", businessPct: 100, purpose: "Lunch with an agent", recipient: "" }] }), stop: "end_turn" });
    expect(await tellM8(me, "Bankrate 450 and lunch 60", { now: NOW, call })).toMatchObject({ ok: true, drafts: 2, by: "m8" });
    const drafts = await store.list(me.id, null);
    expect(drafts.find((d) => d.vendor === "Bankrate")).toMatchObject({ status: "draft", leadSource: "bankrate" });
    expect(drafts.find((d) => d.vendor === "Daniel's")).toMatchObject({ leadSource: null });
    const d = drafts.find((x) => x.vendor === "Bankrate")!;
    // Confirmed as "Other…": the typed name becomes a key.
    const base = { kind: "expense", date: "2026-11-20", dollars: 450, miles: 0, vendor: "Bankrate", category: "advertising", businessPct: 100, purpose: "Leads", recipient: "" };
    expect(await saveEntry(me, d.id, { ...base, leadSource: "Rate Shop Co" }, NOW)).toEqual({ ok: true });
    expect(await store.get(me.id, d.id)).toMatchObject({ status: "confirmed", leadSource: "rate-shop-co" });
    // "Not lead spend" clears it; a category that can't be lead spend drops it.
    await saveEntry(me, d.id, { ...base, leadSource: "" }, NOW);
    expect((await store.get(me.id, d.id))!.leadSource).toBeNull();
    await saveEntry(me, d.id, { ...base, category: "meals", leadSource: "zillow" }, NOW);
    expect((await store.get(me.id, d.id))!.leadSource).toBeNull();
    // Closing gifts and card postage can be tagged Past clients & sphere (owner decision 3).
    await saveEntry(me, null, { ...base, vendor: "Thanks.io", category: "office", purpose: "Cards to past clients", leadSource: SPHERE_KEY }, NOW);
    await saveEntry(me, null, { ...base, dollars: 25, vendor: "Gift shop", category: "gifts", purpose: "Closing gift", recipient: "Ann", leadSource: SPHERE_KEY }, NOW);
    expect((await store.list(me.id, null)).filter((e) => e.leadSource === SPHERE_KEY)).toHaveLength(2);
  });

  it("a monthly amount makes one draft per source per month, never posted, never remade once deleted", async () => {
    expect(await setMonthly(me, "Zillow", 1200, NOW)).toEqual({ ok: true, key: "zillow", label: "Zillow", drafts: 1 });
    expect(await setMonthly(me, "Referral", 150, NOW)).toMatchObject({ ok: true, key: SPHERE_KEY, label: "Past clients & sphere", drafts: 1 });
    expect(await makeMonthlyDrafts(me, NOW)).toBe(0);
    expect(await makeMonthlyDrafts(me, later(2))).toBe(0);
    let all = await store.list(me.id, null);
    expect(all.map((e) => [e.source, e.status, e.leadSource, e.amountCents, e.date, e.category])).toEqual(
      expect.arrayContaining([
        ["monthly", "draft", "zillow", 120000, "2026-11-01", "advertising"],
        ["monthly", "draft", SPHERE_KEY, 15000, "2026-11-01", "advertising"],
      ]),
    );
    expect(all).toHaveLength(2);
    // Drafts never count until confirmed.
    expect((await yearSummary(me, 2026)).expenseCents).toBe(0);
    // Deleted this month: not made again; next month: a new one.
    await store.remove(me.id, monthlyDraftId(me.id, "zillow", "2026-11"));
    expect(await makeMonthlyDrafts(me, later(3))).toBe(0);
    expect(await makeMonthlyDrafts(me, new Date("2026-12-02T18:00:00Z"))).toBe(2);
    all = await store.list(me.id, null);
    expect(all.filter((e) => e.date === "2026-12-01").map((e) => e.status)).toEqual(["draft", "draft"]);
    // Changing the amount doesn't make a second draft for the month.
    expect(await setMonthly(me, "zillow", 1500, new Date("2026-12-05T18:00:00Z"))).toMatchObject({ drafts: 0 });
    await removeMonthly(me, "zillow");
    expect(await makeMonthlyDrafts(me, new Date("2027-01-03T18:00:00Z"))).toBe(1);
    // Bad input, and assistants (no spend).
    expect(await setMonthly(me, "  ", 100, NOW)).toEqual({ ok: false, error: "source" });
    expect(await setMonthly(me, "Zillow", 0.5, NOW)).toEqual({ ok: false, error: "amount" });
    expect(await setMonthly(me, "Zillow", 200_000, NOW)).toEqual({ ok: false, error: "amount" });
    expect(await setMonthly(assistant, "Zillow", 100, NOW)).toEqual({ ok: false, error: "assistant" });
    expect(await makeMonthlyDrafts(other, NOW)).toBe(0);
    expect(await store.list(other.id, null)).toEqual([]);
  });

  it("the Neon store adds the lead_source column to existing tables and binds it as a parameter", async () => {
    const seen: { text: string; params?: unknown[] }[] = [];
    const s = new NeonExpenseStore(async (text, params) => {
      seen.push({ text, params });
      return [];
    });
    await s.put({ id: "x_1", ownerUserId: "lo1", kind: "expense", date: "2026-11-20", amountCents: 100, miles: null, vendor: "Zillow'; DROP TABLE x;--", category: "advertising", businessPct: 100, purpose: "p", recipient: null, receiptId: null, source: "typed", leadSource: "zillow", status: "draft", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    expect(seen.some((q) => q.text === "ALTER TABLE cc_expenses ADD COLUMN IF NOT EXISTS lead_source text")).toBe(true);
    const ins = seen.find((q) => q.text.startsWith("INSERT INTO cc_expenses"))!;
    expect(ins.text).toContain("lead_source = EXCLUDED.lead_source");
    expect(ins.text).not.toContain("DROP");
    expect(ins.params).toContain("zillow");
  });
});

describe("the lead-event log (D83)", () => {
  let contacts: MemoryContactStore;
  let events: MemoryLeadEventStore;
  let pipeline: MemoryPipelineStore;
  beforeEach(() => {
    contacts = new MemoryContactStore();
    events = new MemoryLeadEventStore();
    pipeline = new MemoryPipelineStore();
    setContactStoreForTests(contacts);
    setLeadEventStoreForTests(events);
    setPipelineStoreForTests(pipeline);
    setAccountStoreForTests(new MemoryAccountStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setExpenseStoreForTests(new MemoryExpenseStore());
    setMonthlyStoreForTests(new MemoryMonthlyStore());
    setImportStoreForTests(new MemoryImportStore());
  });
  afterEach(() => {
    for (const f of [setContactStoreForTests, setLeadEventStoreForTests, setPipelineStoreForTests, setAccountStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setExpenseStoreForTests, setMonthlyStoreForTests, setImportStoreForTests]) f(null);
  });

  it("writes one event per delivery, flags repeats, freezes whether that delivery named you, and skips webhook retries", async () => {
    const a = await ingestLead(me, readLead({ lead_id: "Z-1", first_name: "Ann", phone: "2065551234", consent_text: namesUs }, "Zillow")!, NOW);
    // The same lead sent again by the vendor (a retry): no new event.
    await ingestLead(me, readLead({ lead_id: "Z-1", first_name: "Ann", phone: "2065551234", consent_text: namesUs }, "zillow")!, later(0.01));
    // LendingTree sends Ann too, with wording that names only partners: a repeat that doesn't name you, though Ann's permission stays on file.
    await ingestLead(me, readLead({ lead_id: "Z-1", first_name: "Ann", phone: "2065551234", consent_text: partnersOnly }, "Lending Tree")!, later(0.02));
    // A second Zillow lead with no id, twice: two deliveries.
    await ingestLead(me, readLead({ first_name: "Bo", email: "bo@example.com" }, "zillow")!, later(0.03));
    await ingestLead(me, readLead({ first_name: "Bo", email: "bo@example.com" }, "zillow")!, later(0.04));
    const log = await events.list(me.id);
    expect(log.map((e) => [e.sourceKey, e.duplicate, e.namesYou, e.externalId, e.origin])).toEqual([
      ["zillow", false, true, "Z-1", "delivery"],
      ["lendingtree", true, false, "Z-1", "delivery"],
      ["zillow", false, false, null, "delivery"],
      ["zillow", true, false, null, "delivery"],
    ]);
    expect(log[0]).toMatchObject({ contactId: a.contactId, sourceLabel: "Zillow", datedBy: "delivery", id: eventId(me.id, a.contactId, NOW.toISOString()) });
    expect(log[1].sourceLabel).toBe("LendingTree");
    // The tag uses the same key; the audit row says which event it wrote.
    expect((await contacts.get(a.contactId))!.tags).toEqual(expect.arrayContaining(["lead:zillow", "lead:lendingtree"]));
    const audit = await accountStore().auditFor("lead.inbound", me.id, 10);
    expect(audit.map((x) => x.detail.event)).toEqual([log[0].id, null, log[1].id, log[2].id, log[3].id]);
    // No personal data in an event.
    expect(JSON.stringify(log)).not.toMatch(/Ann|Bo\b|206555|example\.com|partners/);
    expect(hasRealLeads({ contacts: [], leadEvents: log.length })).toBe(true);
  });

  it("backfills the log before D83 once: every audited delivery (repeats too), then lead: contacts the audit misses", async () => {
    const put = async (c: Partial<Contact> & { id: string }) => contacts.put({ ownerUserId: me.id, kind: "contact", provenance: "lead_vendor", locked: false, source: "lead: Zillow", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), firstName: "X", lastName: "", email: null, phone: null, phone2: null, street: null, city: null, state: null, zip: null, relationship: "lead", tags: [], notes: null, loan: null, agent: null, ...c });
    await put({ id: "c_ann", createdAt: "2026-10-01T10:00:00.000Z" });
    await put({ id: "c_kept", createdAt: "2026-10-03T10:00:00.000Z", source: "lead: lendingtree", mergedFrom: [{ id: "c_gone", name: "Old", at: "2026-10-05T00:00:00.000Z" }] });
    await put({ id: "c_noaudit", createdAt: "2026-09-01T10:00:00.000Z", source: "lead: Bankrate" });
    await contacts.addConsent({ contactId: "c_noaudit", channel: "call", purpose: "marketing", granted: true, evidence: "web_form", proof: "form", at: "2026-09-01T10:00:00.000Z", actor: "lead:Bankrate" });
    await contacts.addConsent({ contactId: "c_ann", channel: "text", purpose: "marketing", granted: true, evidence: "written", proof: "later", at: "2026-10-02T10:00:00.000Z", actor: "lo1@x.com" });
    const acc = accountStore();
    await acc.audit({ at: "2026-10-01T10:00:00.000Z", actor: "lead:Zillow", action: "lead.inbound", detail: { owner: me.id, contactId: "c_ann", created: true, permission: "none" } });
    await acc.audit({ at: "2026-10-02T09:00:00.000Z", actor: "lead:zillow", action: "lead.inbound", detail: { owner: me.id, contactId: "c_ann", created: false, permission: "recorded" } });
    await acc.audit({ at: "2026-10-04T09:00:00.000Z", actor: "lead:LendingTree", action: "lead.inbound", detail: { owner: me.id, contactId: "c_gone", created: true, permission: "not_naming_us" } });
    await acc.audit({ at: "2026-10-04T09:00:00.000Z", actor: "lead:Zillow", action: "lead.inbound", detail: { owner: other.id, contactId: "c_zed", created: true, permission: "recorded" } });
    const r = await syncLeadEvents(me, { now: NOW });
    expect(r.added).toBe(5);
    expect(r.events.map((e) => [e.contactId, e.sourceKey, e.at.slice(0, 10), e.duplicate, e.namesYou, e.origin])).toEqual([
      ["c_noaudit", "bankrate", "2026-09-01", false, true, "history"],
      ["c_ann", "zillow", "2026-10-01", false, false, "history"],
      ["c_ann", "zillow", "2026-10-02", true, true, "history"],
      ["c_kept", "lendingtree", "2026-10-03", false, false, "history"],
      ["c_kept", "lendingtree", "2026-10-04", false, false, "history"],
    ]);
    expect(await events.marked(me.id, HISTORY_MARK)).toBe(true);
    // Safe to run twice, and a second run doesn't rebuild history (an audit row added later isn't replayed).
    await acc.audit({ at: "2026-10-06T09:00:00.000Z", actor: "lead:Zillow", action: "lead.inbound", detail: { owner: me.id, contactId: "c_ann", created: false, permission: "none" } });
    expect((await syncLeadEvents(me, { now: NOW })).added).toBe(0);
    expect(await events.count(me.id)).toBe(5);
    expect(await events.count(other.id)).toBe(0);
  });

  it("imported leads: one event each with a Lead source (or a lead-vendor file), dated by the file (decision 5), referral values to sphere", async () => {
    const rec = (first: string, extra: Record<string, unknown> = {}) => ({ firstName: first, lastName: "Lee", email: `${first.toLowerCase()}@example.com`, phone: null, phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...extra });
    const past = await startImport(me, { kind: "contacts", files: ["Past clients.xlsx"], provenance: "personal", mode: "fill", tags: [] }, NOW);
    await importBatch(me, "contacts", [
      rec("Ann", { leadSource: "Referral", loan: { closedOn: "2021-06-15", amount: 400000, noteRate: null } }),
      rec("Bo", { leadSource: "Zillow", loan: { closedOn: "2022-03-02", appliedOn: "2022-01-10", amount: null, noteRate: null } }),
      rec("Cy", { leadSource: "Sphere" }),
      rec("Di"),
      rec("Ed", { leadSource: "LendingTree", attestedOptIns: ["text", "call"] }),
    ], "Past clients.xlsx", "personal", NOW, { importId: past.id });
    const vendor = await startImport(me, { kind: "contacts", files: ["Home Trust leads.csv"], provenance: "lead_vendor", mode: "fill", tags: [] }, NOW);
    await importBatch(me, "contacts", [rec("Fay", { relationship: "lead" }), rec("Gus", { relationship: "lead", leadSource: "Bankrate", loan: { closedOn: "2026-10-30", amount: null, noteRate: null } }), rec("Hal", { relationship: "lead", leadSource: "Google Ads", attestedOptIns: ["text"] })], "Home Trust leads.csv", "lead_vendor", NOW, { importId: vendor.id });
    const all = (await contacts.list({ ownerUserId: me.id })).contacts;
    const id = (n: string) => all.find((c) => c.firstName === n)!.id;
    // A loan in the loan system isn't the file's date (decision 5): Cy, a past client, applying again today stays undated.
    const loan = (contactId: string, over: Partial<Loan>): Loan => ({ id: `l_${contactId}`, ownerUserId: me.id, externalId: contactId, source: "arive", contactId, borrowerName: "", purpose: null, loanType: null, amount: null, noteRate: null, milestone: "Application", milestoneAt: "2026-11-20T00:00:00.000Z", history: [], keyDates: { application: "2026-11-20", lockExpires: null, appraisal: null, clearToClose: null, closing: null }, agentName: null, closed: false, dead: false, updatedAt: NOW.toISOString(), ...over });
    await pipeline.put(loan(id("Cy"), {}));
    expect(isRealLead(all.find((c) => c.firstName === "Di")!)).toBe(false);
    const r = await syncLeadEvents(me, { now: NOW });
    const by = new Map(r.events.map((e) => [all.find((c) => c.id === e.contactId)!.firstName, e]));
    expect([...by.keys()].sort()).toEqual(["Ann", "Bo", "Cy", "Ed", "Fay", "Gus", "Hal"]);
    const row = (n: string) => [by.get(n)!.sourceKey, by.get(n)!.at.slice(0, 10), by.get(n)!.datedBy, by.get(n)!.namesYou, by.get(n)!.origin];
    expect(row("Ann")).toEqual([SPHERE_KEY, "2021-06-15", "closed", false, "import"]);
    expect(row("Bo")).toEqual(["zillow", "2022-01-10", "application", false, "import"]);
    expect(row("Cy")).toEqual([SPHERE_KEY, NOW.toISOString().slice(0, 10), "none", false, "import"]);
    // Not a lead-vendor file and no date of its own: a lead, in no period.
    expect(row("Ed")).toEqual(["lendingtree", NOW.toISOString().slice(0, 10), "none", false, "import"]);
    // A lead-vendor file with no date uses the import day; no Lead source column = "Lead vendor file".
    expect(row("Fay")).toEqual([VENDOR_FILE_KEY, NOW.toISOString().slice(0, 10), "import", false, "import"]);
    expect(row("Gus")).toEqual(["bankrate", "2026-10-30", "closed", false, "import"]);
    // An opt-in column's attestation isn't wording that names you, even in a file named after the company (decision 4).
    expect(row("Hal")).toEqual(["google-ads", NOW.toISOString().slice(0, 10), "import", false, "import"]);
    expect(by.get("Fay")!.sourceLabel).toBe("Lead vendor file");
    // Idempotent: twice, and a later sync finds nothing new.
    expect((await syncLeadEvents(me, { now: later(1) })).added).toBe(0);
    expect(await events.count(me.id)).toBe(7);
    // Undo the vendor import: its people go, and their leads with them; a contact deleted any other way keeps its event.
    expect(await undoImport(me, vendor.id, later(1))).toMatchObject({ ok: true, done: true });
    expect(await events.count(me.id)).toBe(4);
    await deleteContact(me, id("Bo"), later(1));
    expect(await events.count(me.id)).toBe(4);
    expect((await syncLeadEvents(me, { now: later(2) })).added).toBe(0);
  });

  it("decision 5's date order, from the file's own columns, and dates in the future don't count", () => {
    const c = { id: "c1", kind: "contact" as const, source: "import: x.csv", provenance: "personal", leadSource: "Zillow", createdAt: NOW.toISOString() };
    expect(importDate({ ...c, loan: { appliedOn: "2026-01-04", closedOn: "2026-02-01" } }, NOW)).toEqual({ at: "2026-01-04T12:00:00.000Z", datedBy: "application" });
    expect(importDate({ ...c, loan: { appliedOn: "2027-01-01", closedOn: "2026-02-01" } }, NOW)).toEqual({ at: "2026-02-01T12:00:00.000Z", datedBy: "closed" });
    expect(importDate({ ...c, loan: { closedOn: "not a date" } }, NOW)).toEqual({ at: NOW.toISOString(), datedBy: "none" });
    expect(importDate({ ...c, provenance: "lead_vendor" }, NOW)).toEqual({ at: NOW.toISOString(), datedBy: "import" });
    // History only runs when asked.
    expect(planLeadEvents({ owner: "lo1", contacts: [{ ...c, source: "lead: Zillow" }], entries: [], audit: [], namesUs: () => true, history: false, now: NOW })).toEqual([]);
  });

  it("a merge points the other record's events at the kept one", async () => {
    const a = await ingestLead(me, readLead({ first_name: "Ann", phone: "2065551234" }, "Zillow")!, NOW);
    const b = await ingestLead(me, readLead({ first_name: "Ann", email: "ann@example.com" }, "Bankrate")!, later(0.1));
    expect(await mergeContacts(me, a.contactId, b.contactId, later(1))).toMatchObject({ ok: true });
    const log = await events.list(me.id);
    expect(log.map((e) => [e.contactId, e.sourceKey])).toEqual([[a.contactId, "zillow"], [a.contactId, "bankrate"]]);
    // A later sync doesn't add a second event for the merged record (its creation date may have moved).
    expect((await syncLeadEvents(me, { now: later(2) })).added).toBe(0);
  });

  it("Download everything adds the expenses' lead source and the lead-event log, own book only, formula-safe", async () => {
    await ingestLead(me, readLead({ lead_id: "=HYPERLINK(1)", first_name: "Ann", phone: "2065551234", consent_text: namesUs }, "Zillow")!, NOW);
    await ingestLead(other, readLead({ first_name: "Zed", phone: "2065559999" }, "Bankrate")!, NOW);
    await setMonthly(me, "Zillow", 1200, NOW);
    const ex = await buildExport(me, NOW);
    const files = unzipAll(ex.file);
    const events = files.get("lead-events.csv")!;
    const [head, ...rows] = events.replace(/^﻿/, "").trim().split("\r\n");
    expect(head.split(",").slice(0, 5)).toEqual(["at", "source", "contact", "repeat", "formNamedYou"]);
    expect(head).toContain("datedBy");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Zillow");
    expect(rows[0]).toContain("Ann");
    expect(rows[0]).toContain("'=HYPERLINK(1)");
    expect(events).not.toContain("Bankrate");
    const exp = files.get("expenses.csv")!.replace(/^﻿/, "");
    expect(exp.split("\r\n")[0].split(",").slice(0, 8)).toEqual(["date", "kind", "amountCents", "miles", "vendor", "category", "leadSource", "purpose"]);
    expect(exp).toContain(",zillow,");
    expect(files.get("lead-monthly-amounts.csv")).toContain("1200.00");
    expect(ex.counts).toMatchObject({ leadEvents: 1, monthlyAmounts: 1 });
  });

  it("the Business Manager slices leads by the same key", async () => {
    await ingestLead(me, readLead({ first_name: "Ann", phone: "2065551234" }, "zillow")!, NOW);
    await ingestLead(me, readLead({ first_name: "Bo", phone: "2065551235" }, "Zillow.com")!, NOW);
    await ingestLead(me, readLead({ first_name: "Cy", phone: "2065551236" }, "Lending Tree")!, NOW);
    // D84: the Business Manager reads the Lead sources scorecard (last 90 days), one row per key.
    expect((await snapshot(me, NOW)).sources.map(({ key, source, leads, loans }) => ({ key, source, leads, loans }))).toEqual([{ key: "zillow", source: "Zillow", leads: 2, loans: 0 }, { key: "lendingtree", source: "LendingTree", leads: 1, loans: 0 }]);
  });

  it("the Neon event store dedupes retries in the database and binds every value", async () => {
    const seen: { text: string; params?: unknown[] }[] = [];
    const s = new NeonLeadEventStore(async (text, params) => {
      seen.push({ text, params });
      return text.startsWith("INSERT INTO cc_lead_events") ? [{ id: "le_1" }] : [];
    });
    expect(await s.add({ id: "le_1", ownerUserId: "lo1", sourceKey: "zillow", sourceLabel: "Zillow'); DROP TABLE x;--", contactId: "c_1", at: NOW.toISOString(), duplicate: false, namesYou: true, externalId: "Z-1", origin: "delivery", datedBy: "delivery" })).toBe(true);
    expect(seen.some((q) => /CREATE UNIQUE INDEX IF NOT EXISTS cc_lead_events_external ON cc_lead_events \(owner_user_id, source_key, external_id\) WHERE external_id IS NOT NULL/.test(q.text))).toBe(true);
    const ins = seen.find((q) => q.text.startsWith("INSERT INTO cc_lead_events"))!;
    expect(ins.text).toContain("ON CONFLICT DO NOTHING");
    expect(ins.text).not.toContain("DROP");
    expect(ins.params).toHaveLength(11);
  });
});

describe("D83 copy", () => {
  it("has no rates, no banned words, and never ties a gift to a referral", () => {
    const all = JSON.stringify({ monthly: { ...LEADS.monthly, each: null, made: null, saved: null, remove: null }, score: LEADS.score, recent: LEADS.recent, spend: { ...LEAD_SPEND, monthly: null } }) + LEADS.monthly.saved("Zillow", 1) + LEADS.score.real.undated(2) + LEAD_SPEND.monthly("Zillow");
    expect(findRateMentions(all)).toEqual([]);
    const banned = ["guaran" + "teed", "best " + "rates", "commis" + "sion", "referral " + "fee", "hur" + "ry"];
    for (const b of banned) expect(all.toLowerCase()).not.toContain(b);
    expect(all).not.toMatch(/gift[^.]*referr|referr[^.]*gift/i);
    expect(LEADS.monthly.intro).toMatch(/Nothing posts on its own/);
  });
});

/** Reads our own zips back (local headers). */
function unzipAll(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString("utf8");
    const body = buf.subarray(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
    out.set(name, (method === 8 ? inflateRawSync(body) : Buffer.from(body)).toString("utf8"));
    p += 30 + nameLen + extra + size;
  }
  return out;
}

describe("the import's Application date column (D83)", () => {
  it("maps it and keeps the date with the loan", () => {
    const csv = { headers: ["Name", "Email", "Application Date", "Lead Source"], rows: [["Ann Lee", "ann@example.com", "01/10/2022", "Zillow"]] };
    const m = autoMap(csv.headers, "contacts");
    expect(m.appliedOn).toBe(2);
    const { records } = buildRecords(csv, m, "contacts", { dateOrder: "mdy" });
    expect(records[0]).toMatchObject({ leadSource: "Zillow", loan: { appliedOn: "2022-01-10" } });
  });
});
