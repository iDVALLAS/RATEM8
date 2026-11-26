/**
 * D93: smart import. M8 reads the file (owner decision 2026-11-25), ZIPs and
 * names worked out from the rest of the row, co-borrowers on the borrower's
 * contact (never reachable), placeholders read as blank, clients and agents
 * in one file, going back a step, and the permission dialog's links.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autoMap, buildRecords, guardOptOuts, headerAllowed, splitCouple, type ImportRecord } from "./mapping";
import { isPlaceholderEmail, isPlaceholderPhone } from "./normalize";
import { applyM8, cardGuesses, confirmZip, finalSorts, isRetrFile, nameGuess, nameOrderFromHeader, nameOrderVotes, sortRows, zipCheck, zipGuess } from "./guess";
import { readColumns, readRows, sampleColumn, scrubCell, sendableColumns } from "./ai-safe";
import { aiFixAll, aiReadColumns, aiSortRows, derivable, readMessage, type JsonCall } from "./ai-read";
import { canGo, goTo, next, permissionLinks, stepStatus, type StepGate } from "./import-steps";
import { smartMap, mergeRecords, toCleanCsv } from "./smart";
import { applyImport } from "./reimport";
import { mergeFields } from "./merge";
import { changedFields, checkEdit } from "./editing";
import { fieldOfColumn, matchFlags } from "./review";
import { importBatch, recordConsent } from "./service";
import { MemoryContactStore, setContactStoreForTests, type Contact } from "./store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { handleInbound, sendText } from "@/lib/messaging/service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { toCsv } from "@/lib/export/csv";
import type { Csv } from "./csv";

const table = (headers: string[], rows: string[][]): Csv => ({ headers, rows });
const lo = (id: string): User => ({ id, email: `${id}@x.com`, name: id, role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" });
const rec = (over: Partial<ImportRecord> = {}): ImportRecord => ({ firstName: "Ann", lastName: "Lee", email: "ann@x.com", phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [], ...over });
const contact = (over: Partial<Contact> = {}): Contact => ({ ...rec(), id: "c_keep000001", ownerUserId: "lo1", kind: "contact", provenance: "personal", locked: false, source: "import: a.csv", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over });
const ok = (json: unknown): JsonCall => async () => ({ stop: "end_turn", json: JSON.stringify(json) });

// A messy file like the owner's: "Last, First" in one column, a co-borrower, a 5-digit column next to City, placeholder phones, a Type column.
const MESSY = table(
  ["Name (Last, First)", "Cell", "E-mail", "City", "ST", "Column 6", "Co-Borrower First", "CoBorrower Last", "Spouse Phone", "Type", "Brokerage"],
  [
    ["Garcia, Maria", "206-555-1234", "maria.garcia@gmail.com", "Seattle", "WA", "98101", "Luis", "Garcia", "(206) 555-4321", "Buyer", ""],
    ["Nguyen, Bao", "111-111-1111", "bao@outlook.com", "Seattle", "WA", "98103", "", "", "", "Seller", ""],
    ["Okafor, Ada", "(425) 555-2222", "ada@x.com", "Bellevue", "WA", "98004", "", "", "123-456-7890", "Agent", "Windermere"],
    ["Smith, Jo", "503-555-0211", "jo@x.com", "Portland", "OR", "97201", "", "", "", "", "Keller Williams"],
    ["Lopez, Ana", "000-000-0000", "ana@x.com", "Portland", "OR", "97205", "", "", "", "", ""],
  ],
);

describe("ZIPs from the rest of the row (D93)", () => {
  it("reads a 5-digit column as ZIP when it fits the State column, and says so", () => {
    const m = smartMap(MESSY, "contacts");
    expect(m.zip).toBe(5);
    const z = zipCheck(MESSY, m, 5);
    expect(z).toMatchObject({ zips: 5, withState: 5, inState: 5 });
    expect(zipGuess(MESSY, m, 5)).toMatchObject({ field: "zip", sure: true, by: "rules" });
    // Matched by contents only ("Column 6"), but the State column agrees: Sure, not "Check this".
    const flags = matchFlags(MESSY, autoMap(MESSY.headers, "contacts"), m, null);
    expect(flags[5]).toBe("contents");
    expect(confirmZip(MESSY, m, flags)[5]).toBeUndefined();
  });

  it("agrees with the City column when there's no State column", () => {
    const t = table(["City", "Postal"], [["Seattle", "98101"], ["Seattle", "98109"], ["Seattle", "98122"], ["Tacoma", "98402"], ["Tacoma", "98405"]]);
    expect(zipCheck(t, { city: 0, zip: 1 }, 1)).toMatchObject({ cityRows: 5, cityAgree: 5 });
    expect(zipGuess(t, { city: 0, zip: 1 }, 1)).toMatchObject({ field: "zip", sure: true });
  });

  it("doubts 5-digit numbers that don't fit the state (Excel dates look like ZIPs)", () => {
    const t = table(["State", "Funded"], [["WA", "44197"], ["WA", "44562"], ["WA", "45001"], ["OR", "44320"]]);
    const g = zipGuess(t, { state: 0, zip: 1 }, 1);
    expect(g).toMatchObject({ field: null, sure: false });
    expect(g?.text).toMatch(/Only 0 of 4/);
  });
});

describe("names: split, order and two people in one cell (D93)", () => {
  it("matches LAST NAME, Borrower Last, Borrower First and a Last, First column", () => {
    expect(autoMap(["LAST NAME", "FIRST NAME"], "contacts")).toMatchObject({ lastName: 0, firstName: 1 });
    expect(autoMap(["Borrower Last", "Borrower First"], "contacts")).toMatchObject({ lastName: 0, firstName: 1 });
    expect(autoMap(["Last, First", "Phone"], "contacts")).toMatchObject({ fullName: 0, phone: 1 });
    expect(autoMap(["Name", "Phone"], "contacts")).toMatchObject({ fullName: 0 });
    expect(nameOrderFromHeader("Name (Last, First)")).toBe("last_first");
    expect(nameOrderFromHeader("First Last")).toBe("first_last");
    expect(nameOrderFromHeader("Name")).toBeNull();
  });

  it("guesses First Last or Last First from the emails beside the names", () => {
    const t = table(["Name", "Email"], [["Garcia Maria", "maria.garcia@x.com"], ["Lee Ann", "alee@x.com"], ["Smith John", "john.smith@x.com"], ["Park Min", "mpark@x.com"]]);
    const m = autoMap(t.headers, "contacts");
    expect(nameOrderVotes(t, m)).toEqual({ first_last: 0, last_first: 4 });
    expect(nameGuess(t, m)).toMatchObject({ order: "last_first", sure: true, by: "rules" });
    const flipped = table(["Name", "Email"], t.rows.map(([n, e]) => [n.split(" ").reverse().join(" "), e]));
    expect(nameGuess(flipped, autoMap(flipped.headers, "contacts"))).toMatchObject({ order: "first_last" });
    // Not enough to go on: M8's reading, marked as M8's and not sure.
    const few = table(["Name"], [["Garcia Maria"]]);
    expect(nameGuess(few, { fullName: 0 }, { columns: {}, nameOrder: "last_first", nameWhy: "Surnames come first" })).toMatchObject({ order: "last_first", by: "m8", sure: false });
  });

  it("splits a Last, First column and two people in one name", () => {
    const { records } = buildRecords(MESSY, smartMap(MESSY, "contacts"), "contacts");
    expect(records[0]).toMatchObject({ firstName: "Maria", lastName: "Garcia" });
    expect(splitCouple("John & Jane Smith")).toEqual({ main: "John Smith", co: "Jane Smith" });
    expect(splitCouple("Smith, John and Jane")).toEqual({ main: "Smith, John", co: "Smith, Jane" });
    expect(splitCouple("John Smith & Jane Doe")).toEqual({ main: "John Smith", co: "Jane Doe" });
    expect(splitCouple("Anderson Cooper")).toBeNull();
    const t = table(["Name", "Phone"], [["John & Jane Smith", "206-555-1234"]]);
    expect(buildRecords(t, autoMap(t.headers, "contacts"), "contacts").records[0]).toMatchObject({ firstName: "John", lastName: "Smith", coBorrower: { firstName: "Jane", lastName: "Smith", phone: null, email: null } });
    const split = table(["First", "Last", "Phone"], [["John and Jane", "Smith", "206-555-1234"]]);
    expect(buildRecords(split, autoMap(split.headers, "contacts"), "contacts").records[0]).toMatchObject({ firstName: "John", coBorrower: { firstName: "Jane", lastName: "Smith" } });
  });
});

describe("co-borrowers on the borrower's contact (D93)", () => {
  it("maps co-borrower and spouse columns to the co-borrower, never to the person", () => {
    const m = autoMap(["First", "Last", "Co-Borrower First", "CoBorrower Last", "Co Borrower Email", "Borrower 2 Cell", "Spouse Name", "Phone"], "contacts");
    expect(m).toMatchObject({ firstName: 0, lastName: 1, coFirstName: 2, coLastName: 3, coEmail: 4, coPhone: 5, coFullName: 6, phone: 7 });
    for (const h of ["Co-Borrower Phone", "Spouse Email", "Spouse Name", "Borrower 2 First"]) {
      for (const f of ["firstName", "lastName", "fullName", "email", "phone", "phone2"] as const) expect(headerAllowed(f, h)).toBe(false);
    }
    // Private data never feeds any field, a co-borrower's included.
    expect(headerAllowed("coFullName", "Co-Borrower SSN")).toBe(false);
    expect(guardOptOuts(["Co-Borrower DOB"], { coFullName: 0 })).toEqual({});
  });

  it("builds the co-borrower from the row, keeps bad co-borrower values in notes, and the clean CSV carries them", () => {
    const { records, warnings } = buildRecords(MESSY, smartMap(MESSY, "contacts"), "contacts");
    expect(records[0].coBorrower).toEqual({ firstName: "Luis", lastName: "Garcia", phone: "+12065554321", email: null });
    // A placeholder co-borrower phone is just blank (and in notes as written); it never needs a look.
    expect(records[2].coBorrower ?? null).toBeNull();
    expect(records[2].notes).toContain("Spouse Phone (as written): 123-456-7890");
    expect(warnings.some((w) => w.at === 2)).toBe(false);
    expect(toCleanCsv([records[0]])).toContain("Luis,Garcia,'+12065554321");
  });

  it("re-imports fill a blank co-borrower, merges keep the main record's, and Download everything has it", () => {
    const old = contact();
    const { next, changed } = applyImport(old, rec({ coBorrower: { firstName: "Luis", lastName: "Garcia", phone: "+12065554321", email: null } }), "fill", { at: "2026-11-25T00:00:00.000Z", importId: "imp_abcdef12" });
    expect(next.coBorrower).toEqual({ firstName: "Luis", lastName: "Garcia", phone: "+12065554321", email: null });
    expect(changed).toContain("coBorrower");
    const kept = applyImport(next, rec({ coBorrower: { firstName: "Other", lastName: "Person", phone: null, email: "o@x.com" } }), "fill", { at: "2026-11-25T00:00:00.000Z" }).next;
    expect(kept.coBorrower).toEqual({ firstName: "Luis", lastName: "Garcia", phone: "+12065554321", email: "o@x.com" });
    const merged = mergeFields(contact({ coBorrower: null }), contact({ id: "c_drop000001", coBorrower: { firstName: "Jane", lastName: "Lee", phone: null, email: null } }), "2026-11-25T00:00:00.000Z");
    expect(merged.coBorrower).toMatchObject({ firstName: "Jane" });
    expect(mergeFields(contact({ coBorrower: { firstName: "Mine", lastName: "", phone: null, email: null } }), contact({ id: "c_drop000001", coBorrower: { firstName: "Theirs", lastName: "", phone: null, email: null } }), "x").coBorrower?.firstName).toBe("Mine");
    expect(mergeRecords([[rec({ coBorrower: null })], [rec({ coBorrower: { firstName: "Jane", lastName: "Lee", phone: null, email: null } })]]).records[0].coBorrower?.firstName).toBe("Jane");
    const csv = toCsv([contact({ coBorrower: { firstName: "Jane", lastName: "Lee", phone: "+12065559876", email: null } })]);
    expect(csv).toContain("coBorrower.firstName");
    expect(csv).toContain("+12065559876");
  });

  it("edits the co-borrower on Details, checked like everything else", () => {
    const good = checkEdit({ firstName: "Ann", email: "ann@x.com", relationship: "past_client", coFirstName: "Jane", coLastName: "Lee", coPhone: "(206) 555-9876", coEmail: "Jane@X.com" }, "contact");
    expect(good).toMatchObject({ ok: true, values: { coBorrower: { firstName: "Jane", lastName: "Lee", phone: "+12065559876", email: "jane@x.com" } } });
    expect(checkEdit({ firstName: "Ann", email: "ann@x.com", relationship: "past_client", coPhone: "555-12" }, "contact")).toMatchObject({ ok: false, errors: { coPhone: expect.stringContaining("Co-borrower phone") } });
    expect(checkEdit({ firstName: "Al", email: "al@x.com", coFirstName: "X" }, "agent")).toMatchObject({ ok: true, values: { coBorrower: null } });
    if (good.ok) expect(changedFields(contact(), good.values)).toEqual(expect.arrayContaining(["coFirstName", "coLastName", "coPhone", "coEmail"]));
  });

  describe("the send gate never reaches a co-borrower", () => {
    let sent: URLSearchParams[];
    beforeEach(() => {
      setContactStoreForTests(new MemoryContactStore());
      setTouchStoreForTests(new MemoryTouchStore());
      setAccountStoreForTests(new MemoryAccountStore());
      sent = [];
      vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
      vi.stubEnv("TWILIO_AUTH_TOKEN", "secret");
      vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG123");
      vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: URLSearchParams }) => {
        sent.push(new URLSearchParams(init.body));
        return new Response(JSON.stringify({ sid: `SM${"a".repeat(32)}`, status: "queued" }), { status: 201 });
      }));
    });
    afterEach(() => {
      setContactStoreForTests(null);
      setTouchStoreForTests(null);
      setAccountStoreForTests(null);
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("texts only the borrower's own number, refuses a contact whose only phone is the co-borrower's, and a co-borrower's STOP finds no contact", async () => {
      const me = lo("lo1");
      const TUE_10AM_PT = new Date("2026-11-17T18:00:00Z");
      const co = { firstName: "Luis", lastName: "Garcia", phone: "+12065554321", email: "luis@x.com" };
      await importBatch(me, "contacts", [rec({ coBorrower: co }), rec({ firstName: "Bo", phone: null, email: "bo@x.com", coBorrower: { ...co, phone: "+14255550199" } })], "a.csv", "personal");
      const { contacts } = await (await import("./store")).contactStore().list({});
      const ann = contacts.find((c) => c.firstName === "Ann")!;
      const bo = contacts.find((c) => c.firstName === "Bo")!;
      expect(ann.coBorrower).toEqual(co);
      for (const c of [ann, bo]) await recordConsent(me, c.id, { channel: "text", purpose: "service", granted: true, evidence: "written", proof: "signed form" });
      expect(await sendText(me, ann.id, "Your appraisal came in.", "service", null, TUE_10AM_PT)).toEqual({ ok: true });
      expect(sent.map((p) => p.get("To"))).toEqual(["+12065551234"]);
      expect((await sendText(me, bo.id, "Hi", "service", null, TUE_10AM_PT)).ok).toBe(false);
      expect(sent).toHaveLength(1);
      expect(await handleInbound("+12065554321", "MG123", "STOP", TUE_10AM_PT)).toMatchObject({ contacts: 0 });
    });
  });
});

describe("placeholder phones and emails read as blank (D93)", () => {
  it("knows the usual fillers and leaves real numbers alone", () => {
    for (const p of ["111-111-1111", "(999) 999-9999", "123-456-7890", "1234567890", "0123456789", "000-000-0000", "555-0100", "206-555-0199", "1-111-111-1111", "N/A", "206-000-0000"]) expect(isPlaceholderPhone(p)).toBe(true);
    for (const p of ["206-555-1234", "(425) 555-2222", "503-867-5309", "206-555-0200"]) expect(isPlaceholderPhone(p)).toBe(false);
    for (const e of ["none@none.com", "noemail@gmail.com", "na@na.com", "no@email.com", "x@x.com"]) expect(isPlaceholderEmail(e)).toBe(true);
    expect(isPlaceholderEmail("ann@x.com")).toBe(false);
  });

  it("keeps them out of Needs a look, in notes as written, and counts them", () => {
    const { records, warnings, placeholders } = buildRecords(MESSY, smartMap(MESSY, "contacts"), "contacts");
    const bao = records.find((r) => r.firstName === "Bao")!;
    expect(bao.phone).toBeNull();
    expect(bao.notes).toContain("(as written): 111-111-1111");
    expect(warnings.filter((w) => w.field === "phone")).toEqual([]);
    expect(placeholders).toBe(2);
    // "222-222-2222" passes the US number check, but it's a filler: never imported as a phone.
    const t = table(["Name", "Phone", "Email"], [["Al Bo", "222-222-2222", "al@x.com"]]);
    expect(buildRecords(t, autoMap(t.headers, "contacts"), "contacts").records[0].phone).toBeNull();
  });
});

describe("clients and agents in one file (D93)", () => {
  const m = smartMap(MESSY, "contacts");

  it("sorts by the Type column, then a brokerage, and leaves the rest unsure", () => {
    const s = sortRows(MESSY, m);
    expect(s.sorts).toEqual(["client", "client", "agent", "agent", "unsure"]);
    expect(s.why).toEqual(["type", "type", "type", "brokerage", null]);
    expect(s.brokerageCol).toBe(10);
    const yesNo = table(["Name", "Agent?"], [["A B", "Y"], ["C D", "no"], ["E F", ""]]);
    expect(sortRows(yesNo, {}).sorts).toEqual(["agent", "client", "unsure"]);
  });

  it("M8 sorts only the unsure rows; the loan officer's move wins", () => {
    const s = sortRows(MESSY, m);
    const f = finalSorts(s, { 4: "agent", 0: "agent" }, { 3: "client" });
    expect(f.sorts).toEqual(["client", "client", "agent", "client", "agent"]);
    expect(f.why).toEqual(["type", "type", "type", "moved", "m8"]);
    expect([...f.agent]).toEqual([2, 4]);
  });

  it("files agent rows as agents with the Agent tag, no opt-ins, no loan or co-borrower; opt-outs still count", () => {
    const t = table(["Name", "Phone", "Text opt in", "SMS Opt Out", "Type", "Brokerage", "Loan Amount", "Spouse"], [
      ["Ann Lee", "206-555-1234", "yes", "", "Buyer", "", "400000", "Bo Lee"],
      ["Al Agent", "425-555-2222", "yes", "x", "Realtor", "Windermere", "", "Cy Agent"],
    ]);
    const mm = smartMap(t, "contacts");
    const { sorts, brokerageCol } = sortRows(t, mm);
    const { records } = buildRecords(t, mm, "contacts", { agentRows: finalSorts({ sorts, why: [] }, undefined, {}).agent, brokerageCol: brokerageCol ?? undefined, extraTags: ["Imported Nov 25, 2026"] });
    expect(records[0]).toMatchObject({ relationship: "other", attestedOptIns: ["text"], coBorrower: { firstName: "Bo" } });
    expect(records[0].tags).not.toContain("Agent");
    expect(records[1]).toMatchObject({ relationship: "agent", attestedOptIns: [], loan: null, agent: { brokerage: "Windermere" }, optOuts: { text: expect.any(String) } });
    expect(records[1].tags).toEqual(["Imported Nov 25, 2026", "Agent"]);
    expect(records[1].coBorrower ?? null).toBeNull();
  });

  it("a mocked M8 sort is checked: rows it wasn't sent and bad answers are dropped", async () => {
    const s = sortRows(MESSY, m);
    const unsure = s.sorts.map((x, i) => (x === "unsure" ? i : -1)).filter((i) => i >= 0);
    const { cols, rows } = readRows(MESSY, unsure);
    const input = { fileName: "mixed.csv", kind: "contacts", headers: MESSY.headers, columns: cols.map((c) => ({ col: c, header: MESSY.headers[c] })), rows };
    let sent = "";
    const call: JsonCall = async (_s, u) => {
      sent = u;
      return { stop: "end_turn", json: JSON.stringify({ rows: [{ row: 4, kind: "agent" }, { row: 0, kind: "agent" }, { row: 4, kind: "client" }] }) };
    };
    expect(await aiSortRows({ id: "lo1" }, input, { call, nonce: "dtest" })).toEqual({ ok: true, rows: { 4: "agent" } });
    expect(sent).toContain("Lopez, Ana");
    expect(sent).not.toContain("Garcia, Maria"); // a row the rules sorted isn't sent
    expect(await aiSortRows({ id: "lo1" }, input, { call: async () => ({ stop: "end_turn", json: "{nope" }) })).toMatchObject({ ok: false });
    expect(await aiSortRows({ id: "lo1" }, input, { call: null })).toMatchObject({ ok: false, error: "no AI" });
  });
});

describe("M8 reads the columns, and its answers are checked (D93)", () => {
  const m = smartMap(MESSY, "contacts");
  const input = () => ({ fileName: "messy.csv", kind: "contacts", headers: MESSY.headers, columns: readColumns(MESSY, (c) => fieldOfColumn(m, c)) });

  it("keeps a valid answer, drops consent fields, repeats, unknown columns and fields a header may not feed", async () => {
    const r = await aiReadColumns({ id: "lo1" }, input(), {
      call: ok({
        columns: [
          { column: 5, field: "zip", confidence: "sure", why: "5-digit values that match the ST column" },
          { column: 1, field: "optInText", confidence: "sure", why: "x" },
          { column: 9, field: "relationship", confidence: "unsure", why: "Buyer, Seller, Agent" },
          { column: 10, field: "zip", confidence: "sure", why: "repeat" },
          { column: 6, field: "firstName", confidence: "sure", why: "co-borrower header can't feed the person" },
          { column: 99, field: "email", confidence: "sure", why: "no such column" },
        ],
        nameOrder: "last_first",
        nameWhy: "Commas put the last name first",
      }),
    });
    expect(r).toEqual({ ok: true, columns: { 5: { field: "zip", sure: true, why: "5-digit values that match the ST column" }, 9: { field: "relationship", sure: false, why: "Buyer, Seller, Agent" } }, nameOrder: "last_first", nameWhy: "Commas put the last name first" });
  });

  it("drops bad JSON, a refusal, and runs without a key", async () => {
    expect(await aiReadColumns({ id: "lo1" }, input(), { call: async () => ({ stop: "end_turn", json: "{\"columns\": [" }) })).toMatchObject({ ok: false });
    expect(await aiReadColumns({ id: "lo1" }, input(), { call: async () => ({ stop: "refusal", json: null }) })).toMatchObject({ ok: false });
    expect(await aiReadColumns({ id: "lo1" }, input(), { call: ok({ columns: "nope" }) })).toMatchObject({ ok: false });
    expect(await aiReadColumns({ id: "lo1" }, input(), { call: null })).toMatchObject({ ok: false, error: "no AI" });
  });

  it("merges under the rules: fills what they couldn't place, flags a disagreement, never touches consent", () => {
    const t = table(["Full Name", "Mobile", "Col C", "Text OK", "SMS Opt Out"], [["Ann Lee", "206-555-1234", "98101", "yes", ""]]);
    const base = autoMap(t.headers, "contacts");
    const flags = matchFlags(t, base, base, null);
    const { mapping, flags: f } = applyM8(t.headers, base, flags, { columns: { 0: { field: "fullName", sure: true, why: "" }, 1: { field: "email", sure: true, why: "" }, 2: { field: "zip", sure: true, why: "" }, 3: { field: "optInText", sure: true, why: "" }, 4: { field: "notes", sure: true, why: "" } }, nameOrder: null, nameWhy: "" });
    expect(mapping).toMatchObject({ fullName: 0, phone: 1, zip: 2, optOutText: 4 });
    expect(mapping.optInText).toBeUndefined();
    expect(f).toMatchObject({ 1: "disagree", 2: "m8" });
    const g = cardGuesses(t, mapping, { columns: { 2: { field: "zip", sure: true, why: "Looks like ZIPs" } }, nameOrder: null, nameWhy: "" }, (x) => x);
    expect(g[2]).toMatchObject({ by: "m8", field: "zip", text: "zip. Looks like ZIPs" });
  });

  it("never sends SSN, birth date or account columns, masks private numbers anywhere, and samples from across the file", async () => {
    const t = table(["Name", "SSN", "DOB", "Account Number", "Ref", "Notes", "Phone", "Race"], [
      ["Ann Lee", "123-45-6789", "03/04/1980", "4111111111111111", "987-65-4321", "DOB 3/4/1980 card 4111 1111 1111 1111", "206-555-1234", "White"],
      ["Bo Kim", "222-33-4444", "1975-01-02", "000123456789", "111-22-3333", "", "425-555-2222", "Asian"],
      ...Array.from({ length: 40 }, (_, i) => [`Person ${i}`, "", "", "", "", "", `206-555-${String(3000 + i)}`, ""]),
    ]);
    // "Ref" holds SSN-shaped values, so the whole column is private, whatever its header says.
    expect(sendableColumns(t)).toEqual([0, 5, 6]);
    expect(scrubCell("SSN 123-45-6789")).toBe("SSN •••");
    expect(scrubCell("acct 000123456789")).toBe("acct •••");
    expect(scrubCell("206-555-1234")).toBe("206-555-1234");
    expect(scrubCell("born 03/04/1980")).toBe("born •••");
    expect(sampleColumn(t, 0).length).toBe(12);
    expect(sampleColumn(t, 0)).toContain("Person 39");
    let sent = "";
    const call: JsonCall = async (_s, u) => {
      sent = u;
      return { stop: "end_turn", json: JSON.stringify({ columns: [], nameOrder: "unknown", nameWhy: "" }) };
    };
    // Even if a browser sent every column, the server drops the private ones again.
    const everything = { fileName: "x.csv", kind: "contacts", headers: t.headers, columns: t.headers.map((h, col) => ({ col, header: h, values: t.rows.slice(0, 2).map((r) => r[col]), now: null })) };
    await aiReadColumns({ id: "lo1" }, everything, { call });
    for (const bad of ["123-45-6789", "222-33-4444", "03/04/1980", "1975-01-02", "4111111111111111", "4111 1111 1111 1111", "000123456789", "987-65-4321", "White", "Asian"]) expect(sent).not.toContain(bad);
    expect(sent).toContain("Ann Lee");
    expect(sent).toContain("206-555-1234");
    expect(readMessage(everything, "dabc").sent).toEqual([0, 5, 6]);
  });

  it("never calls the model for an agent list or a RETR file, whatever is asked", async () => {
    const call = vi.fn<JsonCall>(async () => ({ stop: "end_turn", json: JSON.stringify({ columns: [], nameOrder: "unknown", nameWhy: "", rows: [], fixes: [] }) }));
    const retrHeaders = ["Agent Name", "Office", "Total Units", "Total Volume", "Buyer Units", "Phone"];
    expect(isRetrFile("agents.csv", retrHeaders)).toBe(true);
    expect(isRetrFile("RETR export Nov.csv", ["Name"])).toBe(true);
    expect(isRetrFile("clients.csv", MESSY.headers)).toBe(false);
    const cols = [{ col: 0, header: "Agent Name", values: ["Al Agent"], now: null }];
    expect(await aiReadColumns({ id: "lo1" }, { fileName: "agents.csv", kind: "contacts", headers: retrHeaders, columns: cols }, { call })).toMatchObject({ ok: false });
    expect(await aiReadColumns({ id: "lo1" }, { fileName: "agents.csv", kind: "agents", headers: ["Name"], columns: cols }, { call })).toMatchObject({ ok: false });
    expect(await aiSortRows({ id: "lo1" }, { fileName: "RETR.csv", kind: "contacts", headers: ["Name"], columns: [{ col: 0, header: "Name" }], rows: [{ at: 0, cells: ["Al"] }] }, { call })).toMatchObject({ ok: false });
    expect(await aiFixAll({ id: "lo1" }, { fileName: "agents.csv", kind: "contacts", headers: retrHeaders, items: [{ key: "a:0:phone", field: "phone", raw: "206-555-123", reason: "phone_short", context: {} }] }, { call })).toMatchObject({ ok: false });
    expect(call).not.toHaveBeenCalled();
  });
});

describe("Fix all with M8 (D93)", () => {
  const items = [
    { key: "f:0:phone", field: "phone" as const, raw: "206-555-1234 ext 5", reason: "phone_long" as const, context: { name: "Ann Lee", city: "Seattle" } },
    { key: "f:1:phone", field: "phone" as const, raw: "206-555-12", reason: "phone_short" as const, context: { name: "Bo Kim" } },
    { key: "f:2:email", field: "email" as const, raw: "cy@gmial.con", reason: "email_invalid" as const, context: { name: "Cy Lo" } },
    { key: "f:3:state", field: "state" as const, raw: "Wash", reason: "state" as const, context: { city: "Seattle" } },
    { key: "f:4:zip", field: "zip" as const, raw: "2134", reason: "zip" as const, context: { city: "Boston", state: "MA" } },
    { key: "f:5:closedOn", field: "closedOn" as const, raw: "15/03/2021", reason: "date_order" as const, context: {} },
    { key: "f:6:name", field: "name" as const, raw: "", reason: "name_missing" as const, context: { email: "dee.park@x.com" } },
  ];

  it("keeps only fixes that pass the import's check and can be worked out from what's written", async () => {
    let sent = "";
    const call: JsonCall = async (_s, u) => {
      sent = u;
      return {
        stop: "end_turn",
        json: JSON.stringify({
          fixes: [
            { key: "f:0:phone", value: "(206) 555-1234", why: "Dropped the extension" },
            { key: "f:1:phone", value: "(206) 555-1299", why: "Invented the last digits" },
            { key: "f:2:email", value: "cy@gmail.com", why: "Typo in the domain" },
            { key: "f:3:state", value: "WA", why: "Wash is Washington" },
            { key: "f:4:zip", value: "02134", why: "Lost its leading zero" },
            { key: "f:5:closedOn", value: "2021-03-15", why: "Day first" },
            { key: "f:6:name", value: "Dee Park", why: "From the email" },
            { key: "zz:9:phone", value: "(206) 555-1234", why: "not asked" },
            { key: "f:0:phone", value: "(206) 555-0000", why: "a second answer" },
          ],
        }),
      };
    };
    const r = await aiFixAll({ id: "lo1" }, { fileName: "a.csv", kind: "contacts", headers: ["Name"], items }, { call });
    expect(r.ok && r.fixes.map((f) => [f.key, f.value])).toEqual([["f:0:phone", "(206) 555-1234"], ["f:2:email", "cy@gmail.com"], ["f:3:state", "WA"], ["f:4:zip", "02134"], ["f:5:closedOn", "2021-03-15"], ["f:6:name", "Dee Park"]]);
    expect(sent).toContain("206-555-1234 ext 5");
    expect(sent).toContain("Seattle");
    expect(await aiFixAll({ id: "lo1" }, { fileName: "a.csv", kind: "contacts", headers: ["Name"], items }, { call: async () => ({ stop: "end_turn", json: "[]" }) })).toMatchObject({ ok: false });
    expect(await aiFixAll({ id: "lo1" }, { fileName: "a.csv", kind: "contacts", headers: ["Name"], items }, { call: null })).toMatchObject({ ok: false, error: "no AI" });
  });

  it("knows a made-up value from a fix", () => {
    expect(derivable("phone", "206-555-12345", "(206) 555-1234")).toBe(true);
    expect(derivable("phone", "206-555-12", "(206) 555-1200")).toBe(false);
    expect(derivable("zip", "8101", "98101")).toBe(false);
    expect(derivable("email", "ann@gmial.com", "bob@yahoo.com")).toBe(false);
    expect(derivable("closedOn", "15/03/2021", "2021-03-16")).toBe(false);
    expect(derivable("name", "", "Ann Lee", { email: "bo@x.com" })).toBe(false);
  });
});

describe("the four steps: back and forward without losing work (D93)", () => {
  const g = (o: Partial<StepGate> = {}): StepGate => ({ files: 1, reading: false, pending: 0, records: 10, ...o });

  it("opens any step done or reached, and only when what it needs still holds", () => {
    expect(stepStatus(1, 3, 3, g())).toBe("done");
    expect(stepStatus(3, 3, 3, g())).toBe("current");
    expect(stepStatus(3, 2, 3, g())).toBe("open");
    expect(stepStatus(4, 2, 3, g())).toBe("locked"); // never reached
    expect(stepStatus(3, 2, 3, g({ pending: 1 }))).toBe("locked"); // a new question in step 2
    expect(stepStatus(2, 1, 3, g({ files: 0 }))).toBe("locked");
    expect(canGo(1, 4, 4, g({ files: 0, pending: 3, records: 0 }))).toBe(true); // back is always open
  });

  it("keeps every answer: files, column choices, fixes, tags and sources", () => {
    const state = { step: 3 as const, reached: 3 as const, items: [{ id: "a", choice: { 4: "tag" }, fixes: { 2: { phone: "(206) 555-1234" } }, tags: ["VIP"] }], provenance: "personal", importTags: ["Imported Nov 25, 2026"] };
    const back = goTo(state, 2, g());
    expect(back.step).toBe(2);
    expect(back.reached).toBe(3);
    expect(back.items).toBe(state.items);
    expect({ ...back, step: 3 }).toEqual(state);
    const again = goTo(back, 3, g());
    expect(again).toEqual(state);
    expect(goTo(back, 4, g())).toBe(back); // not reached yet
    expect(next(again, g())).toMatchObject({ step: 4, reached: 4, items: state.items });
    expect(next({ step: 2 as const, reached: 2 as const }, g({ pending: 2 }))).toEqual({ step: 2, reached: 2 });
  });

  it("the permission dialog leads to Record permission for the import, or Contacts that need permission", () => {
    expect(permissionLinks("imp_abc123XYZ")).toEqual({ record: "/mlo/contacts/permission?import=imp_abc123XYZ#record", oneByOne: "/mlo/contacts?import=imp_abc123XYZ&perm=relationship" });
  });
});
