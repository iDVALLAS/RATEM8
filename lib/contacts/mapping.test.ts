import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { autoMap, buildRecords, guardOptOuts, headerAllowed, optOutFieldOf, MAX_TAG, stopsEverything } from "./mapping";
import { mergeRecords, smartMap, toCleanCsv } from "./smart";
import { importIssueText } from "./issues";

const fixture = (name: string) => parseCsv(readFileSync(join(process.cwd(), "tests/fixtures/import", name), "utf8"));

const OPT_OUT_HEADERS = ["SMS Opt Out", "Text Opt-Out", "Opted Out of SMS", "Email Opt-Out", "Call Opt Out", "Do Not Text", "Do Not Call", "DND", "Unsubscribed", "Opted Out"];

describe("opt-out columns are never read as opt-ins (D69)", () => {
  it("maps every opt-out header to an opt-out field, alone or next to opt-in columns", () => {
    for (const h of OPT_OUT_HEADERS) {
      const alone = autoMap(["Name", "Mobile", "Email", h], "contacts");
      expect(alone.optInText, h).toBeUndefined();
      expect(alone.optInCall, h).toBeUndefined();
      expect(alone.optInEmail, h).toBeUndefined();
      expect([alone.optOutText, alone.optOutCall, alone.optOutEmail, alone.doNotContact], h).toContain(3);
      expect(headerAllowed("optInText", h) || headerAllowed("optInCall", h) || headerAllowed("optInEmail", h), h).toBe(false);
    }
    const m = autoMap(["Name", "Mobile", "Email", "SMS Opt In", "SMS Opt Out", "Email Opt-Out"], "contacts");
    expect(m).toMatchObject({ optInText: 3, optOutText: 4, optOutEmail: 5 });
  });

  it("names the channel when the header does, and stops everything when it doesn't", () => {
    expect(optOutFieldOf("SMS Opt Out")).toBe("optOutText");
    expect(optOutFieldOf("Do Not Call")).toBe("optOutCall");
    expect(optOutFieldOf("Email Opt-Out")).toBe("optOutEmail");
    expect(optOutFieldOf("DND")).toBe("doNotContact");
    expect(optOutFieldOf("Unsubscribed")).toBe("doNotContact");
    expect(optOutFieldOf("Text Opt In")).toBeNull();
  });

  it("a match made by M8 or by hand can't feed an opt-out column into an opt-in", () => {
    const headers = ["Name", "Phone", "SMS Opt Out", "Opted Out"];
    const g = guardOptOuts(headers, { fullName: 0, phone: 1, optInText: 2, notes: 3 });
    expect(g.optInText).toBeUndefined();
    expect(g.notes).toBeUndefined();
    expect(g).toMatchObject({ optOutText: 2, doNotContact: 3 });
    // buildRecords applies the same rule, whatever mapping it's handed.
    const csv = parseCsv("Name,Phone,SMS Opt Out\nAnn Lee,(206) 555-1234,Yes\n");
    const { records } = buildRecords(csv, { fullName: 0, phone: 1, optInText: 2 }, "contacts", { fileName: "bonzo.csv" });
    expect(records[0].attestedOptIns).toEqual([]);
    expect(records[0].optOuts).toEqual({ text: "bonzo.csv column SMS Opt Out" });
  });

  it("reads the Bonzo export: an opt-out wins, a plain no doesn't count", () => {
    const csv = fixture("bonzo-optout.csv");
    const { records } = buildRecords(csv, smartMap(csv, "contacts"), "contacts", { fileName: "bonzo-optout.csv" });
    const pat = records.find((r) => r.firstName === "Pat")!;
    const lou = records.find((r) => r.firstName === "Lou")!;
    expect(pat.attestedOptIns).toEqual([]);
    expect(pat.optOuts).toEqual({ text: "bonzo-optout.csv column SMS Opt Out", call: "bonzo-optout.csv column Do Not Call" });
    expect(lou.optOuts).toBeUndefined();
    expect(stopsEverything(pat)).toBe(false);
    expect(stopsEverything({ optOuts: { text: "x", email: "x" } })).toBe(true);
  });

  it("an opt-out in the same row beats an opt-in, and one copy's opt-out beats another's opt-in", () => {
    const csv = parseCsv("Name,Phone,Email,Text Opt In,Email Opt In,Do Not Call\nAnn Lee,(206) 555-1234,ann@x.com,Y,Y,Y\n");
    const [ann] = buildRecords(csv, autoMap(csv.headers, "contacts"), "contacts").records;
    expect(ann.attestedOptIns).toEqual(["email"]);
    const a = buildRecords(parseCsv("Name,Phone,SMS Opt In\nBo Lee,(206) 555-7777,Y\n"), { fullName: 0, phone: 1, optInText: 2 }, "contacts").records;
    const b = buildRecords(parseCsv("Name,Phone,DND\nBo Lee,(206) 555-7777,Y\n"), { fullName: 0, phone: 1, doNotContact: 2 }, "contacts", { fileName: "b.csv" }).records;
    const merged = mergeRecords([a, b]).records[0];
    expect(merged.attestedOptIns).toEqual([]);
    expect(stopsEverything(merged)).toBe(true);
    expect(toCleanCsv([merged]).split("\n")[1]).toMatch(/text; call; email$/);
  });
});

describe("one long value doesn't fail a batch (D69)", () => {
  it("clamps a 61-character tag and keeps a messy address from becoming a ZIP", () => {
    const tag61 = "x".repeat(61);
    const csv = parseCsv(`Name,Phone,Tags,Zip\nAnn Lee,(206) 555-1234,${tag61};vip,9810\n`);
    const { records, warnings } = buildRecords(csv, autoMap(csv.headers, "contacts"), "contacts");
    expect(records[0].tags).toEqual(["x".repeat(MAX_TAG), "vip"]);
    expect(records[0].zip).toBeNull();
    expect(warnings.map((w) => w.reason)).toEqual(expect.arrayContaining([expect.stringMatching(/^ZIP/), expect.stringMatching(/^tags/)]));
    const long = fixture("longtag.csv");
    const r = buildRecords(long, smartMap(long, "contacts"), "contacts").records[0];
    expect(r.tags.every((t) => t.length <= MAX_TAG)).toBe(true);
    expect(r.zip).toBeNull();
  });

  it("caps tags at 20 per person", () => {
    const csv = parseCsv(`Name,Phone,Tags\nAnn Lee,(206) 555-1234,"${Array.from({ length: 25 }, (_, i) => `t${i}`).join(";")}"\n`);
    expect(buildRecords(csv, autoMap(csv.headers, "contacts"), "contacts").records[0].tags).toHaveLength(20);
  });

  it("turns the first problem into plain words, without the value", () => {
    expect(importIssueText({ code: "too_big", origin: "string", path: ["records", 11, "tags", 0] })).toBe("Row 12: Tags is too long.");
    expect(importIssueText({ code: "too_big", origin: "array", path: ["records", 0, "tags"] }, 500)).toBe("Row 501: Tags has too many entries.");
    expect(importIssueText({ code: "invalid_format", path: ["records", 2, "state"] })).toBe("Row 3: State isn't in a format we can read.");
    expect(importIssueText({ code: "too_big", origin: "string", path: ["records", 4, "loan", "closedOn"] })).toBe("Row 5: Loan closed on is too long.");
    expect(importIssueText({ code: "invalid_type", path: ["source"] })).toMatch(/^Some rows didn't look right/);
  });

  it("reads an unreadable date as blank and counts it", () => {
    const csv = fixture("past-clients-messy.csv");
    const { records, warnings } = buildRecords(csv, smartMap(csv, "contacts"), "contacts");
    const sam = records.find((r) => r.firstName === "Sam")!;
    expect(sam.loan?.closedOn ?? null).toBeNull();
    const john = records.filter((r) => r.firstName === "John");
    expect(john.map((r) => r.loan?.closedOn ?? null)).toEqual(["2021-03-15", null]); // "15/03/2021" isn't March 3, 2022
    const old = parseCsv("Name,Phone,Closing Date\nAnn Lee,(206) 555-1234,12/31/99\n");
    expect(buildRecords(old, autoMap(old.headers, "contacts"), "contacts").records[0].loan?.closedOn).toBe("1999-12-31");
    expect(warnings.filter((w) => w.reason.startsWith("date")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("patterns that caught the wrong column (D69)", () => {
  it("'Listing Agent' isn't tags; real tag columns still are", () => {
    expect(autoMap(["Name", "Phone", "Listing Agent"], "contacts").tags).toBeUndefined();
    const bonzo = fixture("bonzo-optout.csv");
    expect(smartMap(bonzo, "contacts").tags).toBeUndefined();
    for (const h of ["Tags", "Labels", "Group", "Lists", "Contact Tags"]) expect(autoMap(["Name", h], "contacts").tags, h).toBe(1);
  });
  it("a co-borrower's or spouse's columns never fill the person's own name, phone or email", () => {
    const m = autoMap(["Co-Borrower Name", "Co-Borrower Phone", "Spouse Email", "Name", "Phone", "Email"], "contacts");
    expect(m).toMatchObject({ fullName: 3, phone: 4, email: 5 });
    const only = parseCsv("Co-Borrower Phone,Spouse Email\n(206) 555-1234,x@y.com\n(206) 555-2234,z@y.com\n");
    const s = smartMap(only, "contacts");
    expect(s.phone).toBeUndefined();
    expect(s.email).toBeUndefined();
  });
  it("note rate and loan amount match only what they say", () => {
    const m = autoMap(["Name", "Rate Lock Expires", "Interest Rate", "Appraised Amount", "Loan Amount"], "contacts");
    expect(m.noteRate).toBe(2);
    expect(m.loanAmount).toBe(4);
    expect(autoMap(["Name", "Rate"], "contacts").noteRate).toBe(1);
    expect(autoMap(["Name", "Amount"], "contacts").loanAmount).toBe(1);
    expect(autoMap(["Name", "Rate Lock Expires"], "contacts").noteRate).toBeUndefined();
  });
});
