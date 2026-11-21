import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryCampaignStore, setCampaignStoreForTests, campaignStore } from "@/lib/campaigns/store";
import { MemoryConciergeStore, setConciergeStoreForTests, conciergeStore } from "@/lib/concierge/store";
import { MemoryPipelineStore, setPipelineStoreForTests, pipelineStore } from "@/lib/pipeline/store";
import { MemoryTouchStore, NeonTouchStore, setTouchStoreForTests, touchStore } from "@/lib/messaging/store";
import { gateFor } from "@/lib/messaging/service";
import { checkEdit, changedFields } from "./editing";
import { addContact, addNote, logDial, mergeContacts, mergePreview, possibleMatches, remindMe, updateContact } from "./manage";
import { mergeConsent, mergeFields } from "./merge";
import { cleanZip, initialsOf } from "./normalize";
import { permissionLine, reachBadge } from "./reach";
import { importBatch, recordConsent, summarize } from "./service";
import { MemoryContactStore, NeonContactStore, setContactStoreForTests, type ConsentEntry, type Contact } from "./store";
import { POSSIBLE_DUPLICATE_TAG } from "./tags";

const user = (id: string, role: User["role"], extra: Partial<User> = {}): User => ({ id, email: `${id}@x.com`, name: id, role, mloId: "mlo-001", status: "active", createdAt: "2026-11-18T00:00:00Z", createdBy: "t", ...extra });
const person = (over: Partial<Contact> = {}): Contact => ({
  firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: "+12065551234", phone2: null, street: null, city: "Seattle", state: "WA", zip: null,
  relationship: "past_client", tags: [], notes: null, loan: null, agent: null,
  id: "c_ann000001", ownerUserId: "lo1", kind: "contact", provenance: "personal", locked: false, source: "import: a.csv",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});
const TUE_10AM_PT = new Date("2026-11-17T18:00:00Z");
const later = (min: number) => new Date(TUE_10AM_PT.getTime() + min * 60_000);
const form = (c: Partial<Record<string, string | null>>) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ""]));
const editOf = (c: Contact, over: Record<string, string> = {}) => ({ ...form({ firstName: c.firstName, lastName: c.lastName, phone: c.phone, phone2: c.phone2, email: c.email, street: c.street, city: c.city, state: c.state, zip: c.zip, relationship: c.relationship, leadSource: c.leadSource ?? null, referredBy: c.referredBy ?? null, notes: c.notes }), ...over });

let store: MemoryContactStore;
const lo = user("lo1", "lo");
const other = user("lo2", "lo");
beforeEach(() => {
  store = new MemoryContactStore();
  setContactStoreForTests(store);
  setAccountStoreForTests(new MemoryAccountStore());
  setTouchStoreForTests(new MemoryTouchStore());
  setCampaignStoreForTests(new MemoryCampaignStore());
  setConciergeStoreForTests(new MemoryConciergeStore());
  setPipelineStoreForTests(new MemoryPipelineStore());
});
afterEach(() => {
  setContactStoreForTests(null);
  setAccountStoreForTests(null);
  setTouchStoreForTests(null);
  setCampaignStoreForTests(null);
  setConciergeStoreForTests(null);
  setPipelineStoreForTests(null);
});

describe("editing: the form is checked like an import (D77)", () => {
  it("cleans good values and says what's wrong with bad ones", () => {
    const ok = checkEdit({ firstName: "  Ann ", lastName: "Lee", phone: "(206) 555-1234", phone2: "206.555.1234", email: " Ann@X.com ", state: "Washington", zip: "98101", relationship: "past_client", notes: "Line one\r\nLine two" }, "contact");
    expect(ok).toEqual({ ok: true, values: expect.objectContaining({ firstName: "Ann", phone: "+12065551234", phone2: null, email: "ann@x.com", state: "WA", zip: "98101", street: null, notes: "Line one\nLine two" }) });
    const bad = checkEdit({ firstName: "", lastName: "", phone: "206-555-12", email: "ann@gmail", state: "Narnia", zip: "981", relationship: "boss" }, "contact");
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors).toEqual({ firstName: "Add a first or last name.", phone: "Phone is 2 digits short.", email: "Email isn't a complete email address.", state: "Pick a US state.", zip: "ZIP should be 5 digits (or ZIP+4).", relationship: "Pick how you know them." });
    expect(checkEdit({ firstName: "Ann", relationship: "lead" }, "contact")).toMatchObject({ ok: false, errors: { phone: "Keep a phone number or an email, so you can reach them." } });
    expect(checkEdit({ firstName: "A".repeat(61), email: "a@x.com", relationship: "lead" }, "contact")).toMatchObject({ ok: false, errors: { firstName: "First name is too long." } });
    // Agents are always "agent"; clients can't be.
    expect(checkEdit({ firstName: "Al", email: "al@x.com" }, "agent")).toMatchObject({ ok: true, values: { relationship: "agent" } });
    expect(checkEdit({ firstName: "Al", email: "al@x.com", relationship: "agent" }, "contact").ok).toBe(false);
    expect(cleanZip("98101-1234")).toBe("98101-1234");
    expect(initialsOf("ann", "lee")).toBe("AL");
    expect(initialsOf("", "", "x@y.com")).toBe("X");
  });

  it("lists only the fields that changed", () => {
    const c = person();
    const r = checkEdit(editOf(c, { city: "Tacoma" }), "contact");
    expect(r.ok && changedFields(c, r.values)).toEqual(["city"]);
  });
});

describe("updateContact (D77)", () => {
  it("a new phone clears its checks and sets texts and calls back to nothing on file; a stop stays", async () => {
    const c = person({ dnc: { onList: false, checkedAt: "2026-11-10T00:00:00Z", source: "Registry" }, line: { type: "mobile", carrier: null, checkedAt: "2026-11-10T00:00:00Z" }, rnd: { result: "no", since: "2020-01-01", checkedAt: "2026-11-10T00:00:00Z", source: "FCC" } });
    await store.put(c);
    await recordConsent(lo, c.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "signed form" }, later(-10));
    await recordConsent(lo, c.id, { channel: "email", purpose: "service", granted: true, evidence: "written", proof: "signed form" }, later(-10));
    expect((await gateFor(lo, (await store.get(c.id))!, "text", "service", TUE_10AM_PT)).allowed).toBe(true);
    const before = await store.consents(c.id);
    const r = await updateContact(lo, c.id, editOf(c, { phone: "(425) 555-9876" }), TUE_10AM_PT);
    expect(r).toMatchObject({ ok: true, changed: ["phone"], phoneChanged: true, emailChanged: false, resets: 1 });
    const after = (await store.get(c.id))!;
    expect(after).toMatchObject({ phone: "+14255559876", dnc: null, line: null, rnd: null });
    const log = await store.consents(c.id);
    expect(log.slice(0, before.length)).toEqual(before); // append-only
    expect(log.at(-1)).toMatchObject({ channel: "text", purpose: "service", granted: false, evidence: "reset" });
    expect(log.at(-1)!.proof).toContain("•••-1234");
    expect(log.at(-1)!.proof).not.toContain("2065551234");
    const s = summarize(log);
    expect(s.text.service.granted).toBe(false);
    expect(s.email.service).toMatchObject({ granted: true, evidence: "written" }); // email untouched
    expect((await gateFor(lo, after, "text", "service", TUE_10AM_PT)).reasons[0]).toBe("No permission to text on file.");
    // A stop is never reset away.
    await recordConsent(lo, c.id, { channel: "call", purpose: "service", granted: false, evidence: "revoked", proof: "asked us to stop" }, later(1));
    await updateContact(lo, c.id, editOf(after, { phone: "(425) 555-1111" }), later(2));
    expect(summarize(await store.consents(c.id)).call.service).toMatchObject({ evidence: "revoked" });
    expect((await gateFor(lo, (await store.get(c.id))!, "call", "service", later(3))).reasons).toContain("They said stop to calls or texts.");
  });

  it("a new email resets email permission only; an unchanged phone keeps its checks", async () => {
    const c = person({ dnc: { onList: false, checkedAt: "2026-11-10T00:00:00Z", source: "Registry" } });
    await store.put(c);
    await recordConsent(lo, c.id, { channel: "email", purpose: "marketing", granted: true, evidence: "web_form", proof: "form" }, later(-5));
    const r = await updateContact(lo, c.id, editOf(c, { email: "ann.lee@y.com", city: "Tacoma" }), TUE_10AM_PT);
    expect(r).toMatchObject({ ok: true, phoneChanged: false, emailChanged: true, resets: 1 });
    expect((await store.get(c.id))!.dnc).not.toBeNull();
    expect(summarize(await store.consents(c.id)).email.marketing).toMatchObject({ granted: false, evidence: "reset" });
    // A later import's "yes" counts it as nothing on file (so the right file can record it).
    await importBatch(lo, "contacts", [{ ...person(), email: "ann.lee@y.com", attestedOptIns: ["email"], phone: c.phone }], "b.csv", "personal", later(5));
    expect(summarize(await store.consents(c.id)).email.marketing).toMatchObject({ granted: true, evidence: "attested" });
  });

  it("checks canSee: another loan officer's contact can't be edited; an assistant edits in the officer's book", async () => {
    const c = person();
    await store.put(c);
    expect(await updateContact(other, c.id, editOf(c, { city: "X" }))).toEqual({ ok: false, errors: { form: "That contact isn't in your book." } });
    expect(await updateContact(user("as1", "assistant"), c.id, editOf(c, { city: "X" }))).toMatchObject({ ok: false });
    expect(await updateContact(user("as2", "assistant", { assistsUserId: "lo1" }), c.id, editOf(c, { city: "Spokane" }))).toMatchObject({ ok: true, changed: ["city"] });
    expect((await store.get(c.id))!.city).toBe("Spokane");
    expect((await addNote(other, c.id, "Called about the refi")).ok).toBe(false);
    expect((await remindMe(other, c.id, "call", 7)).ok).toBe(false);
    expect(await logDial(other, c.id)).toMatchObject({ ok: false });
    expect(await mergePreview(other, c.id, c.id)).toMatchObject({ ok: false });
  });

  it("refuses a bad value with the field's message and saves nothing", async () => {
    const c = person();
    await store.put(c);
    expect(await updateContact(lo, c.id, editOf(c, { phone: "555-1212", email: "" }))).toEqual({ ok: false, errors: { phone: "Phone is 3 digits short." } });
    expect((await store.get(c.id))!.phone).toBe("+12065551234");
  });
});

describe("addContact (D77)", () => {
  it("records provenance and where they came from; a previous employer's list is held", async () => {
    const r = await addContact(lo, "contact", { firstName: "Bo", lastName: "Park", phone: "425-555-2222", email: "", relationship: "sphere", how: "Neighbor", provenance: "personal" }, TUE_10AM_PT);
    expect(r).toMatchObject({ ok: true });
    const bo = (await store.get(r.ok ? r.id : ""))!;
    expect(bo).toMatchObject({ ownerUserId: "lo1", kind: "contact", provenance: "personal", locked: false, source: "added by hand", relationship: "sphere", notes: "How you know them: Neighbor", phone: "+14255552222" });
    expect(await store.consents(bo.id)).toEqual([]); // no permission is assumed
    const held = await addContact(lo, "contact", { firstName: "Cy", email: "cy@x.com", relationship: "past_client", provenance: "prior_employer" });
    expect((await store.get(held.ok ? held.id : ""))!).toMatchObject({ provenance: "prior_employer", locked: true });
    // Already in the book: refused, with a link to them.
    const dup = await addContact(lo, "contact", { firstName: "Robert", phone: "(425) 555-2222", relationship: "lead", provenance: "personal" });
    expect(dup).toMatchObject({ ok: false, existingId: bo.id, errors: { form: "Bo Park is already in your book with that phone or email." } });
    expect((await addContact(lo, "contact", { firstName: "Di", email: "di@x.com", relationship: "lead", provenance: "stolen" })).ok).toBe(false);
  });

  it("an assistant adds into the officer's book; an unassigned one can't; agents get a brokerage", async () => {
    const r = await addContact(user("as1", "assistant", { assistsUserId: "lo1" }), "agent", { firstName: "Al", lastName: "Agent", email: "al@x.com", brokerage: "Lake Realty", provenance: "agent_partner" });
    expect((await store.get(r.ok ? r.id : ""))!).toMatchObject({ ownerUserId: "lo1", kind: "agent", relationship: "agent", agent: { brokerage: "Lake Realty" } });
    expect(await addContact(user("as2", "assistant"), "contact", { firstName: "X", email: "x@x.com", relationship: "lead" })).toMatchObject({ ok: false, errors: { form: expect.stringContaining("aren't assigned") } });
  });
});

describe("merge: the stricter permission, both histories (D77)", () => {
  const at = "2026-11-21T00:00:00.000Z";
  const e = (contactId: string, over: Partial<ConsentEntry>): ConsentEntry => ({ contactId, channel: "text", purpose: "service", granted: true, evidence: "written", proof: "form", at: "2026-10-01T00:00:00.000Z", actor: "lo1@x.com", ...over });

  it("a stop on either record stays; a yes for another number doesn't carry; the weaker of two yeses wins", () => {
    const keep = person({ id: "c_keep00001" });
    const sameNumber = person({ id: "c_drop00001", firstName: "Annie", email: null });
    const otherNumber = person({ id: "c_drop00002", phone: "+14255550000", email: "annie@x.com" });
    const st = (r: ReturnType<typeof mergeConsent>, ch: string, p = "service") => r.outcome.find((o) => o.channel === ch && o.purpose === p)!.state;
    // Stop on the other record, written yes on the kept one → stop.
    const m1 = mergeConsent(keep, [e(keep.id, {})], sameNumber, [e(sameNumber.id, { granted: false, evidence: "revoked", proof: "STOP", at: "2026-09-01T00:00:00.000Z" })], keep, at, "lo1@x.com");
    expect(st(m1, "text")).toBe("stop");
    expect(m1.appended).toEqual([expect.objectContaining({ contactId: keep.id, channel: "text", purpose: "service", granted: false, evidence: "revoked" })]);
    // Nothing on the kept record, written yes for the same number on the other → the yes, keeping its own date.
    const m2 = mergeConsent(keep, [], sameNumber, [e(sameNumber.id, {})], keep, at, "lo1@x.com");
    expect(st(m2, "text")).toBe("proof");
    expect(m2.appended[0]).toMatchObject({ granted: true, evidence: "written", at: "2026-10-01T00:00:00.000Z" });
    // A yes given for a different number doesn't carry over (the kept record keeps its own number).
    const m3 = mergeConsent(keep, [], otherNumber, [e(otherNumber.id, {}), e(otherNumber.id, { channel: "email" })], mergeFields(keep, otherNumber, at), at, "lo1@x.com");
    expect(st(m3, "text")).toBe("none");
    expect(st(m3, "email")).toBe("none");
    expect(m3.appended).toEqual([]);
    expect(m3.copies).toHaveLength(2);
    // Both say yes for the same number: the weaker proof wins.
    const m4 = mergeConsent(keep, [e(keep.id, { at: "2026-11-01T00:00:00.000Z" })], sameNumber, [e(sameNumber.id, { evidence: "attested", proof: "opt-in column" })], keep, at, "lo1@x.com");
    expect(st(m4, "text")).toBe("word");
    expect(m4.appended[0]).toMatchObject({ evidence: "attested", at: "2026-11-01T00:00:00.001Z" });
    // Copies are history only (marked, and never counted).
    expect(summarize([...m3.copies]).text.service.granted).toBe(false);
    expect(m3.copies[0]).toMatchObject({ contactId: keep.id, mergedFrom: otherNumber.id, importId: null });
  });

  it("fills blanks from the other record and keeps the stricter hold", () => {
    const keep = person({ id: "c_keep00001", email: null, city: null, tags: ["vip", POSSIBLE_DUPLICATE_TAG], noMail: false });
    const drop = person({ id: "c_drop00001", phone: "+14255550000", email: "annie@x.com", city: "Tacoma", tags: ["Refi"], locked: true, provenance: "prior_employer", noMail: true, notes: "Prefers mornings." });
    const m = mergeFields(keep, drop, "2026-11-21T00:00:00.000Z");
    expect(m).toMatchObject({ id: keep.id, phone: "+12065551234", phone2: "+14255550000", email: "annie@x.com", city: "Tacoma", tags: ["vip", "Refi"], locked: true, provenance: "prior_employer", noMail: true, notes: "From Ann Lee's record: Prefers mornings." });
    expect(m.mergedFrom).toEqual([{ id: drop.id, name: "Ann Lee", at: "2026-11-21T00:00:00.000Z" }]);
  });

  it("merges end to end: messages, history, reminders, loans and campaigns move; the gate stays strict", async () => {
    const keep = person({ id: "c_keep00001", tags: [POSSIBLE_DUPLICATE_TAG] });
    const drop = person({ id: "c_drop00001", firstName: "Annie", email: "annie@x.com" });
    await store.put(keep);
    await store.put(drop);
    await recordConsent(lo, keep.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "signed" }, later(-60));
    await recordConsent(lo, drop.id, { channel: "text", purpose: "marketing", granted: false, evidence: "revoked", proof: "texted STOP" }, later(-30));
    await touchStore().add({ id: "t1", contactId: drop.id, ownerUserId: "lo1", channel: "text", purpose: "service", direction: "in", body: "hi", status: "received", providerId: null, note: null, at: later(-20).toISOString(), actor: "contact" });
    await conciergeStore().putTask({ id: "k1", ownerUserId: "lo1", contactId: drop.id, title: "Call Annie", why: "x", due: "2026-11-30", done: false, createdAt: at });
    await pipelineStore().put({ id: "l1", ownerUserId: "lo1", externalId: "L-1", source: "arive", contactId: drop.id, borrowerName: "Annie Lee", purpose: null, loanType: null, amount: null, noteRate: null, milestone: "Application", milestoneAt: at, history: [], keyDates: { application: null, lockExpires: null, appraisal: null, clearToClose: null, closing: null }, agentName: null, closed: false, dead: false, updatedAt: at });
    await campaignStore().putEnrollment({ id: "en1", campaignId: "cp1", ownerUserId: "lo1", contactId: drop.id, status: "active", stepIndex: 0, nextAt: at, startedAt: at, endedAt: null, reason: "", log: [] });
    const dropLog = await store.consents(drop.id);

    expect((await possibleMatches(lo, keep)).map((x) => x.id)).toEqual([drop.id]);
    const pv = await mergePreview(lo, keep.id, drop.id, TUE_10AM_PT);
    expect(pv.ok && pv.preview.outcome.find((o) => o.channel === "text" && o.purpose === "marketing")!.state).toBe("stop");
    expect(await store.get(drop.id)).not.toBeNull(); // a preview saves nothing

    const r = await mergeContacts(lo, keep.id, drop.id, TUE_10AM_PT);
    expect(r).toMatchObject({ ok: true, keptId: keep.id, moved: 1 });
    expect(await store.get(drop.id)).toBeNull();
    const k = (await store.get(keep.id))!;
    expect(k.tags).not.toContain(POSSIBLE_DUPLICATE_TAG);
    expect(k.phone2).toBeNull();
    expect(k.notes).toBe("Also on Annie Lee's record: annie@x.com"); // an email the record can't hold is noted, never lost
    // Both histories: the kept record's own, the other's copied in, and the other's original rows untouched.
    const log = await store.consents(keep.id);
    expect(log.filter((x) => x.mergedFrom === drop.id)).toHaveLength(dropLog.length);
    expect(await store.consentsFor([drop.id])).toEqual(dropLog);
    const s = summarize(log);
    expect(s.text.marketing).toMatchObject({ granted: false, evidence: "revoked" });
    expect(s.text.service).toMatchObject({ granted: false, evidence: "revoked" }); // the stop covered every phone channel
    expect((await gateFor(lo, k, "text", "service", TUE_10AM_PT)).allowed).toBe(false);
    expect((await touchStore().forContact(keep.id)).map((t) => t.id)).toEqual(["t1"]);
    expect((await conciergeStore().tasks("lo1")).find((t) => t.id === "k1")!.contactId).toBe(keep.id);
    expect((await pipelineStore().list("lo1"))[0].contactId).toBe(keep.id);
    expect((await campaignStore().getEnrollment("en1"))!.contactId).toBe(keep.id);
  });

  it("refuses another book, another kind, and the same record", async () => {
    const a = person({ id: "c_a00000001" });
    await store.put(a);
    await store.put(person({ id: "c_b00000001", ownerUserId: "lo2", email: "b@x.com" }));
    await store.put(person({ id: "c_c00000001", kind: "agent", relationship: "agent", email: "c@x.com" }));
    expect(await mergeContacts(lo, a.id, "c_b00000001")).toEqual({ ok: false, error: "gone" });
    expect(await mergeContacts(user("own", "owner"), a.id, "c_b00000001")).toMatchObject({ ok: false });
    expect(await mergeContacts(lo, a.id, "c_c00000001")).toEqual({ ok: false, error: "kind" });
    expect(await mergeContacts(lo, a.id, a.id)).toEqual({ ok: false, error: "same" });
    expect(await store.get("c_b00000001")).not.toBeNull();
  });
});

describe("reach: the list badge and the page's permission line (D77)", () => {
  const s = (entries: ConsentEntry[]) => summarize(entries);
  const y = (channel: ConsentEntry["channel"], evidence: ConsentEntry["evidence"], granted = true): ConsentEntry => ({ contactId: "c", channel, purpose: "service", granted, evidence, proof: "p", at: "2026-11-01T00:00:00Z", actor: "a" });
  it("says what's on file in a few words", () => {
    expect(reachBadge({ summary: s([y("text", "written")]), hasPhone: true, hasEmail: true, locked: false })).toEqual({ label: "Can text", tone: "ok" });
    expect(reachBadge({ summary: s([]), hasPhone: true, hasEmail: false, locked: false })).toEqual({ label: "Call only", tone: "warn" });
    expect(reachBadge({ summary: s([y("call", "revoked", false)]), hasPhone: true, hasEmail: true, locked: false })).toEqual({ label: "Email only", tone: "warn" });
    expect(reachBadge({ summary: s([y("call", "revoked", false), y("email", "revoked", false)]), hasPhone: true, hasEmail: true, locked: false })).toEqual({ label: "Do not contact", tone: "bad" });
    expect(reachBadge({ summary: s([]), hasPhone: true, hasEmail: true, locked: true }).label).toBe("On hold");
    expect(permissionLine({ summary: s([y("text", "attested")]), hasPhone: true, hasEmail: true, locked: false })).toEqual(["Calls OK", "Texts: your word only", "Email OK"]);
    expect(permissionLine({ summary: s([]), hasPhone: false, hasEmail: true, locked: false })).toEqual(["No phone number", "Email OK"]);
  });
});

describe("Neon: a merge moves messages in one UPDATE (D77)", () => {
  it("moveContact and the consent copy's merged_from column", async () => {
    const calls: { text: string; params?: unknown[] }[] = [];
    const q = async (text: string, params?: unknown[]) => (calls.push({ text, params }), /count\(\*\)/.test(text) ? [{ n: 3 }] : []);
    expect(await new NeonTouchStore(q).moveContact("c_a", "c_b")).toBe(3);
    expect(calls.find((c) => c.text.includes("UPDATE cc_touches SET contact_id = $2 WHERE contact_id = $1"))?.params).toEqual(["c_a", "c_b"]);
    await new NeonContactStore(q).addConsent({ contactId: "c_b", channel: "text", purpose: "service", granted: true, evidence: "written", proof: "x", at: "2026-11-21T00:00:00Z", actor: "a", mergedFrom: "c_a" });
    const ins = calls.find((c) => c.text.startsWith("INSERT INTO cc_consents"))!;
    expect(ins.text).toContain("merged_from");
    expect(ins.params?.at(-1)).toBe("c_a");
  });
});
