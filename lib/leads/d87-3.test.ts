/**
 * D87.3 (owner decision 6, 2026-11-23): an imported lead counts as one "you can call" when the loan officer
 * confirmed at import that the person gave them permission (the import wrote a granted text or call entry), with no
 * stop since. Delivered leads keep decision 1 (their delivery's wording, frozen). Existing imported-lead events are
 * re-read once per loan officer.
 */
import { describe, expect, it } from "vitest";
import { contactStore } from "@/lib/contacts/store";
import { importBatch, recordConsent } from "@/lib/contacts/service";
import { startImport, undoImport } from "@/lib/contacts/imports";
import { me, NOW, other, useLeadStores } from "@/tests/lead-ask-harness";
import { eventId, leadEventStore, NeonLeadEventStore, type LeadEvent } from "./events";
import { importedLeadCallable, type BackfillContact, type BackfillEntry } from "./backfill";
import { CALLABLE_MARK, HISTORY_MARK, syncLeadEvents } from "./sync";
import { ingestLead, readLead } from "./intake";
import { LEADS } from "@/lib/content/cc-pages";

const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
type OptIn = "text" | "call" | "email";
const rec = (first: string, optIns: OptIn[] = [], extra: Record<string, unknown> = {}) => ({ firstName: first, lastName: "Lee", email: `${first.toLowerCase()}@example.com`, phone: null, phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "lead", tags: [], notes: null, loan: null, agent: null, leadSource: "Zillow", attestedOptIns: optIns, ...extra });

async function importLeads(rows: ReturnType<typeof rec>[], at = NOW, file = "Leads.csv") {
  const run = await startImport(me, { kind: "contacts", files: [file], provenance: "lead_vendor", mode: "fill", tags: [] }, at);
  await importBatch(me, "contacts", rows, file, "lead_vendor", at, { importId: run.id });
  const all = (await contactStore().list({ ownerUserId: me.id })).contacts;
  return { run, id: (n: string) => all.find((c) => c.firstName === n)!.id };
}
const callable = async () => {
  const events = await leadEventStore().list(me.id);
  const people = (await contactStore().list({ ownerUserId: me.id })).contacts;
  return Object.fromEntries(events.filter((e) => e.origin === "import").map((e) => [people.find((c) => c.id === e.contactId)!.firstName, e.namesYou]));
};

describe("D87.3: imported leads with permission count as leads you can call", () => {
  useLeadStores();

  it("a granted text yes or call yes at import → callable; no permission or email only → not", async () => {
    await importLeads([rec("Ann", ["text"]), rec("Bo", ["call"]), rec("Cy"), rec("Di", ["email"]), rec("Ed", ["text", "call", "email"])]);
    await syncLeadEvents(me, { now: NOW });
    expect(await callable()).toEqual({ Ann: true, Bo: true, Cy: false, Di: false, Ed: true });
  });

  it("a stop in the file, or a stop recorded after the yes, keeps them not callable", async () => {
    const { id } = await importLeads([rec("Ann", ["text"], { optOuts: { text: "Do Not Contact column" } }), rec("Bo", ["text", "call"]), rec("Cy", ["call"])]);
    // Bo says stop after the import (texts or calls stop every phone channel), before the first sync.
    expect(await recordConsent(me, id("Bo"), { channel: "text", purpose: "marketing", granted: false, evidence: "revoked", proof: "replied STOP" }, later(0.1))).toEqual({ ok: true });
    await syncLeadEvents(me, { now: later(0.2) });
    expect(await callable()).toEqual({ Ann: false, Bo: false, Cy: true });
  });

  it("a later yes from anywhere else doesn't make an imported lead callable", async () => {
    const { id } = await importLeads([rec("Ann"), rec("Bo")]);
    // Ann: a written yes recorded on the contact page after the import. Bo: a later import's yes for the same person.
    await recordConsent(me, id("Ann"), { channel: "text", purpose: "marketing", granted: true, evidence: "written", proof: "signed form" }, later(0.1));
    await importLeads([rec("Bo", ["text", "call"])], later(0.2), "Second file.csv");
    await syncLeadEvents(me, { now: later(0.3) });
    expect(await callable()).toEqual({ Ann: false, Bo: false });
  });

  it("an undone import yes is taken back, so a person the undo kept isn't callable", async () => {
    const { run, id } = await importLeads([rec("Ann", ["text"]), rec("Bo", ["text"])]);
    // Bo is kept by the undo (permission recorded since); the import's own yes is taken back.
    await recordConsent(me, id("Bo"), { channel: "email", purpose: "marketing", granted: true, evidence: "written", proof: "signed form" }, later(0.1));
    expect(await undoImport(me, run.id, later(0.2))).toMatchObject({ ok: true });
    await syncLeadEvents(me, { now: later(0.3) });
    expect(await callable()).toEqual({ Bo: false });
  });

  it("delivered leads keep decision 1: their delivery's own wording, untouched by the re-read", async () => {
    const a = await ingestLead(me, readLead({ first_name: "Dee", phone: "2065557777", consent_text: "Our partners may call you." }, "Zillow")!, NOW);
    await syncLeadEvents(me, { now: NOW });
    const before = (await leadEventStore().list(me.id)).find((e) => e.contactId === a.contactId)!;
    expect(before.namesYou).toBe(false);
    // Even with a later yes on file, a delivered lead's event never changes.
    await recordConsent(me, a.contactId, { channel: "text", purpose: "marketing", granted: true, evidence: "written", proof: "signed form" }, later(0.1));
    const s = leadEventStore();
    expect(await s.setImportedNamesYou(me.id, [{ id: before.id, namesYou: true }])).toBe(0);
    await syncLeadEvents(me, { now: later(0.2) });
    expect((await leadEventStore().list(me.id)).find((e) => e.id === before.id)).toEqual(before);
  });
});

describe("D87.3: existing imported-lead events are re-read once", () => {
  useLeadStores();

  /** The log as D83–D87.2 left it: imported leads frozen as not callable, the history done, no re-read yet. */
  async function oldLog() {
    const { id } = await importLeads([rec("Ann", ["text"]), rec("Bo", ["call"]), rec("Cy")]);
    const s = leadEventStore();
    const ev = (n: string, origin: LeadEvent["origin"] = "import"): LeadEvent => ({ id: origin === "import" ? eventId(me.id, id(n), "import") : eventId(me.id, id(n), NOW.toISOString()), ownerUserId: me.id, sourceKey: "zillow", sourceLabel: "Zillow", contactId: id(n), at: NOW.toISOString(), duplicate: false, namesYou: false, externalId: null, origin, datedBy: origin === "import" ? "import" : "delivery" });
    await s.addMany([ev("Ann"), ev("Bo"), ev("Cy"), ev("Ann", "delivery")]);
    await s.add({ ...ev("Ann"), id: "le_other", ownerUserId: other.id });
    await s.mark(me.id, HISTORY_MARK, NOW.toISOString());
    return { id, s };
  }

  it("flips imported leads with an import yes to callable, once, and leaves delivered events and other books alone", async () => {
    const { id, s } = await oldLog();
    const r = await syncLeadEvents(me, { now: later(1) });
    expect(r).toMatchObject({ added: 0, reread: 2 });
    expect(await s.marked(me.id, CALLABLE_MARK)).toBe(true);
    const log = await s.list(me.id);
    expect(log.filter((e) => e.origin === "import").map((e) => [e.contactId, e.namesYou])).toEqual(expect.arrayContaining([[id("Ann"), true], [id("Bo"), true], [id("Cy"), false]]));
    expect(log.find((e) => e.origin === "delivery")!.namesYou).toBe(false);
    expect((await s.list(other.id))[0].namesYou).toBe(false);
    // Idempotent and once: a second run changes nothing, and a stop recorded later doesn't re-read the frozen event.
    await recordConsent(me, id("Ann"), { channel: "text", purpose: "marketing", granted: false, evidence: "revoked", proof: "replied STOP" }, later(2));
    expect(await syncLeadEvents(me, { now: later(3) })).toMatchObject({ added: 0, reread: 0 });
    expect(await s.list(me.id)).toEqual(log);
  });

  it("two re-reads at once agree", async () => {
    const { s } = await oldLog();
    const runs = await Promise.all([syncLeadEvents(me, { now: later(1) }), syncLeadEvents(me, { now: later(1) }), syncLeadEvents(me, { now: later(1) })]);
    expect(runs.every((r) => r.added === 0)).toBe(true);
    expect((await s.list(me.id)).filter((e) => e.namesYou).length).toBe(2);
    expect(await syncLeadEvents(me, { now: later(2) })).toMatchObject({ reread: 0 });
  });
});

describe("D87.3: the rule, pure", () => {
  const c: BackfillContact = { id: "c1", kind: "contact", source: "import: Leads.csv", provenance: "lead_vendor", leadSource: "Zillow", createdAt: NOW.toISOString(), importId: "imp1" };
  const yes = (over: Partial<BackfillEntry> = {}): BackfillEntry => ({ contactId: "c1", channel: "text", purpose: "marketing", granted: true, evidence: "attested", at: NOW.toISOString(), actor: "lo1@x.com", proof: "opt-in column in Leads.csv", importId: "imp1", ...over });
  const stop = (over: Partial<BackfillEntry> = {}): BackfillEntry => ({ ...yes(), granted: false, evidence: "revoked", proof: "STOP", importId: null, at: later(1).toISOString(), ...over });

  it("counts only the import's own marketing yes to texts or calls, with no stop on that channel", () => {
    expect(importedLeadCallable(c, [yes()])).toBe(true);
    expect(importedLeadCallable(c, [yes({ channel: "call" })])).toBe(true);
    expect(importedLeadCallable(c, [])).toBe(false);
    expect(importedLeadCallable(c, [yes({ channel: "email" })])).toBe(false);
    expect(importedLeadCallable(c, [yes({ channel: "ai_call" })])).toBe(false);
    expect(importedLeadCallable(c, [yes({ purpose: "service" })])).toBe(false);
    // Another import, a recorded form, a merged record's copy, another person's row: not this import's yes.
    expect(importedLeadCallable(c, [yes({ importId: "imp2" })])).toBe(false);
    expect(importedLeadCallable(c, [yes({ evidence: "written", importId: null, proof: "signed form" })])).toBe(false);
    expect(importedLeadCallable(c, [yes({ mergedFrom: "c9" })])).toBe(false);
    expect(importedLeadCallable(c, [yes({ contactId: "c2" })])).toBe(false);
    // A stop on the same channel, before or after; an undone yes or a reset at or after it. A stop on another channel doesn't.
    expect(importedLeadCallable(c, [yes(), stop()])).toBe(false);
    expect(importedLeadCallable(c, [stop({ at: "2026-01-01T00:00:00.000Z" }), yes()])).toBe(false);
    expect(importedLeadCallable(c, [yes(), stop({ evidence: "attested", proof: "import undone: Leads.csv", importId: "imp1" })])).toBe(false);
    expect(importedLeadCallable(c, [yes(), stop({ evidence: "reset" })])).toBe(false);
    expect(importedLeadCallable(c, [yes(), stop({ channel: "email" })])).toBe(true);
    expect(importedLeadCallable(c, [yes({ channel: "call" }), stop({ channel: "text" }), stop({ channel: "call", at: "2026-01-01T00:00:00.000Z", evidence: "reset" })])).toBe(true);
  });

  it("people imported before imports had ids: the opt-in column's own proof, and never a later import's", () => {
    const old = { ...c, importId: null };
    expect(importedLeadCallable(old, [yes({ importId: null })])).toBe(true);
    expect(importedLeadCallable(old, [yes({ importId: "imp2" })])).toBe(false);
    expect(importedLeadCallable(old, [yes({ importId: null, proof: "my own note" })])).toBe(false);
  });

  it("the Neon store changes only this owner's import events, with bound parameters", async () => {
    const seen: { text: string; params?: unknown[] }[] = [];
    const s = new NeonLeadEventStore(async (text, params) => {
      seen.push({ text, params });
      return text.startsWith("UPDATE cc_lead_events SET names_you") ? [{ id: "x" }] : [];
    });
    expect(await s.setImportedNamesYou("lo1", [])).toBe(0);
    expect(await s.setImportedNamesYou("lo1", [{ id: "le_a'); DROP TABLE x;--", namesYou: true }, { id: "le_b", namesYou: false }])).toBe(2);
    const ups = seen.filter((q) => q.text.startsWith("UPDATE cc_lead_events"));
    expect(ups).toHaveLength(2);
    for (const u of ups) {
      expect(u.text).toContain("owner_user_id = $1 AND origin = 'import' AND id = ANY($2::text[])");
      expect(u.text).not.toContain("DROP");
      expect(u.params![0]).toBe("lo1");
    }
    expect(ups.map((u) => u.params![2])).toEqual([true, false]);
  });

  it("the scorecard's note says imported leads count when permission was confirmed at import", () => {
    expect(LEADS.score.canCallNote).toMatch(/import/i);
  });
});
