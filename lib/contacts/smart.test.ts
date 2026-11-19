import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readXlsx, serialToIso, colIndex } from "./xlsx";
import { mergeRecords, parseVcf, relationshipFromName, shapeOf, shapes, smartMap, sniffColumn, toCleanCsv, toTable } from "./smart";
import { buildRecords } from "./mapping";
import { isoDate } from "./normalize";
import { parseCsv } from "./csv";
import { aiMapColumns, type MapCall } from "./ai-map";
import { MemoryUsageStore, setUsageStoreForTests } from "@/lib/ai/meter";

const inflate = async (d: Uint8Array) => new Uint8Array(inflateRawSync(d));
const FIXTURE = join(process.cwd(), "fixtures/contacts/sample.xlsx");

describe("Reading Excel without a library (D42)", () => {
  it("reads every sheet, rich text, and date cells as dates", async () => {
    const sheets = await readXlsx(new Uint8Array(readFileSync(FIXTURE)), inflate);
    expect(sheets.map((s) => s.name)).toEqual(["Past Clients", "Leads"]);
    const t = toTable(sheets[0].rows);
    // The title row above the headers is skipped.
    expect(t.headers).toEqual(["Client Name", "Cell", "E-mail Address", "Property ZIP", "Funded", "Loan Amt", "Rate", "Lead Source"]);
    expect(t.rows[0]).toEqual(["Lee, Ann", "(206) 555-1234", "ANN@Example.com", "98033", "2021-04-01", "450000", "3.125", "Referral"]);
    expect(t.rows).toHaveLength(4);
    expect(toTable(sheets[1].rows).rows[0]).toEqual(["Eve", "Ola", "509-555-0199", "eve@example.com"]);
    expect(colIndex("AB12")).toBe(27);
    expect(serialToIso(44287)).toBe("2021-04-01");
    await expect(readXlsx(new Uint8Array([1, 2, 3]), inflate)).rejects.toThrow();
  });

  it("turns the sheet into clean, matched records", async () => {
    const sheets = await readXlsx(new Uint8Array(readFileSync(FIXTURE)), inflate);
    const t = toTable(sheets[0].rows);
    const m = smartMap(t, "contacts");
    expect(m).toMatchObject({ fullName: 0, phone: 1, email: 2, zip: 3, closedOn: 4, loanAmount: 5, noteRate: 6 });
    const { records, problems } = buildRecords(t, m, "contacts", { defaultRelationship: relationshipFromName(sheets[0].name) });
    expect(records[0]).toMatchObject({ firstName: "Ann", lastName: "Lee", email: "ann@example.com", phone: "+12065551234", state: "WA", relationship: "past_client", loan: { closedOn: "2021-04-01", amount: 450000, noteRate: 3.125 } });
    expect(records.map((r) => r.state)).toEqual(["WA", "WA", "OR", null]);
    expect(problems).toEqual([]);
  });
});

describe("Phone contacts, tables, matching and merging (D42)", () => {
  it("reads vCards, never birthdays", () => {
    const t = parseVcf("BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lee;Ann;;;\r\nFN:Ann Lee\r\nTEL;TYPE=CELL:(206) 555-1234\r\nTEL;TYPE=HOME:425 555 2345\r\nEMAIL;TYPE=INTERNET:ann@example.com\r\nADR;TYPE=HOME:;;12 Elm St;Kirkland;WA;98033;USA\r\nBDAY:1980-01-02\r\nNOTE:Met at the\r\n  open house\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Bo Park\r\nitem1.TEL:4255557777\r\nEND:VCARD\r\n");
    expect(t.rows).toHaveLength(2);
    const { records } = buildRecords(t, smartMap(t, "contacts"), "contacts");
    expect(records[0]).toMatchObject({ firstName: "Ann", lastName: "Lee", phone: "+12065551234", phone2: "+14255552345", city: "Kirkland", state: "WA", notes: "Met at the open house" });
    expect(JSON.stringify(t)).not.toContain("1980");
    expect(records[1]).toMatchObject({ firstName: "Bo", lastName: "Park", phone: "+14255557777" });
  });

  it("finds headers, or makes them when a file has none, and matches columns by their contents", () => {
    const noHeader = toTable([["Ann Lee", "ann@example.com", "2065551234", "98033"], ["Bo Park", "bo@example.com", "4255552345", "98004"]]);
    expect(noHeader.headers).toEqual(["Column 1", "Column 2", "Column 3", "Column 4"]);
    expect(noHeader.rows).toHaveLength(2);
    expect(smartMap(noHeader, "contacts")).toMatchObject({ fullName: 0, email: 1, phone: 2, zip: 3 });
    expect(sniffColumn(["WA", "Oregon", "az"])).toBe("state");
    expect(sniffColumn(["3.125", "6.5", "5.875"])).toBe("rate");
    expect(sniffColumn(["450000", "$610,000"])).toBe("money");
    // Excel dates exported as plain numbers.
    expect(isoDate("44287")).toBe("2021-04-01");
    expect(isoDate("45231a")).toBeNull();
    expect(isoDate("3021-01-01")).toBeNull();
  });

  it("M8 sees shapes, never values", () => {
    expect(shapeOf("Ann Lee")).toBe("Aaa Aaa");
    expect(shapeOf("(206) 555-1234")).toBe("(999) 999-9999");
    expect(shapeOf("ann@example.com")).toBe("aaa@aaaaaaa.aaa");
    const t = parseCsv("Name,Phone\nAnn Lee,2065551234\nBo Park,4255552345\n");
    const s = JSON.stringify(shapes(t));
    expect(s).not.toMatch(/Ann|Lee|206|425/);
  });

  it("merges duplicates across files, fills gaps, and sorts by last name", () => {
    const a = buildRecords(parseCsv("Name,Phone,Email\nZed Young,2065551111,\nAnn Lee,2065551234,\n"), { fullName: 0, phone: 1, email: 2 }, "contacts").records;
    const b = buildRecords(parseCsv("First,Last,Email,Mobile,City\nAnn,Lee,ann@example.com,(206) 555-1234,Kirkland\n"), { firstName: 0, lastName: 1, email: 2, phone: 3, city: 4 }, "contacts", { defaultRelationship: "past_client" }).records;
    const m = mergeRecords([a, b]);
    expect(m.merged).toBe(1);
    expect(m.records.map((r) => r.lastName)).toEqual(["Lee", "Young"]);
    expect(m.records[0]).toMatchObject({ email: "ann@example.com", city: "Kirkland", relationship: "past_client" });
    const csv = toCleanCsv([{ ...m.records[0], notes: "=HYPERLINK(1)" }]);
    expect(csv.split("\n")[0]).toMatch(/^First name,Last name,Email,Mobile/);
    expect(csv).toContain("'=HYPERLINK(1)");
  });
});

describe("Bulk (D42)", () => {
  it("cleans and merges 10,000 rows quickly", () => {
    const lines = ["Name,Phone,Email,State"];
    for (let i = 0; i < 10_000; i++) lines.push(`Person ${i},(206) ${String(200 + (i % 700)).padStart(3, "0")}-${String(1000 + i).slice(-4)},p${i % 9000}@example.com,WA`);
    const t = parseCsv(lines.join("\n"));
    const start = Date.now();
    const { records } = buildRecords(t, smartMap(t, "contacts"), "contacts");
    const m = mergeRecords([records]);
    expect(Date.now() - start).toBeLessThan(3000);
    expect(records.length).toBe(10_000);
    expect(m.records.length).toBeLessThan(10_000); // the repeated emails merged
    expect(m.merged).toBe(10_000 - m.records.length);
  });
});

describe("M8 column matching (D42)", () => {
  beforeEach(() => setUsageStoreForTests(new MemoryUsageStore()));
  afterEach(() => setUsageStoreForTests(null));
  const cols = [{ header: "Client", shapes: ["Aaa Aaa"] }, { header: "Cell", shapes: ["(999) 999-9999"] }, { header: "Funded", shapes: ["9999-99-99"] }];

  it("sends headers and shapes only, keeps each field once, and never runs on agent lists", async () => {
    let sent = "";
    const call: MapCall = async (_s, u) => {
      sent = u;
      return { stop: "end_turn", json: JSON.stringify({ columns: [{ column: 0, field: "fullName" }, { column: 1, field: "phone" }, { column: 2, field: "phone" }, { column: 9, field: "email" }], relationship: "past_client" }) };
    };
    const r = await aiMapColumns({ id: "lo1" }, { fileName: "Past clients 2021.xlsx", kind: "contacts", columns: [...cols, { header: "Leak", shapes: ["Ann Lee"] }] }, { call });
    expect(r).toEqual({ ok: true, mapping: { fullName: 0, phone: 1 }, relationship: "past_client" });
    expect(sent).toContain("Aaa Aaa");
    expect(sent).not.toContain("Ann Lee"); // a "shape" that's really a value is dropped
    expect(await aiMapColumns({ id: "lo1" }, { fileName: "retr.csv", kind: "agents", columns: cols }, { call })).toMatchObject({ ok: false });
    expect(await aiMapColumns({ id: "lo1" }, { fileName: "x.csv", kind: "contacts", columns: cols }, { call: async () => ({ stop: "end_turn", json: "{bad" }) })).toMatchObject({ ok: false });
  });
});
