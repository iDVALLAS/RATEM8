import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { autoMap, buildRecords, type ImportRecord } from "./mapping";
import { mergeRecords, smartMap } from "./smart";
import { MemoryContactStore, NeonContactStore, setContactStoreForTests, type Contact } from "./store";
import { importBatch } from "./service";
import { bulkTags, deleteTag, mergeTag, renameTag, setContactTags } from "./tagging";
import { cleanTag, importedTag, mergeTags, renameIn, tagHref, withExtraTags, withoutTag } from "./tags";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";

const user = (id: string, role: User["role"], extra: Partial<User> = {}): User => ({ id, email: `${id}@x.com`, name: id, role, mloId: "mlo-001", status: "active", createdAt: "2026-11-18T00:00:00Z", createdBy: "t", ...extra });
const rec = (over: Partial<ImportRecord> = {}): ImportRecord => ({ firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [], ...over });
let n = 0;
const contact = (owner: string, tags: string[], over: Partial<Contact> = {}): Contact => {
  n++;
  return { ...rec({ email: `p${n}@x.com`, phone: null, firstName: `P${n}` }), id: `c_${n}`, ownerUserId: owner, kind: "contact", provenance: "personal", locked: false, source: "test", createdAt: "2026-11-21T00:00:00Z", updatedAt: "2026-11-21T00:00:00Z", ...over, tags };
};

describe("tag helpers (D73)", () => {
  it("tidies, dedupes in any capitals (first spelling wins) and dates the import tag", () => {
    expect(cleanTag("  Open\thouse  \n 2026 ")).toBe("Open house 2026");
    expect(cleanTag("x".repeat(80))).toHaveLength(60);
    expect(mergeTags(["VIP", "past client"], ["vip", " Past  Client ", "", "Agent"])).toEqual(["VIP", "past client", "Agent"]);
    expect(importedTag(new Date("2026-11-21T18:00:00Z"), "America/Los_Angeles")).toBe("Imported Nov 21, 2026");
    // The loan officer's own day: late evening Pacific is already the next day in UTC.
    expect(importedTag(new Date("2026-11-22T05:00:00Z"), "America/Los_Angeles")).toBe("Imported Nov 21, 2026");
    expect(withoutTag(["VIP", "Lead"], "vip")).toEqual(["Lead"]);
    expect(renameIn(["Old", "New", "Lead"], "old", "New")).toEqual(["New", "Lead"]);
    expect(tagHref("Imported Nov 21, 2026", "agent", { select: "all" })).toBe("/mlo/contacts?kind=agent&tag=Imported+Nov+21%2C+2026&select=all");
  });

  it("extra tags always fit: the file's tags fill what's left", () => {
    const file = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const out = withExtraTags(file, ["Imported Nov 21, 2026", "Open house"]);
    expect(out).toHaveLength(20);
    expect(out.slice(-2)).toEqual(["Imported Nov 21, 2026", "Open house"]);
    expect(out[0]).toBe("t0");
  });
});

describe("tags at import (D73)", () => {
  it("merges extraTags with the file's tags column, deduped and capped at 20", () => {
    const csv = parseCsv(readFileSync(join(process.cwd(), "tests/fixtures/import/past-clients-messy.csv"), "utf8"));
    const extra = ["Imported Nov 21, 2026", "Spring mailer", "PAST CLIENT"];
    const { records } = buildRecords(csv, smartMap(csv, "contacts"), "contacts", { fileName: "past-clients-messy.csv", extraTags: extra });
    expect(records.length).toBeGreaterThan(3);
    for (const r of records) for (const t of ["Imported Nov 21, 2026", "Spring mailer"]) expect(r.tags).toContain(t);
    const john = records.find((r) => r.firstName === "John")!;
    // "past client" from the file and "PAST CLIENT" picked for the import are one tag, in the picked spelling,
    // so everyone from the import carries exactly the tag the loan officer chose.
    expect(john.tags).toEqual(["realtor", "Imported Nov 21, 2026", "Spring mailer", "PAST CLIENT"]);
    const many = parseCsv(`Name,Phone,Tags\nAnn Lee,(206) 555-1234,"${Array.from({ length: 25 }, (_, i) => `t${i}`).join(";")}"\n`);
    const r = buildRecords(many, autoMap(many.headers, "contacts"), "contacts", { extraTags: ["Imported Nov 21, 2026", "a", "a"] });
    expect(r.records[0].tags).toHaveLength(20);
    expect(r.records[0].tags.slice(-2)).toEqual(["Imported Nov 21, 2026", "a"]);
    expect(r.warnings.some((w) => w.reason.startsWith("tags"))).toBe(true);
  });

  it("a list's own tags go only to that list; merging the two lists keeps both", () => {
    const a = buildRecords(parseCsv("Name,Phone\nAnn Lee,(206) 555-1234\n"), { fullName: 0, phone: 1 }, "contacts", { extraTags: ["Imported Nov 21, 2026", "Zillow"] }).records;
    const b = buildRecords(parseCsv("Name,Phone\nAnn Lee,(206) 555-1234\nBo Park,(425) 555-2222\n"), { fullName: 0, phone: 1 }, "contacts", { extraTags: ["Imported Nov 21, 2026", "Open house"] }).records;
    const merged = mergeRecords([a, b]).records;
    expect(merged.find((r) => r.firstName === "Ann")!.tags).toEqual(["Imported Nov 21, 2026", "Zillow", "Open house"]);
    expect(merged.find((r) => r.firstName === "Bo")!.tags).toEqual(["Imported Nov 21, 2026", "Open house"]);
  });
});

describe("tagging contacts (D73)", () => {
  let store: MemoryContactStore;
  beforeEach(() => {
    store = new MemoryContactStore();
    setContactStoreForTests(store);
    setAccountStoreForTests(new MemoryAccountStore());
  });
  afterEach(() => {
    setContactStoreForTests(null);
    setAccountStoreForTests(null);
  });

  it("the tag filter is exact: Smith doesn't find Smithfield (memory store)", async () => {
    await store.put(contact("lo1", ["Smithfield"]));
    await store.put(contact("lo1", ["Smith", "VIP"]));
    await store.put(contact("lo2", ["Smith"]));
    expect((await store.list({ ownerUserId: "lo1", tag: "Smith" })).total).toBe(1);
    expect((await store.list({ ownerUserId: "lo1", tag: "Smithfield" })).total).toBe(1);
    expect((await store.list({ ownerUserId: "lo1", tag: "smith" })).total).toBe(0);
    // Search is different: it looks inside words.
    expect((await store.list({ ownerUserId: "lo1", q: "smith" })).total).toBe(2);
    expect(await store.tagCounts("lo1")).toEqual([{ tag: "Smith", count: 1 }, { tag: "Smithfield", count: 1 }, { tag: "VIP", count: 1 }]);
    expect((await store.tagCounts(undefined)).find((t) => t.tag === "Smith")!.count).toBe(2);
  });

  it("the tag filter is exact in Neon too (jsonb has-element, the tag as a parameter)", async () => {
    const calls: { text: string; params: unknown[] }[] = [];
    const neon = new NeonContactStore(async (text, params = []) => {
      calls.push({ text, params });
      return /count\(\*\)/.test(text) ? [{ n: 0 }] : [];
    });
    await neon.list({ ownerUserId: "lo1", kind: "contact", q: "smith", tag: "Smith" });
    const q = calls.find((c) => /count\(\*\)/.test(c.text))!;
    expect(q.text).toMatch(/body->'tags' \? \$4/);
    expect(q.params).toEqual(["lo1", "contact", "%smith%", "Smith"]);
    await neon.tagCounts("lo1", "agent");
    const t = calls.at(-1)!;
    expect(t.text).toMatch(/jsonb_array_elements_text/);
    expect(t.text).toMatch(/owner_user_id = \$1 AND kind = \$2/);
    expect(t.params).toEqual(["lo1", "agent"]);
  });

  it("an import's tags land on new and merged people, and the date tag finds everyone from it", async () => {
    const lo = user("lo1", "lo");
    await importBatch(lo, "contacts", [rec({ tags: ["Old list"] })], "a.csv");
    await importBatch(lo, "contacts", [rec({ tags: ["Imported Nov 21, 2026"] }), rec({ email: "bo@x.com", phone: null, firstName: "Bo", tags: ["Imported Nov 21, 2026"] })], "b.csv");
    const found = await store.list({ ownerUserId: "lo1", tag: "Imported Nov 21, 2026" });
    expect(found.total).toBe(2);
    expect(found.contacts.find((c) => c.firstName === "Ann")!.tags).toEqual(["Old list", "Imported Nov 21, 2026"]);
  });

  it("rename and merge change every contact in the book, and delete needs nothing else", async () => {
    const lo = user("lo1", "lo");
    await store.put(contact("lo1", ["Zillow", "VIP"]));
    await store.put(contact("lo1", ["Zillow"]));
    await store.put(contact("lo1", ["Zillow leads", "Zillow"]));
    await store.put(contact("lo2", ["Zillow"]));
    expect(await renameTag(lo, "Zillow", "Zillow leads")).toEqual({ ok: true, changed: 3, skipped: 0 });
    expect((await store.list({ ownerUserId: "lo1", tag: "Zillow" })).total).toBe(0);
    expect((await store.list({ ownerUserId: "lo1", tag: "Zillow leads" })).total).toBe(3);
    expect((await store.list({ ownerUserId: "lo1", tag: "Zillow leads" })).contacts.every((c) => c.tags.filter((t) => t === "Zillow leads").length === 1)).toBe(true);
    // Another loan officer's book is untouched.
    expect((await store.list({ ownerUserId: "lo2", tag: "Zillow" })).total).toBe(1);
    // Merge into needs an existing tag.
    expect((await mergeTag(lo, "VIP", "Nope")).ok).toBe(false);
    expect(await mergeTag(lo, "VIP", "Zillow leads")).toEqual({ ok: true, changed: 1, skipped: 0 });
    expect(await store.tagCounts("lo1")).toEqual([{ tag: "Zillow leads", count: 3 }]);
    expect(await deleteTag(lo, "Zillow leads")).toEqual({ ok: true, changed: 3, skipped: 0 });
    expect((await store.list({ ownerUserId: "lo1" })).total).toBe(3);
    expect(await store.tagCounts("lo1")).toEqual([]);
  });

  it("the bulk action refuses ids outside the loan officer's book, and changes nothing", async () => {
    const lo = user("lo1", "lo");
    const mine = contact("lo1", []);
    const theirs = contact("lo2", []);
    await store.put(mine);
    await store.put(theirs);
    const r = await bulkTags(lo, { ids: [mine.id, theirs.id] }, { op: "addTag", tag: "Spring" });
    expect(r.ok).toBe(false);
    expect((await store.get(mine.id))!.tags).toEqual([]);
    expect((await store.get(theirs.id))!.tags).toEqual([]);
    expect((await bulkTags(lo, { ids: ["c_missing"] }, { op: "addTag", tag: "Spring" })).ok).toBe(false);
    expect(await bulkTags(lo, { ids: [mine.id] }, { op: "addTag", tag: "Spring" })).toEqual({ ok: true, changed: 1, skipped: 0 });
    expect((await store.get(mine.id))!.tags).toEqual(["Spring"]);
    // A paused account changes nothing.
    expect((await bulkTags(user("lo1", "lo", { status: "disabled" as User["status"] }), { ids: [mine.id] }, { op: "removeTag", tag: "Spring" })).ok).toBe(false);
  });

  it("Select all matching tags everyone the filter finds in the book, and removing is exact", async () => {
    const lo = user("lo1", "lo");
    for (let i = 0; i < 3; i++) await store.put(contact("lo1", ["Imported Nov 21, 2026"]));
    await store.put(contact("lo1", ["Other"]));
    await store.put(contact("lo2", ["Imported Nov 21, 2026"]));
    expect(await bulkTags(lo, { filter: { kind: "contact", tag: "Imported Nov 21, 2026" } }, { op: "addTag", tag: "Spring mailer" })).toEqual({ ok: true, changed: 3, skipped: 0 });
    expect((await store.list({ ownerUserId: "lo1", tag: "Spring mailer" })).total).toBe(3);
    expect((await store.list({ ownerUserId: "lo2", tag: "Spring mailer" })).total).toBe(0);
    // Removing the very tag the list is filtered by still reaches everyone (read first, then changed).
    expect(await bulkTags(lo, { filter: { kind: "contact", tag: "Imported Nov 21, 2026" } }, { op: "removeTag", tag: "Imported Nov 21, 2026" })).toEqual({ ok: true, changed: 3, skipped: 0 });
    expect((await store.list({ ownerUserId: "lo1", tag: "Imported Nov 21, 2026" })).total).toBe(0);
  });

  it("a full contact is skipped when adding, and the contact page's tags are cleaned and capped", async () => {
    const lo = user("lo1", "lo");
    const full = contact("lo1", Array.from({ length: 30 }, (_, i) => `t${i}`));
    await store.put(full);
    expect(await bulkTags(lo, { ids: [full.id] }, { op: "addTag", tag: "One more" })).toEqual({ ok: true, changed: 0, skipped: 1 });
    const c = contact("lo1", []);
    await store.put(c);
    expect(await setContactTags(lo, c.id, [" VIP ", "vip", "Open  house"])).toEqual({ ok: true, tags: ["VIP", "Open house"] });
    expect((await setContactTags(lo, c.id, Array.from({ length: 31 }, (_, i) => `x${i}`))).ok).toBe(false);
    expect((await setContactTags(user("lo2", "lo"), c.id, ["Mine now"])).ok).toBe(false);
    expect((await store.get(c.id))!.tags).toEqual(["VIP", "Open house"]);
  });

  it("an assistant tags in the officer's book, and only there", async () => {
    const asst = user("as1", "assistant", { assistsUserId: "lo1" });
    const officers = contact("lo1", ["Zillow"]);
    const other = contact("lo2", ["Zillow"]);
    await store.put(officers);
    await store.put(other);
    expect(await bulkTags(asst, { ids: [officers.id] }, { op: "addTag", tag: "Called" })).toEqual({ ok: true, changed: 1, skipped: 0 });
    expect((await bulkTags(asst, { ids: [other.id] }, { op: "addTag", tag: "Called" })).ok).toBe(false);
    expect((await setContactTags(asst, officers.id, ["Zillow", "Called", "Hot"])).ok).toBe(true);
    expect(await renameTag(asst, "Zillow", "Zillow leads")).toEqual({ ok: true, changed: 1, skipped: 0 });
    expect((await store.get(officers.id))!.tags).toEqual(["Zillow leads", "Called", "Hot"]);
    expect((await store.get(other.id))!.tags).toEqual(["Zillow"]);
    // The assistant's own (empty) book is never where it lands, and an unassigned assistant changes nothing.
    expect((await renameTag(user("as2", "assistant"), "Zillow", "X")).ok).toBe(false);
    expect(await bulkTags(asst, { filter: { kind: "contact", tag: "Called" } }, { op: "removeTag", tag: "Called" })).toEqual({ ok: true, changed: 1, skipped: 0 });
  });
});
