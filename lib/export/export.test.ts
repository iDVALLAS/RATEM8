import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, recordConsent } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { cell, toCsv } from "./csv";
import { crc32, zip } from "./zip";
import { buildExport } from "./service";

/** Reads our own zips back (local headers), checking every CRC. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
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
    if (crc32(data) !== crc) throw new Error(`bad crc for ${name}`);
    out.set(name, data);
    p += 30 + nameLen + extra + size;
  }
  expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50);
  return out;
}

const NOW = new Date("2026-11-20T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const other: User = { ...me, id: "lo2", email: "lo2@x.com" };
const rec = (first: string, extra: Record<string, unknown> = {}) => ({ firstName: first, lastName: "Lee", email: `${first.toLowerCase()}@example.com`, phone: `+1206555${String(first.length * 1000 + first.charCodeAt(0)).padStart(4, "0").slice(-4)}`, phone2: null, street: "12 Elm St", city: "Bellevue", state: "WA", zip: "98004", relationship: "past_client", tags: [], notes: null, loan: { closedOn: "2021-04-01", amount: 450000, noteRate: 6 }, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...extra });

describe("Download everything (D53.1)", () => {
  let contacts: MemoryContactStore;
  let touches: MemoryTouchStore;
  beforeEach(async () => {
    contacts = new MemoryContactStore();
    touches = new MemoryTouchStore();
    setContactStoreForTests(contacts);
    setTouchStoreForTests(touches);
    setAccountStoreForTests(new MemoryAccountStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    await importBatch(me, "contacts", [rec("Ann", { notes: "=HYPERLINK(\"http://evil\")" }), rec("Bo")], "a.csv", "personal", NOW);
    await importBatch(other, "contacts", [rec("Zed")], "b.csv", "personal", NOW);
  });
  afterEach(() => {
    for (const f of [setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setConciergeStoreForTests]) f(null);
  });

  it("writes zips that unpack byte for byte", () => {
    const big = "line, with \"quotes\"\n".repeat(500);
    const files = unzip(zip([{ name: "a.csv", data: big }, { name: "dir/é.txt", data: "short" }, { name: "b.bin", data: Buffer.from([0, 1, 2, 255]) }], NOW));
    expect(files.get("a.csv")!.toString()).toBe(big);
    expect(files.get("dir/é.txt")!.toString()).toBe("short");
    expect([...files.get("b.bin")!]).toEqual([0, 1, 2, 255]);
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("writes spreadsheet cells that can't run as formulas, and keeps phone numbers readable", () => {
    expect(cell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(cell("@cmd")).toBe("'@cmd");
    expect(cell("-2+3+cmd|' /C calc'!A0")).toMatch(/^"?'/);
    expect(cell("+12065551234")).toBe("+12065551234");
    expect(cell("-12.50")).toBe("-12.50");
    expect(cell(-5)).toBe("-5");
    expect(cell('say "hi", ok')).toBe('"say ""hi"", ok"');
    const csv = toCsv([{ a: 1, b: { c: "x" } }, { a: 2, d: [1, 2] }]);
    expect(csv.startsWith("﻿a,b.c,d\r\n")).toBe(true);
  });

  it("holds the whole book, only the loan officer's own, with nothing secret", async () => {
    const [ann] = (await contacts.list({ ownerUserId: "lo1" })).contacts.filter((c) => c.firstName === "Ann");
    await recordConsent(me, ann.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "Signed form 2021" }, NOW);
    await touches.add({ id: "t1", contactId: ann.id, ownerUserId: "lo1", channel: "text", purpose: "service", direction: "out", body: "Hi Ann", status: "sent", providerId: null, note: null, at: NOW.toISOString(), actor: "lo1@x.com" });
    const r = await buildExport(me, NOW);
    expect(r.filename).toBe("loanm8-everything-2026-11-20.zip");
    const files = unzip(r.file);
    for (const f of ["README.txt", "contacts.csv", "agents.csv", "permission-records.csv", "messages.csv", "notes.csv", "reminders.csv", "loans.csv", "campaigns.csv", "templates.csv", "cards-by-mail.csv", "expenses.csv", "my-signature.txt"]) expect(files.has(f), f).toBe(true);
    const contactsCsv = files.get("contacts.csv")!.toString("utf8");
    expect(contactsCsv).toContain("Ann Lee");
    expect(contactsCsv).toContain("Bo Lee");
    expect(contactsCsv).not.toContain("Zed");
    expect(contactsCsv).toContain("'=HYPERLINK");
    expect(contactsCsv).not.toContain("ownerUserId");
    expect(files.get("permission-records.csv")!.toString()).toContain("Signed form 2021");
    expect(files.get("messages.csv")!.toString()).toContain("Hi Ann");
    expect(r.counts).toMatchObject({ contacts: 2, permissions: 1, messages: 1 });
    expect(files.get("README.txt")!.toString()).toMatch(/Not included, on purpose: passwords/);
    const everything = [...files.values()].map((b) => b.toString("utf8")).join("\n");
    expect(everything).not.toMatch(/Sealed|refreshSealed|accessSealed/);
  });
});
