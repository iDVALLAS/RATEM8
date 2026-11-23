import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BOOK_CAP, LIST_PAGE_MAX, listAll, MemoryContactStore, setContactStoreForTests, type Contact } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryPipelineStore, setPipelineStoreForTests, type Loan } from "@/lib/pipeline/store";
import { MemoryExpenseStore, setExpenseStoreForTests } from "@/lib/expenses/store";
import { MemoryImportStore, setImportStoreForTests } from "@/lib/contacts/imports";
import { MemoryLeadEventStore, setLeadEventStoreForTests } from "@/lib/leads/events";
import { MemoryMonthlyStore, setMonthlyStoreForTests } from "@/lib/leads/spend";
import { buildExport } from "@/lib/export/service";
import { crc32 } from "@/lib/export/zip";
import { syncLeadEvents } from "@/lib/leads/sync";
import { scorecardFor } from "@/lib/leads/score-service";
import { recentLeads } from "@/lib/leads/recent";
import { SPHERE_KEY } from "@/lib/leads/source-key";

/** D87.2: a book bigger than one page (500) is read whole, everywhere the whole book is promised. */

const NOW = new Date("2026-11-22T18:00:00Z");
const BOOK = 1234;
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const other: User = { ...me, id: "lo2", email: "lo2@x.com" };

const person = (owner: string, i: number, over: Partial<Contact> = {}): Contact => ({
  id: `${owner}_c${String(i).padStart(5, "0")}`,
  ownerUserId: owner,
  kind: "contact",
  provenance: "personal",
  locked: false,
  source: "import:book.csv",
  createdAt: "2026-01-05T10:00:00.000Z",
  updatedAt: "2026-01-05T10:00:00.000Z",
  firstName: `F${i}`,
  // Last names sort in id order (A0000 … A1233), so "the first 500" is a fixed set.
  lastName: `A${String(i).padStart(4, "0")}`,
  email: `p${i}@example.com`,
  phone: null,
  phone2: null,
  street: null,
  city: null,
  state: "WA",
  zip: null,
  relationship: "past_client",
  tags: i % 2 ? ["odd"] : [],
  notes: null,
  loan: null,
  agent: null,
  ...over,
});

/** Reads our own zips back (local headers). */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const crc = buf.readUInt32LE(p + 14);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString("utf8");
    const body = buf.subarray(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    expect(crc32(data)).toBe(crc);
    out.set(name, data.toString("utf8"));
    p += 30 + nameLen + extra + size;
  }
  return out;
}

describe("reading a whole book past 500 people (D87.2)", () => {
  let contacts: MemoryContactStore;
  let events: MemoryLeadEventStore;
  let pipeline: MemoryPipelineStore;
  beforeEach(async () => {
    contacts = new MemoryContactStore();
    events = new MemoryLeadEventStore();
    pipeline = new MemoryPipelineStore();
    setContactStoreForTests(contacts);
    setLeadEventStoreForTests(events);
    setPipelineStoreForTests(pipeline);
    setTouchStoreForTests(new MemoryTouchStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setExpenseStoreForTests(new MemoryExpenseStore());
    setMonthlyStoreForTests(new MemoryMonthlyStore());
    setImportStoreForTests(new MemoryImportStore());
    for (let i = 0; i < BOOK; i++) await contacts.put(person(me.id, i));
    // Someone else's book, interleaved by name: never read into ours.
    for (let i = 0; i < 30; i++) await contacts.put(person(other.id, i * 40));
  });
  afterEach(() => {
    for (const f of [setContactStoreForTests, setLeadEventStoreForTests, setPipelineStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setConciergeStoreForTests, setExpenseStoreForTests, setMonthlyStoreForTests, setImportStoreForTests]) f(null);
  });

  it("the memory store returns at most 500 a call, like Neon, whatever the limit asks", async () => {
    expect(LIST_PAGE_MAX).toBe(500);
    for (const limit of [501, 2000, 5000, 100_000]) {
      const r = await contacts.list({ ownerUserId: me.id, limit });
      expect(r.contacts).toHaveLength(500);
      expect(r.total).toBe(BOOK);
    }
    const last = await contacts.list({ ownerUserId: me.id, limit: 500, offset: 1000 });
    expect(last.contacts).toHaveLength(BOOK - 1000);
    expect((await contacts.list({ ownerUserId: me.id })).contacts).toHaveLength(50);
  });

  it("listAll returns every one of 1,234, once each, in name order, and only from that book", async () => {
    const r = await listAll({ ownerUserId: me.id });
    expect(r.total).toBe(BOOK);
    expect(r.capped).toBe(false);
    expect(r.contacts).toHaveLength(BOOK);
    expect(new Set(r.contacts.map((c) => c.id)).size).toBe(BOOK);
    expect(r.contacts.every((c) => c.ownerUserId === me.id)).toBe(true);
    expect(r.contacts.map((c) => c.lastName)).toEqual(Array.from({ length: BOOK }, (_, i) => `A${String(i).padStart(4, "0")}`));
  });

  it("listAll keeps the filter on every page and says when a cap stopped it", async () => {
    const odd = await listAll({ ownerUserId: me.id, tag: "odd" });
    expect(odd.contacts).toHaveLength(617);
    expect(odd.contacts.every((c) => c.tags.includes("odd") && c.ownerUserId === me.id)).toBe(true);
    const ruled = await listAll({ ownerUserId: me.id, rule: { tagsAny: ["odd"] } });
    expect(ruled.contacts).toHaveLength(617);
    const capped = await listAll({ ownerUserId: me.id }, { cap: 1000 });
    expect(capped).toMatchObject({ total: BOOK, capped: true });
    expect(capped.contacts).toHaveLength(1000);
    // Never past the book cap, whatever a caller asks.
    expect((await listAll({ ownerUserId: me.id }, { cap: 10 * BOOK_CAP })).contacts).toHaveLength(BOOK);
  });

  it("getMany reads people by id, leaving out ids it doesn't find", async () => {
    const got = await contacts.getMany([`${me.id}_c01200`, `${me.id}_c00003`, "nobody", `${me.id}_c01200`]);
    expect(got.map((c) => c.id).sort()).toEqual([`${me.id}_c00003`, `${me.id}_c01200`]);
    expect(await contacts.getMany([])).toEqual([]);
  });

  it("Download everything holds all 1,234 people", async () => {
    const r = await buildExport(me, NOW);
    expect(r.counts.contacts).toBe(BOOK);
    const files = unzip(r.file);
    const csv = files.get("contacts.csv")!;
    expect(csv).toContain("A1233");
    expect(csv).not.toContain(`${other.id}_c`);
    expect(files.get("README.txt")).toContain(`contacts: ${BOOK}`);
    expect(files.get("README.txt")).not.toContain("This download holds the first");
  });

  it("the lead backfill and the scorecard see the whole book", async () => {
    // Imported leads all through the book; the last ones sort far past the first 500.
    for (let i = 0; i < BOOK; i += 3) await contacts.put(person(me.id, i, { leadSource: "Zillow", provenance: "lead_vendor", relationship: "lead" }));
    const leads = Math.ceil(BOOK / 3);
    const synced = await syncLeadEvents(me, { now: NOW });
    expect(synced.added).toBe(leads);
    expect(new Set(synced.events.map((e) => e.contactId)).has(`${me.id}_c01233`)).toBe(true);
    // A past client far down the book (no lead event) closes a loan this month: Past clients & sphere, not "no source".
    const loan: Loan = { id: "l1", ownerUserId: me.id, externalId: "x1", source: "arive", contactId: `${me.id}_c01231`, borrowerName: "", purpose: null, loanType: null, amount: null, noteRate: null, milestone: "Funded", milestoneAt: "2026-11-18T00:00:00.000Z", history: [], keyDates: { application: "2026-10-01", lockExpires: null, appraisal: null, clearToClose: null, closing: "2026-11-18" }, agentName: null, closed: true, dead: false, updatedAt: NOW.toISOString() };
    await pipeline.put(loan);
    const card = await scorecardFor(me, "90d", NOW, { events: synced.events });
    expect(card.unattributed).toBe(0);
    expect(card.rows.find((r) => r.key === SPHERE_KEY)?.closed).toBe(1);
  });

  it("Recent leads finds a lead whose person sorts after the first 500", async () => {
    const far = person(me.id, 1230, { lastName: "Zulu", leadSource: "Zillow", provenance: "lead_vendor", relationship: "lead" });
    await contacts.put(far);
    await events.addMany([
      { id: "e1", ownerUserId: me.id, sourceKey: "zillow", sourceLabel: "Zillow", contactId: far.id, at: "2026-11-21T10:00:00.000Z", duplicate: false, namesYou: true, externalId: null, origin: "delivery", datedBy: "delivery" },
      { id: "e2", ownerUserId: me.id, sourceKey: "zillow", sourceLabel: "Zillow", contactId: "deleted-person", at: "2026-11-21T11:00:00.000Z", duplicate: false, namesYou: true, externalId: null, origin: "delivery", datedBy: "delivery" },
      { id: "e3", ownerUserId: other.id, sourceKey: "zillow", sourceLabel: "Zillow", contactId: `${other.id}_c00040`, at: "2026-11-21T12:00:00.000Z", duplicate: false, namesYou: true, externalId: null, origin: "delivery", datedBy: "delivery" },
    ]);
    // Not in the first page by name …
    expect((await contacts.list({ ownerUserId: me.id, kind: "contact", limit: 500 })).contacts.some((c) => c.id === far.id)).toBe(false);
    // … and still on Recent leads; a deleted person and someone else's lead are left out.
    const rows = await recentLeads(me.id, [...(await events.list(me.id)), ...(await events.list(other.id))]);
    expect(rows.map((r) => [r.contact.id, r.event.id])).toEqual([[far.id, "e1"]]);
  });
});
