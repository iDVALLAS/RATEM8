import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { autoMap, buildRecords } from "./mapping";
import { cleanState, dateProblem, isoDate, scanDates, splitName } from "./normalize";
import { buildAnswers, checkValue, columnCards, consentSummary, dateNeeds, extraColumns, fileQuestions, fixPrompt, localSuggestion, matchFlags, nameNeeds, reachSuggestion, reasonCode, skippedCsv, unanswered } from "./review";
import { smartMap, toCleanCsv } from "./smart";
import { aiFixTip, type TipCall } from "./ai-fix";
import { MemoryUsageStore, setUsageStoreForTests } from "@/lib/ai/meter";

const fixture = (name: string) => parseCsv(readFileSync(join(process.cwd(), "tests/fixtures/import", name), "utf8"));
const NOW = new Date("2026-11-21T12:00:00Z");

describe("names (D74)", () => {
  it("reads Last First when the loan officer says so", () => {
    expect(splitName("Garcia Maria", "last_first")).toEqual(["Maria", "Garcia"]);
    expect(splitName("Garcia Maria")).toEqual(["Garcia", "Maria"]);
    expect(splitName("de la Cruz Ana", "last_first")).toEqual(["Ana", "de la Cruz"]);
  });
  it("drops titles, keeps Jr/Sr/II–IV on the last name, keeps particles together", () => {
    expect(splitName("Dr. Robert Allen Jr.")).toEqual(["Robert", "Allen Jr."]);
    expect(splitName("Mrs Jane Doe III")).toEqual(["Jane", "Doe III"]);
    expect(splitName("Ana de la Cruz")).toEqual(["Ana", "de la Cruz"]);
    expect(splitName("Mary Ann van Buren")).toEqual(["Mary Ann", "van Buren"]);
    expect(splitName("Sean Mc Donald")).toEqual(["Sean", "Mc Donald"]);
    expect(splitName("Smith Jr., John")).toEqual(["John", "Smith Jr."]);
    expect(splitName("John Smith, Jr.")).toEqual(["John", "Smith Jr."]);
    expect(splitName("Van Morrison")).toEqual(["Van", "Morrison"]);
    expect(splitName("Smith, John", "last_first")).toEqual(["John", "Smith"]);
  });
  it("asks about one-column names without commas, once, with three samples", () => {
    const t = fixture("names-one-column.csv");
    const m = smartMap(t, "contacts");
    const q = nameNeeds(t, m)!;
    expect(q.samples).toEqual(["Garcia Maria", "Dr. Robert Allen Jr."]);
    const qs = fileQuestions(t, m, "contacts");
    expect(qs.filter((x) => x.kind === "name")).toHaveLength(1);
    expect(unanswered(qs, {})).toBeGreaterThanOrEqual(1);
    const { records } = buildRecords(t, m, "contacts", { ...buildAnswers(t, m, { nameOrder: "last_first" }) });
    expect(records.map((r) => [r.firstName, r.lastName])).toEqual([["John", "Smith"], ["Maria", "Garcia"], ["Allen", "Robert Jr."]]);
    // No question when every name has a comma, or when first and last are separate.
    expect(nameNeeds(parseCsv("Name,Phone\n\"Lee, Ann\",2065551234\n"), { fullName: 0, phone: 1 })).toBeNull();
    expect(nameNeeds(parseCsv("First,Last\nAnn,Lee\n"), { firstName: 0, lastName: 1 })).toBeNull();
  });
});

describe("dates (D74)", () => {
  it("reads day-first only when told, and says why a date wasn't read", () => {
    expect(isoDate("15/03/2021", { order: "dmy" })).toBe("2021-03-15");
    expect(isoDate("15/03/2021")).toBeNull();
    expect(isoDate("03/04/2021", { order: "dmy" })).toBe("2021-04-03");
    expect(dateProblem("31/02/2020", "dmy")).toBe("February has no 31st");
    expect(dateProblem("15/03/2021", "mdy")).toMatch(/swapped/);
    expect(dateProblem("soon")).toBe("can't be read as a date");
  });
  it("asks only when both orders are possible", () => {
    expect(scanDates(["03/04/2021", "15/03/2021", "03/15/2021", "05/05/2020", "2021-01-01"])).toEqual({ mdyOnly: 1, dmyOnly: 1, either: 1, example: "03/04/2021" });
    const ambiguous = parseCsv("Name,Phone,Close Date\nAnn Lee,2065551234,03/04/2021\nBo Park,2065552345,11/12/2019\n");
    const m = autoMap(ambiguous.headers, "contacts");
    const d = dateNeeds(ambiguous, m);
    expect(d.order).toBeNull();
    expect(d.question).toMatchObject({ kind: "date", example: "03/04/2021", readings: ["March 4, 2021", "3 April 2021"], mixed: false });
    // Any first part over 12 (and none of the second): day first, no question.
    const dayFirst = parseCsv("Name,Phone,Close Date\nAnn Lee,2065551234,15/03/2021\nBo Park,2065552345,03/04/2021\n");
    expect(dateNeeds(dayFirst, autoMap(dayFirst.headers, "contacts"))).toEqual({ order: "dmy", question: null });
    const r = buildRecords(dayFirst, autoMap(dayFirst.headers, "contacts"), "contacts", buildAnswers(dayFirst, autoMap(dayFirst.headers, "contacts"), {}));
    expect(r.records.map((x) => x.loan?.closedOn)).toEqual(["2021-03-15", "2021-04-03"]);
    // The messy file has dates both ways: asked once, and the ones that don't fit are shown, not guessed.
    const messy = fixture("past-clients-messy.csv");
    const mm = smartMap(messy, "contacts");
    expect(fileQuestions(messy, mm, "contacts").filter((q) => q.kind === "date")).toEqual([expect.objectContaining({ mixed: true })]);
    const built = buildRecords(messy, mm, "contacts", buildAnswers(messy, mm, { dateOrder: "mdy" }));
    const dates = built.warnings.filter((w) => w.code === "date");
    expect(dates.map((w) => w.raw)).toEqual(expect.arrayContaining(["15/03/2021", "13/01/2022", "2021-02-30"]));
    expect(localSuggestion("closedOn", "15/03/2021", { dateOrder: "mdy" })).toBe("2021-03-15");
  });
});

describe("warnings and Needs a look (D74)", () => {
  it("lists the dropped phone, email and state with the value as written, and keeps it in notes", () => {
    const csv = parseCsv("Name,Mobile,Email,State\nMary Chen,555-123-467,mary@x.com,N. Carolina\nLuis Romero,(206) 555-7788,luis.romero@gmial,Wash.\nTom Becker,(206) 555-2233,tom@x.com,Narnia\n");
    const { records, warnings } = buildRecords(csv, autoMap(csv.headers, "contacts"), "contacts");
    expect(records.map((r) => r.state)).toEqual(["NC", "WA", null]);
    expect(warnings.map((w) => [w.name, w.field, w.raw])).toEqual([
      ["Mary Chen", "phone", "555-123-467"],
      ["Luis Romero", "email", "luis.romero@gmial"],
      ["Tom Becker", "state", "Narnia"],
    ]);
    expect(warnings[0].reason).toBe("is one digit short");
    expect(records[0].notes).toBe("Mobile (as written): 555-123-467");
    expect(fixPrompt(warnings[0])).toBe("Mary's phone 555-123-467 is one digit short. Type the right one, or skip the phone.");
    expect(reasonCode(warnings[0])).toBe("phone_short");
    expect(reasonCode(warnings[1])).toBe("email_incomplete");
  });
  it("a typed fix is re-checked by the same functions, and Skip leaves it blank", () => {
    const csv = parseCsv("Name,Mobile,Email\nMary Chen,555-123-467,mary@x.com\n");
    const m = autoMap(csv.headers, "contacts");
    expect(checkValue("phone", "206-555-1234")).toEqual({ ok: true, message: "Looks right: (206) 555-1234." });
    expect(checkValue("phone", "555-123-467").ok).toBe(false);
    expect(checkValue("state", "N. Carolina").message).toBe("Reads as North Carolina (NC).");
    const fixed = buildRecords(csv, m, "contacts", { fixes: { 0: { phone: "206-555-1234" } } });
    expect(fixed.records[0].phone).toBe("+12065551234");
    expect(fixed.warnings).toEqual([]);
    const skipped = buildRecords(csv, m, "contacts", { fixes: { 0: { phone: "" } } });
    expect(skipped.records[0].phone).toBeNull();
    expect(skipped.warnings).toEqual([]);
    expect(skipped.records[0].notes).toBeNull();
  });
  it("suggests likely fixes on the device only when they pass the check", () => {
    expect(localSuggestion("email", "luis.romero@gmial")).toBe("luis.romero@gmail.com");
    expect(localSuggestion("email", "ann@yahoo.con")).toBe("ann@yahoo.com");
    expect(localSuggestion("phone", "206-555-1234 x12")).toBe("(206) 555-1234");
    expect(localSuggestion("zip", "2134")).toBe("02134");
    expect(localSuggestion("phone", "555-123-467")).toBeNull();
  });
  it("keeps a phone-only row as (no name) with a Needs a name warning", () => {
    const messy = fixture("past-clients-messy.csv");
    const { records, warnings, problems } = buildRecords(messy, smartMap(messy, "contacts"), "contacts");
    const noName = records.find((r) => r.phone === "+12065554321")!;
    expect([noName.firstName, noName.lastName]).toEqual(["", ""]);
    expect(warnings.find((w) => w.code === "name_missing")).toMatchObject({ name: "(no name)", reason: "Needs a name", row: 10 });
    expect(problems.map((p) => p.name)).toEqual(["Nobody Here", "Ann Lee"]); // Ann's only number is a 555-01xx test number
    const named = buildRecords(messy, smartMap(messy, "contacts"), "contacts", { fixes: { 8: { name: "Kim Ortiz" } } });
    expect(named.records.find((r) => r.phone === "+12065554321")).toMatchObject({ firstName: "Kim", lastName: "Ortiz" });
    expect(named.warnings.some((w) => w.code === "name_missing")).toBe(false);
  });
});

describe("skipped rows (D74)", () => {
  it("download has a Reason column and is formula-safe", () => {
    const csv = parseCsv("Name,Phone,Notes\nNobody Here,,=HYPERLINK(\"x\")\n@Bad Row,,+cmd\n");
    const { problems } = buildRecords(csv, autoMap(csv.headers, "contacts"), "contacts");
    const out = skippedCsv(problems.map((p) => ({ ...p, file: "list.csv", headers: csv.headers })));
    const lines = out.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("File,Row,Reason,Name,Phone,Notes");
    expect(lines[1]).toBe(`list.csv,2,No phone or email we could read,Nobody Here,,"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toBe("list.csv,3,No phone or email we could read,'@Bad Row,,'+cmd");
  });
  it("suggests a column that could reach them: “Use column 'Home #' as Other phone?”", () => {
    const t = parseCsv("Name,Mobile,Email,Home #\nAnn Lee,,,(425) 555-2110\nBo Park,(206) 555-1234,bo@x.com,\n");
    const m = smartMap(t, "contacts");
    expect(m.phone).toBe(1);
    expect(Object.values(m)).not.toContain(3);
    expect(reachSuggestion(t, m, {}, 3)).toBe("phone2");
    expect(buildRecords(t, m, "contacts").problems).toHaveLength(1);
    expect(buildRecords(t, { ...m, phone2: 3 }, "contacts").problems).toHaveLength(0);
  });
});

describe("column cards (D74)", () => {
  it("unsure and disagreeing columns show Check this; unmatched go to notes", () => {
    const t = parseCsv("Full Name,Mobile,Listing Agent,Favorite Color,Stage,SSN\nAnn Lee,2065551234,Dana Wu,blue,Nurture,123-45-6789\nBo Park,4255552345,Sam Ortiz,red,Closed,987-65-4321\n");
    const byName = autoMap(t.headers, "contacts");
    const smart = smartMap(t, "contacts");
    const flags = matchFlags(t, byName, smart, { fields: ["fullName", "phone", "referredBy", "none", "none", "none"], unsure: [2] });
    expect(flags).toEqual({ 2: "unsure" });
    const mapping = { ...smart, referredBy: 2 };
    const cards = columnCards(t, mapping, "contacts", {}, { flags });
    const by = (h: string) => cards.find((c) => c.header === h)!;
    expect(by("Full Name").status).toBe("sure");
    expect(by("Listing Agent")).toMatchObject({ status: "check", note: "unsure", target: "referredBy" });
    expect(by("Favorite Color")).toMatchObject({ status: "check", note: "notes", target: "notes" });
    expect(by("Stage")).toMatchObject({ status: "sure", note: "stage", target: "notes" });
    expect(by("SSN")).toMatchObject({ status: "none", note: "private", target: "skip" });
    expect(by("SSN").samples.length).toBeGreaterThan(0);
    // Confirmed by the loan officer: Sure.
    expect(columnCards(t, mapping, "contacts", {}, { flags, ok: [2] })[2].status).toBe("sure");
    // M8 and the name match disagree.
    expect(matchFlags(t, byName, smart, { fields: ["fullName", "phone2", "none", "none", "none", "none"], unsure: [] })).toEqual({ 1: "disagree" });
    // Notes get "Header: value"; a tag column adds tags; private data is never read.
    const { records } = buildRecords(t, mapping, "contacts", { columns: extraColumns(t, mapping, { 3: "tag" }) });
    expect(records[0].notes).toBe("Stage: Nurture");
    expect(records[0].tags).toEqual(["blue"]);
    expect(JSON.stringify(records)).not.toContain("123-45");
    expect(records[0].referredBy).toBe("Dana Wu");
  });
  it("matches lead source and referred-by columns, and stage no longer feeds relationship", () => {
    expect(autoMap(["Name", "Lead Source", "Referred By", "Stage"], "contacts")).toEqual({ fullName: 0, leadSource: 1, referredBy: 2 });
    expect(autoMap(["Name", "Source"], "contacts").leadSource).toBe(1);
    expect(autoMap(["Name", "Referral Source"], "contacts").leadSource).toBe(1);
    expect(autoMap(["Name", "Origin"], "contacts").leadSource).toBe(1);
    expect(autoMap(["Name", "Lifecycle Stage"], "contacts").relationship).toBe(1);
    const t = parseCsv("Name,Phone,Lead Source\nAnn Lee,2065551234,Zillow\n");
    const r = buildRecords(t, autoMap(t.headers, "contacts"), "contacts").records[0];
    expect(r.leadSource).toBe("Zillow");
    expect(toCleanCsv([r]).split("\n")[1]).toContain(",Zillow,");
  });
  it("widens the state reader", () => {
    expect(["N. Carolina", "Wash.", "Calif", "No. Dakota", "W. Va.", "N.C.", "So. Carolina", "Fla."].map((s) => cleanState(s))).toEqual(["NC", "WA", "CA", "ND", "WV", "NC", "SC", "FL"]);
    expect(cleanState("Narnia")).toBeNull();
  });
});

describe("consent values (D74)", () => {
  it("asks what an unclear opt-in value means, and only the loan officer's yes is permission", () => {
    const messy = fixture("past-clients-messy.csv");
    const m = smartMap(messy, "contacts");
    const q = fileQuestions(messy, m, "contacts").find((x) => x.kind === "consent")!;
    expect(q).toMatchObject({ field: "optInText", values: [expect.objectContaining({ key: "maybe" })] });
    const sam = (consent?: Record<string, boolean>) => buildRecords(messy, m, "contacts", { consent: consent ? { optInText: consent } : undefined }).records.find((r) => r.firstName === "Sam")!;
    expect(sam().attestedOptIns).toEqual([]);
    expect(sam({ maybe: false }).attestedOptIns).toEqual([]);
    expect(sam({ maybe: true }).attestedOptIns).toEqual(["text"]);
    expect(unanswered([q], { consent: { optInText: { maybe: true } } })).toBe(0);
  });
  it("an opt-out column must be confirmed, and its stops are counted", () => {
    const bonzo = fixture("bonzo-optout.csv");
    const m = smartMap(bonzo, "contacts");
    const qs = fileQuestions(bonzo, m, "contacts").filter((x) => x.kind === "optout");
    expect(qs.map((x) => x.header).sort()).toEqual(["Do Not Call", "SMS Opt Out"]);
    expect(qs.every((x) => x.kind === "optout" && x.stops === 1)).toBe(true);
    expect(unanswered(qs, {})).toBe(2);
    expect(unanswered(qs, { optOutOk: [3, 4] })).toBe(0);
    const cards = columnCards(bonzo, m, "contacts", {}, {});
    expect(cards[3]).toMatchObject({ status: "check", note: "optout", optOut: true, options: ["optOutText", "optOutCall", "optOutEmail", "doNotContact"] });
    expect(columnCards(bonzo, m, "contacts", {}, { optOutOk: [3] })[3].status).toBe("sure");
    const { records } = buildRecords(bonzo, m, "contacts");
    expect(consentSummary(records)).toEqual({ text: 0, call: 0, email: 0, anyIn: 0, stops: 1 });
  });
});

describe("Fix with M8's tip (D74)", () => {
  beforeEach(() => setUsageStoreForTests(new MemoryUsageStore()));
  afterEach(() => setUsageStoreForTests(null));

  it("sends only the field, the value's shape and a reason code", async () => {
    let sent = "";
    const call: TipCall = async (_s, u) => {
      sent = u;
      return { stop: "end_turn", json: JSON.stringify({ tip: "A digit is missing. Check the number in your phone or their file." }) };
    };
    const r = await aiFixTip({ id: "lo1" }, { kind: "contacts", field: "phone", shape: "999-999-999", reason: "phone_short" }, { call });
    expect(r).toEqual({ ok: true, tip: "A digit is missing. Check the number in your phone or their file." });
    expect(sent).toContain("Field: Mobile");
    expect(sent).toContain("999-999-999");
    expect(sent).toMatch(/<data-d[0-9a-f]{12} kind="shape">/);
    // A "shape" that's really a value is dropped before it's sent.
    await aiFixTip({ id: "lo1" }, { kind: "contacts", field: "email", shape: "mary@x.com", reason: "email_invalid" }, { call });
    expect(sent).not.toContain("mary");
  });
  it("falls back without AI, never runs on agent lists, and drops a tip that makes up a value", async () => {
    const call: TipCall = async () => ({ stop: "end_turn", json: JSON.stringify({ tip: "Try 206-555-1234." }) });
    expect(await aiFixTip({ id: "lo1" }, { kind: "contacts", field: "phone", shape: "999", reason: "phone_short" }, { call: null })).toEqual({ ok: false });
    expect(await aiFixTip({ id: "lo1" }, { kind: "agents", field: "phone", shape: "999", reason: "phone_short" }, { call })).toEqual({ ok: false });
    expect(await aiFixTip({ id: "lo1" }, { kind: "contacts", field: "phone", shape: "999", reason: "phone_short" }, { call })).toEqual({ ok: false });
    expect(await aiFixTip({ id: "lo1" }, { kind: "contacts", field: "phone", shape: "999", reason: "phone_short" }, { call: async () => ({ stop: "end_turn", json: "{bad" }) })).toEqual({ ok: false });
  });
});

describe("isoDate keeps D69's rules with an order (D74)", () => {
  it("still refuses impossible dates either way", () => {
    expect(isoDate("31/02/2020", { order: "dmy", now: NOW })).toBeNull();
    expect(isoDate("12/31/99", { order: "mdy", now: NOW })).toBe("1999-12-31");
    expect(isoDate("31/12/99", { order: "dmy", now: NOW })).toBe("1999-12-31");
  });
});

describe("Keep them shortened (D74)", () => {
  it("writes the tags that fit, so the warning goes and the tags stay", () => {
    const csv = parseCsv(`Name,Phone,Tags\nAnn Lee,(206) 555-1234,${"x".repeat(70)};vip\n`);
    const m = autoMap(csv.headers, "contacts");
    const w = buildRecords(csv, m, "contacts").warnings.find((x) => x.code === "tags")!;
    expect(w.keep).toBe(`${"x".repeat(60)}; vip`);
    const kept = buildRecords(csv, m, "contacts", { fixes: { 0: { tags: w.keep } } });
    expect(kept.warnings).toEqual([]);
    expect(kept.records[0].tags).toEqual(["x".repeat(60), "vip"]);
  });
});
