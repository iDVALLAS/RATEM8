/**
 * D93.1: rows shifted one column (the owner's report, rows 126 and 127, with
 * the people's names changed: one ZIP in Closed on; one ZIP in Closed on,
 * state in ZIP, city in State),
 * worked out on the device, M8's `moveTo`, the loan officer's own moves, and
 * the contact page's pencils and drag-to-swap.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRecords, type Mapping } from "./mapping";
import { describePlan, moveOne, moveTargets, planMoves, reslotRow, slotsOf, titleCase, type SlotField, type Slots } from "./reslot";
import { aiFixAll, fixMessage, moveAllowed, type JsonCall } from "./ai-read";
import { asWrittenLines, canSwap, checkEdit, chipInto, swapBoxes } from "./editing";
import { setFixes, type Item } from "@/app/mlo/contacts/import/types";
import type { Csv } from "./csv";

const HEADERS = ["Name", "Phone", "Email", "Street", "City", "State", "ZIP", "Closed on"];
const MAP: Mapping = { fullName: 0, phone: 1, email: 2, street: 3, city: 4, state: 5, zip: 6, closedOn: 7 };
const HUSSIEN = ["Hal Ames", "206-555-2101", "hal@x.com", "4000 S 188th St", "SeaTac", "WA", "", "98168"];
const LUDWIG = ["Lou Avery", "480-555-2202", "lou@x.com", "9000 E Pima Center Pkwy", "", "SCOTTSDALE", "AZ", "85262"];
const FINE = ["Ann Lee", "206-555-2303", "ann@x.com", "1 Main St", "Seattle", "WA", "98101", "3/15/2021"];
// Rows 126 and 127 as numbered in the owner's file (header on row 1).
const FILE: Csv = { headers: HEADERS, rows: [...Array.from({ length: 124 }, () => FINE), HUSSIEN, LUDWIG] };
const H = 124;
const L = 125;
const SLOTS: SlotField[] = ["street", "city", "state", "zip", "closedOn"];
const slots = (row: string[]): Slots => slotsOf(row, MAP);
const failing = (at: number, fixes = {}) => buildRecords(FILE, MAP, "contacts", { fixes }).warnings.filter((w) => w.at === at && (SLOTS as string[]).includes(w.field)).map((w) => w.field as SlotField);

describe("D93.1 the owner's two rows", () => {
  it("are the warnings from the screenshot", () => {
    const w = buildRecords(FILE, MAP, "contacts").warnings;
    expect(w.filter((x) => x.at === H).map((x) => [x.row, x.field, x.raw, x.reason])).toEqual([[126, "closedOn", "98168", "can't be read as a date"]]);
    expect(w.filter((x) => x.at === L).map((x) => [x.row, x.field, x.raw, x.reason])).toEqual([
      [127, "zip", "AZ", "isn't a 5-digit ZIP"],
      [127, "state", "SCOTTSDALE", "isn't a US state we know"],
      [127, "closedOn", "85262", "can't be read as a date"],
    ]);
  });

  it("moves row 126's 98168 from Closed on to ZIP (a Washington ZIP, so it's sure)", () => {
    const p = reslotRow(slots(HUSSIEN), failing(H))!;
    expect(p.fixes).toEqual({ closedOn: "", zip: "98168" });
    expect(p.sure).toBe(true);
    expect(describePlan(p)).toEqual({ moved: [{ to: "zip", value: "98168" }], cleared: ["closedOn"], noted: [] });
    const built = buildRecords(FILE, MAP, "contacts", { fixes: { [H]: p.fixes } });
    expect(built.warnings.filter((w) => w.at === H)).toEqual([]);
    const r = built.records[H];
    expect([r.zip, r.state, r.loan]).toEqual(["98168", "WA", null]);
    expect(r.notes ?? "").not.toContain("as written");
  });

  it("re-slots row 127: ZIP 85262 · State AZ · City Scottsdale", () => {
    const p = reslotRow(slots(LUDWIG), failing(L))!;
    expect(p.fixes).toEqual({ zip: "85262", state: "AZ", city: "Scottsdale", closedOn: "" });
    expect(p.sure).toBe(true);
    expect(p.covers.sort()).toEqual(["closedOn", "state", "zip"]);
    expect(describePlan(p).moved.map((m) => `${m.to} ${m.value}`).sort()).toEqual(["city Scottsdale", "state AZ", "zip 85262"]);
    const built = buildRecords(FILE, MAP, "contacts", { fixes: { [L]: p.fixes } });
    expect(built.warnings.filter((w) => w.at === L)).toEqual([]);
    const r = built.records[L];
    expect([r.street, r.city, r.state, r.zip, r.loan]).toEqual(["9000 E Pima Center Pkwy", "Scottsdale", "AZ", "85262", null]);
    expect(r.notes ?? "").not.toContain("as written");
  });

  it("never invents a value: every value written is blank or the row's own text", () => {
    for (const [row, at] of [[HUSSIEN, H], [LUDWIG, L]] as const) {
      const p = reslotRow(slots([...row]), failing(at))!;
      const own = row.map((v) => v.toLowerCase());
      for (const v of Object.values(p.fixes)) expect(v === "" || own.includes(v!.toLowerCase())).toBe(true);
    }
  });
});

describe("D93.1 when a value doesn't move", () => {
  const one = (zip: string, closedOn: string, state = "WA") => ({ street: "", city: "", state, zip, closedOn });

  it("leaves a different good ZIP alone (the stray stays in notes as written)", () => {
    expect(reslotRow(one("98101", "85262"), ["closedOn"])).toBeNull();
    const t: Csv = { headers: HEADERS, rows: [["Bo Ray", "206-555-2404", "", "", "", "WA", "98101", "85262"]] };
    expect(buildRecords(t, MAP, "contacts").records[0].notes).toContain("Closed on (as written): 85262");
  });

  it("just clears the stray when it's the same ZIP", () => {
    expect(reslotRow(one("98168", "98168"), ["closedOn"])?.fixes).toEqual({ closedOn: "" });
  });

  it("never moves a ZIP that disagrees with the row's state", () => {
    expect(reslotRow(one("", "85262", "WA"), ["closedOn"])).toBeNull();
  });

  it("moves a ZIP with no state to check against, but not as sure", () => {
    const p = reslotRow(one("", "98168", ""), ["closedOn"])!;
    expect(p.fixes).toEqual({ closedOn: "", zip: "98168" });
    expect(p.sure).toBe(false);
  });

  it("puts words from State into City only while a state code is moving in", () => {
    expect(reslotRow({ street: "", city: "", state: "SCOTTSDALE", zip: "", closedOn: "" }, ["state"])).toBeNull();
    // City already holds something else: the city stays, the stray state word goes to notes as written.
    const p = reslotRow({ street: "", city: "Phoenix", state: "SCOTTSDALE", zip: "AZ", closedOn: "85262" }, ["zip", "state", "closedOn"])!;
    expect(p.fixes).toEqual({ zip: "85262", state: "AZ", closedOn: "", note: "State (as written): SCOTTSDALE" });
  });

  it("catches a ZIP that Excel made into a date number, only in a shifted row whose state agrees", () => {
    const p = reslotRow({ street: "", city: "", state: "ATLANTA", zip: "GA", closedOn: "30301" }, ["zip", "state"])!;
    expect(p.fixes).toEqual({ zip: "30301", state: "GA", city: "Atlanta", closedOn: "" });
    expect(reslotRow({ street: "", city: "Atlanta", state: "GA", zip: "30301", closedOn: "30301" }, [])).toBeNull();
    // A Georgia ZIP in a Washington row stays where it was; the state and city still move.
    expect(reslotRow({ street: "", city: "", state: "SEATTLE", zip: "WA", closedOn: "30301" }, ["zip", "state"])?.fixes).toEqual({ zip: "", state: "WA", city: "Seattle" });
  });

  it("drops two values that want the same box", () => {
    expect(planMoves({ street: "", city: "", state: "", zip: "", closedOn: "" }, [], [])).toBeNull();
    expect(planMoves({ street: "", city: "", state: "98101", zip: "", closedOn: "98168" }, ["state", "closedOn"], [{ from: "state", to: "zip", value: "98101" }, { from: "closedOn", to: "zip", value: "98168" }])).toBeNull();
  });

  it("title-cases only all-caps or all-lower city names", () => {
    expect([titleCase("SCOTTSDALE"), titleCase("st. george"), titleCase("McAllen"), titleCase("coeur d'alene")]).toEqual(["Scottsdale", "St. George", "McAllen", "Coeur D'Alene"]);
  });
});

describe("D93.1 Move it to… (the loan officer's own move)", () => {
  const s = slots(LUDWIG);
  const f: SlotField[] = ["zip", "state", "closedOn"];

  it("offers only the boxes a value fits, then Notes", () => {
    expect(moveTargets("closedOn", s, f)).toEqual(["zip", "note"]);
    expect(moveTargets("zip", s, f)).toEqual(["state", "note"]);
    expect(moveTargets("state", s, f)).toEqual(["city", "note"]);
    // A ZIP box holding a different good ZIP isn't offered.
    expect(moveTargets("closedOn", { ...s, zip: "98101" }, ["closedOn"])).toEqual(["note"]);
  });

  it("swaps a failing value back into the box it came from, so nothing is lost", () => {
    expect(moveOne(s, f, "closedOn", "zip")).toEqual({ closedOn: "AZ", zip: "85262" });
    expect(moveOne(s, f, "state", "city")).toEqual({ state: "", city: "Scottsdale" });
    expect(moveOne(s, f, "zip", "note")).toEqual({ zip: "", note: "ZIP (as written): AZ" });
    expect(moveOne(s, f, "state", "zip")).toBeNull();
  });

  it("walks row 127 to the right boxes one move at a time", () => {
    let fixes: Record<string, string> = {};
    const step = (from: SlotField, to: SlotField) => {
      const row = slotsOf(LUDWIG, MAP, fixes);
      const patch = moveOne(row, failing(L, { [L]: fixes }), from, to)!;
      fixes = { ...fixes, ...(patch as Record<string, string>) };
    };
    step("closedOn", "zip"); // 85262 → ZIP; AZ comes back into Closed on
    step("closedOn", "state"); // AZ → State; SCOTTSDALE comes back into Closed on
    step("closedOn", "city"); // SCOTTSDALE → City
    const built = buildRecords(FILE, MAP, "contacts", { fixes: { [L]: fixes } });
    expect(built.warnings.filter((w) => w.at === L)).toEqual([]);
    expect([built.records[L].city, built.records[L].state, built.records[L].zip]).toEqual(["Scottsdale", "AZ", "85262"]);
  });

  it("adds a notes line rather than replacing one (setFixes)", () => {
    const it0 = { fixes: {} } as unknown as Item;
    const a = setFixes(it0, 3, { zip: "", note: "ZIP (as written): AZ" });
    const b = setFixes(a, 3, { closedOn: "", note: "Closed on (as written): 85262" });
    expect(b.fixes[3]).toEqual({ zip: "", closedOn: "", note: "ZIP (as written): AZ\nClosed on (as written): 85262" });
    const t: Csv = { headers: HEADERS, rows: [LUDWIG] };
    expect(buildRecords(t, MAP, "contacts", { fixes: { 0: b.fixes[3] } }).records[0].notes).toContain("ZIP (as written): AZ\nClosed on (as written): 85262");
  });
});

describe("D93.1 M8's moveTo in Fix all", () => {
  const ctx = { name: "Lou Avery", email: "lou@x.com", street: "9000 E Pima Center Pkwy", state: "SCOTTSDALE", zip: "AZ", closedOn: "85262" };
  const items = [
    { key: "f:125:closedOn", field: "closedOn" as const, raw: "85262", reason: "date_unreadable" as const, context: ctx },
    { key: "f:125:zip", field: "zip" as const, raw: "AZ", reason: "zip" as const, context: ctx },
    { key: "f:125:state", field: "state" as const, raw: "SCOTTSDALE", reason: "state" as const, context: ctx },
  ];

  it("keeps moves of the row's own text into a box it fits", async () => {
    let sent = "";
    const call: JsonCall = async (_s, user) => {
      sent = user;
      return {
        stop: "end_turn",
        json: JSON.stringify({
          fixes: [
            { key: "f:125:closedOn", value: "85262", why: "A ZIP in the date column", moveTo: "zip" },
            { key: "f:125:zip", value: "AZ", why: "A state code", moveTo: "state" },
            { key: "f:125:state", value: "Scottsdale", why: "The city", moveTo: "city" },
          ],
        }),
      };
    };
    const r = await aiFixAll({ id: "lo1" }, { fileName: "clients.csv", kind: "contacts", headers: HEADERS, items }, { call });
    expect(r.ok && r.fixes.map((f) => [f.key, f.value, f.moveTo])).toEqual([["f:125:closedOn", "85262", "zip"], ["f:125:zip", "AZ", "state"], ["f:125:state", "Scottsdale", "city"]]);
    // The row's other cells (closed on included) went with each value.
    expect(sent).toContain("closedOn=");
    // Planned together on the device, they make the same row as the rule.
    const plan = planMoves(slots(LUDWIG), ["zip", "state", "closedOn"], r.ok ? r.fixes.map((f) => ({ from: items.find((i) => i.key === f.key)!.field, to: f.moveTo!, value: f.value })) : []);
    expect(plan?.fixes).toEqual({ zip: "85262", state: "AZ", city: "Scottsdale", closedOn: "" });
  });

  it("drops a bad target, a value not in the row, a ZIP that disagrees with the state, and a box holding another good value", async () => {
    const call: JsonCall = async () => ({
      stop: "end_turn",
      json: JSON.stringify({
        fixes: [
          { key: "a", value: "85262", why: "x", moveTo: "phone" },
          { key: "b", value: "85261", why: "x", moveTo: "zip" },
          { key: "c", value: "85262", why: "x", moveTo: "zip" },
          { key: "d", value: "85262", why: "x", moveTo: "zip" },
          { key: "e", value: "Phoenix", why: "x", moveTo: "city" },
        ],
      }),
    });
    const mk = (key: string, field: "closedOn" | "state", raw: string, context: Record<string, string>) => ({ key, field, raw, reason: field === "state" ? ("state" as const) : ("date_unreadable" as const), context });
    const r = await aiFixAll({ id: "lo1" }, {
      fileName: "clients.csv",
      kind: "contacts",
      headers: HEADERS,
      items: [mk("a", "closedOn", "85262", {}), mk("b", "closedOn", "85262", {}), mk("c", "closedOn", "85262", { state: "WA" }), mk("d", "closedOn", "85262", { zip: "98101" }), mk("e", "state", "SCOTTSDALE", {})],
    }, { call });
    expect(r).toEqual({ ok: true, fixes: [] });
  });

  it("checks a move the same way on its own (moveAllowed)", () => {
    expect(moveAllowed("closedOn", "85262", "85262", "zip", { state: "AZ" })).toBe(true);
    expect(moveAllowed("closedOn", "85262", "85262", "zip", { state: "WA" })).toBe(false);
    expect(moveAllowed("zip", "AZ", "az", "state", {})).toBe(true);
    expect(moveAllowed("zip", "AZ", "AZ", "state", { state: "WA" })).toBe(false);
    expect(moveAllowed("zip", "AZ", "AZ", "note", {})).toBe(true);
    expect(moveAllowed("phone", "AZ", "AZ", "state", {})).toBe(false);
    expect(moveAllowed("state", "SCOTTSDALE", "Scottsdale", "zip", {})).toBe(false);
  });

  it("sends the row's closed-on cell as context, never a private one", () => {
    const text = fixMessage({ fileName: "a.csv", kind: "contacts", headers: HEADERS, items: [{ ...items[0], context: { ...ctx, ssn: "123-45-6789" } }] }, "n0nce");
    expect(text).toContain("closedOn=");
    expect(text).not.toContain("123-45-6789");
  });
});

describe("D93.1 contact page: pencils and drag", () => {
  const boxes = { street: "9000 E Pima Center Pkwy", city: "AZ", state: "", zip: "", notes: "From the file\nState (as written): SCOTTSDALE\nClosed on (as written): 85262" };

  it("reads values kept in notes as written", () => {
    expect(asWrittenLines(boxes.notes)).toEqual([{ line: 1, label: "State", value: "SCOTTSDALE" }, { line: 2, label: "Closed on", value: "85262" }]);
  });

  it("swaps two address boxes only when each value fits the other box", () => {
    expect(canSwap(boxes, "city", "state")).toBe(true);
    expect(swapBoxes(boxes, "city", "state")).toEqual({ state: "AZ", city: "" });
    expect(canSwap({ ...boxes, city: "Scottsdale" }, "city", "state")).toBe(false);
    expect(swapBoxes(boxes, "street", "zip")).toEqual({ zip: "9000 E Pima Center Pkwy", street: "" });
    expect(canSwap(boxes, "zip", "city")).toBe(false);
  });

  it("drops a value from the file into a box and takes it out of the notes; the box's old value goes to notes", () => {
    const a = chipInto(boxes, 1, "zip")!;
    expect(a).toEqual({ zip: "85262", notes: "From the file\nState (as written): SCOTTSDALE" });
    const b = chipInto({ ...boxes, city: "AZ" }, 0, "city")!;
    expect(b).toEqual({ city: "Scottsdale", notes: "From the file\nClosed on (as written): 85262\nCity (as written): AZ" });
    expect(chipInto(boxes, 0, "state")).toBeNull();
    // Nothing is saved until Save, which runs the same checks.
    const v = { firstName: "Lou", lastName: "Avery", phone: "480-555-2202", relationship: "past_client", ...boxes, ...a, ...swapBoxes(boxes, "city", "state") };
    expect(checkEdit(v, "contact")).toMatchObject({ ok: true, values: { state: "AZ", zip: "85262", city: null } });
  });

  it("puts a pencil with a name beside each editable detail, and the form listens for it", () => {
    const page = readFileSync("app/mlo/contacts/[id]/page.tsx", "utf8");
    for (const f of ["phone", "email", "street", "relationship", "leadSource", "referredBy", "coFirstName", "notes"]) expect(page).toContain(`pen("${f}"`);
    expect(page).toContain('data-edit-field={field} aria-label={cp.edit.pen(label)}');
    expect(page).toContain('href="#loan-edit"');
    expect(page).toContain('id="loan-edit"');
    const edit = readFileSync("app/mlo/contacts/[id]/EditDetails.tsx", "utf8");
    expect(edit).toContain('closest?.("[data-edit-field]")');
    expect(edit).toContain("cc-drop--on");
    expect(edit).toMatch(/onDrop/);
  });

  it("gives every Needs a look address value a Move to group with buttons, and drag as an extra", () => {
    const shift = readFileSync("app/mlo/contacts/import/Shift.tsx", "utf8");
    expect(shift).toContain("draggable");
    expect(shift).toMatch(/<button[\s\S]*onClick=\{\(\) => onMove\(to\)\}[\s\S]*onDrop/);
    const review = readFileSync("app/mlo/contacts/import/ReviewStep.tsx", "utf8");
    expect(review).toContain("<MoveTo");
    expect(review).toContain("<ShiftCards");
    const css = readFileSync("app/mlo/cc-shell.css", "utf8");
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.cc-app \.im-drop/);
  });
});
