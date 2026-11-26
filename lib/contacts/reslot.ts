/**
 * lib/contacts/reslot.ts — a row shifted one column (D93.1). Client-safe and pure.
 *
 * The owner's file had rows where the city landed in State, the state in ZIP
 * and the ZIP in Closed on. Each "Needs a look" value on its own could only be
 * fixed in its own field, so "85262 is a ZIP, move it" couldn't be said. This
 * looks at one row's address-ish values together (street, city, state, ZIP,
 * closed on) and, when a value fails its own field but plainly fits another
 * one in the same row, proposes moving it there:
 *
 *  - 5 digits or ZIP+4 → ZIP (only when ZIP is blank, fails, or holds the same
 *    ZIP; a different good ZIP stays put and the value stays in notes as
 *    written). A ZIP whose state (USPS ZIP3) disagrees with the row's state is
 *    never moved; one that agrees makes the move "sure".
 *  - a 2-letter code or a state's name → State.
 *  - words only, sitting in State, while a state code is moving into State →
 *    City (only when City is blank or the same), title-cased.
 *  - a street ("123 Main St") → Street, a written date → Closed on.
 *  - a plain 5-digit Closed on that reads only as an Excel date number counts
 *    as stray when the row's ZIP or State failed and the ZIP agrees with the
 *    row's state.
 *
 * Every moved value is the file's own text (trimmed; a state code upper-cased,
 * a city title-cased): nothing is invented. A failing value pushed out of its
 * box with nowhere to go is kept in notes as written, as before. Consent,
 * opt-out, phone checks and provenance are never touched: only these five
 * fields (and a notes line) are ever written. Nothing changes until the loan
 * officer accepts.
 *
 * `moveOne` is the loan officer's own "Move it to…" (a button or a drag):
 * one value to one box; a failing value already in that box swaps into the
 * box the value came from, so it can be moved next and nothing is lost.
 */
import { cleanState, isoDate, stateFromZip, type DateOrder } from "./normalize";
import type { Mapping } from "./mapping";

export const SLOT_FIELDS = ["street", "city", "state", "zip", "closedOn"] as const;
export type SlotField = (typeof SLOT_FIELDS)[number];
/** Where a value can be moved: one of the five boxes, or the person's notes (kept as written). */
export type MoveTarget = SlotField | "note";
export const MOVE_TARGETS: readonly MoveTarget[] = [...SLOT_FIELDS, "note"];
/** One row's values in the five boxes, as the import reads them now (the file's, or a fix already made). */
export type Slots = Record<SlotField, string>;
/** What a plan writes for the row: a value per box ("" = blank) and a notes line to add. */
export type SlotFixes = Partial<Record<SlotField | "note", string>>;
export type Move = { from: SlotField; to: MoveTarget; value: string; same?: boolean };
export type Plan = { moves: Move[]; fixes: SlotFixes; /** Values pushed out with nowhere to go, kept in notes as written. */ noted: { field: SlotField; value: string }[]; /** The moved ZIP's state matches the row's state. */ sure: boolean; /** The fields whose "Needs a look" this plan answers. */ covers: SlotField[] };

export const SLOT_LABELS: Record<SlotField, string> = { street: "Street", city: "City", state: "State", zip: "ZIP", closedOn: "Closed on" };

const ZIP = /^\d{5}(-\d{4})?$/;
const isZip = (v: string) => ZIP.test(v.trim());
/** A written date ("3/15/2021", "Mar 15 2021"), never a bare number (that could be a ZIP). */
const isWrittenDate = (v: string, order?: DateOrder) => /[/.\-\sA-Za-z]/.test(v.trim()) && !!isoDate(v, { order });
/** House number then a word: "123 Main St", "4500B Elm". */
const isStreet = (v: string) => /^\d+[A-Za-z]?\s+[A-Za-z]/.test(v.trim()) && v.trim().length <= 120;
/** Words only (letters, spaces, . ' -), like a city. */
export const isCityWords = (v: string) => /^[A-Za-z][A-Za-z .'-]{0,58}[A-Za-z.]$/.test(v.trim()) && /[A-Za-z]{2}/.test(v);

/** "SCOTTSDALE" → "Scottsdale"; a name already in mixed case is kept as written. */
export function titleCase(v: string): string {
  const s = v.trim().replace(/\s+/g, " ");
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-.'])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/** The value as it goes into a box: trimmed; a 2-letter state upper-cased; a city title-cased. Never anything new. */
export function slotValue(to: SlotField, v: string): string {
  const s = v.trim().replace(/\s+/g, " ");
  if (to === "state") return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : s;
  if (to === "city") return titleCase(s);
  return s;
}

/** Whether a value reads right in a box (the same checks the import uses; City and Street have none of their own). */
export function fitsSlot(to: SlotField, v: string, opts: { dateOrder?: DateOrder } = {}): boolean {
  const s = v.trim();
  if (!s) return false;
  switch (to) {
    case "zip":
      return isZip(s);
    case "state":
      return !!cleanState(s);
    case "closedOn":
      return !!isoDate(s, { order: opts.dateOrder });
    case "city":
      // A two-letter state code is never a city.
      return isCityWords(s) && !(/^[A-Za-z]{2}$/.test(s) && !!cleanState(s));
    case "street":
      return isStreet(s);
  }
}

/** Two values that mean the same thing in a box (so moving one just clears the other). */
function same(to: SlotField, a: string, b: string, order?: DateOrder): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (to === "state") return !!cleanState(x) && cleanState(x) === cleanState(y);
  if (to === "closedOn") return !!isoDate(x, { order }) && isoDate(x, { order }) === isoDate(y, { order });
  if (to === "zip") return x.slice(0, 5) === y.slice(0, 5) && isZip(x) && isZip(y);
  return x.toLowerCase().replace(/\s+/g, " ") === y.toLowerCase().replace(/\s+/g, " ");
}

/** Where a stray value plainly belongs, judged on the value alone (City only for words sitting in State). */
function kindOf(from: SlotField, v: string, order?: DateOrder): SlotField | null {
  if (isZip(v)) return "zip";
  if (cleanState(v)) return "state";
  if (isWrittenDate(v, order)) return "closedOn";
  if (isStreet(v)) return "street";
  if (from === "state" && isCityWords(v)) return "city";
  return null;
}

/** One row's values in the five boxes: the loan officer's fix when there is one, else the file's cell. */
export function slotsOf(row: readonly string[], mapping: Mapping, fix?: Partial<Record<string, string>>): Slots {
  const out = {} as Slots;
  for (const f of SLOT_FIELDS) {
    const col = mapping[f];
    out[f] = fix && f in fix ? (fix[f] ?? "").trim() : col !== undefined ? (row[col] ?? "").trim() : "";
  }
  return out;
}

/**
 * Resolves wanted moves into a plan for the row, or null when nothing can
 * move. A move into a box holding a different good value is dropped; two
 * values wanting one box are both dropped; a ZIP that disagrees with the
 * row's state is dropped. Exported for M8's moves (`aiFixAll`'s `moveTo`).
 */
export function planMoves(slots: Slots, failing: readonly SlotField[], wanted: readonly Move[], opts: { dateOrder?: DateOrder; cityNeedsState?: boolean; strictZip?: readonly SlotField[] } = {}): Plan | null {
  const order = opts.dateOrder;
  const fail = new Set(failing.filter((f) => slots[f].trim()));
  // Two different values for one box: neither moves.
  const byTarget = new Map<MoveTarget, Move[]>();
  for (const m of wanted) if (m.to !== m.from && slots[m.from].trim()) byTarget.set(m.to, [...(byTarget.get(m.to) ?? []), m]);
  let moves = [...byTarget.entries()].flatMap(([to, ms]) => (to === "note" || ms.length === 1 ? ms : []));
  // Never take a box holding a different good value; a box holding the same value means the stray is just cleared.
  moves = moves.flatMap((m) => {
    if (m.to === "note") return [m];
    const there = slots[m.to];
    if (!there.trim()) return [m];
    if (same(m.to, there, m.value, order)) return [{ ...m, same: true }];
    if (fail.has(m.to)) return [m];
    return [];
  });
  for (let pass = 0; pass < 3; pass++) {
    const intoState = moves.some((m) => m.to === "state" && !m.same);
    // Words in State go to City only when a state is moving into State (the row is shifted).
    if (opts.cityNeedsState) moves = moves.filter((m) => !(m.from === "state" && m.to === "city") || intoState);
    // The row's state once the moves are made: the moved code, else a good one already there.
    const movingOut = new Set(moves.map((m) => m.from));
    const st = moves.find((m) => m.to === "state" && !m.same)?.value ?? (!movingOut.has("state") || moves.some((m) => m.from === "state" && m.same) ? slots.state : "");
    const rowState = cleanState(st);
    moves = moves.filter((m) => {
      if (m.to !== "zip") return true;
      const zs = stateFromZip(m.value);
      if (rowState && zs && zs !== rowState) return false;
      // A stray that isn't failing on its own (an Excel-looking Closed on) moves only when the ZIP's state is confirmed.
      if (opts.strictZip?.includes(m.from)) return !!rowState && zs === rowState;
      return true;
    });
  }
  if (!moves.length) return null;
  const fixes: SlotFixes = {};
  for (const m of moves) fixes[m.from] = "";
  for (const m of moves) if (m.to !== "note" && !m.same) fixes[m.to] = slotValue(m.to, m.value);
  // A failing value pushed out of its box, with no move of its own, is kept in notes as written.
  const sources = new Set(moves.map((m) => m.from));
  const noted: { field: SlotField; value: string }[] = [];
  for (const m of moves) {
    if (m.to === "note") noted.push({ field: m.from, value: m.value.trim() });
    else if (!m.same && slots[m.to].trim() && !sources.has(m.to)) noted.push({ field: m.to, value: slots[m.to].trim() });
  }
  if (noted.length) fixes.note = noted.map((n) => `${SLOT_LABELS[n.field]} (as written): ${n.value.slice(0, 120)}`).join("\n");
  const rowState = cleanState(fixes.state ?? slots.state);
  const zip = moves.find((m) => m.to === "zip" && !m.same);
  const sure = !!zip && !!rowState && stateFromZip(zip.value) === rowState;
  const covers = [...new Set([...moves.map((m) => m.from), ...noted.map((n) => n.field)])].filter((f) => fail.has(f) || moves.some((m) => m.from === f));
  return { moves, fixes, noted, sure, covers };
}

/**
 * D93.1: the device's own reading of a shifted row, from its failing fields.
 * Null when nothing plainly belongs somewhere else.
 */
export function reslotRow(slots: Slots, failing: readonly SlotField[], opts: { dateOrder?: DateOrder } = {}): Plan | null {
  const fail = new Set(failing.filter((f) => slots[f].trim()));
  const strict: SlotField[] = [];
  // A ZIP that Excel turned into a "date" number in Closed on, in a row whose ZIP or State failed.
  if (!fail.has("closedOn") && /^\d{5}$/.test(slots.closedOn) && (fail.has("zip") || fail.has("state"))) {
    fail.add("closedOn");
    strict.push("closedOn");
  }
  if (!fail.size) return null;
  const wanted: Move[] = [];
  for (const f of fail) {
    const v = slots[f].trim();
    const to = kindOf(f, v, opts.dateOrder);
    if (to && to !== f) wanted.push({ from: f, to, value: v });
  }
  if (!wanted.length) return null;
  return planMoves(slots, [...fail], wanted, { dateOrder: opts.dateOrder, cityNeedsState: true, strictZip: strict });
}

/** The boxes a "Needs a look" value could be moved to (blank, failing or the same value there), then Notes. */
export function moveTargets(from: SlotField, slots: Slots, failing: readonly SlotField[], opts: { dateOrder?: DateOrder } = {}): MoveTarget[] {
  const v = slots[from].trim();
  if (!v) return [];
  const fail = new Set(failing);
  const boxes = SLOT_FIELDS.filter((to) => to !== from && fitsSlot(to, v, opts) && (!slots[to].trim() || fail.has(to) || same(to, slots[to], v, opts.dateOrder)));
  return [...boxes, "note"];
}

/**
 * D93.1: the loan officer's own move of one value. A failing value already in
 * the box swaps into the box the value came from (it shows up in Needs a look
 * there, to be moved next); a value moved to Notes is kept there as written.
 */
export function moveOne(slots: Slots, failing: readonly SlotField[], from: SlotField, to: MoveTarget, opts: { dateOrder?: DateOrder } = {}): SlotFixes | null {
  const v = slots[from].trim();
  if (!v || to === from) return null;
  if (to === "note") return { [from]: "", note: `${SLOT_LABELS[from]} (as written): ${v.slice(0, 120)}` };
  if (!moveTargets(from, slots, failing, opts).includes(to)) return null;
  const there = slots[to].trim();
  if (there && same(to, there, v, opts.dateOrder)) return { [from]: "" };
  return { [from]: there, [to]: slotValue(to, v) };
}

/** A plan in words: "ZIP 85262 · State AZ · City Scottsdale". */
export function describePlan(p: Plan): { moved: { to: SlotField; value: string }[]; cleared: SlotField[]; noted: { field: SlotField; value: string }[] } {
  // Read in address order: "ZIP 85262 · State AZ · City Scottsdale".
  const order: SlotField[] = ["zip", "state", "city", "street", "closedOn"];
  const moved = p.moves
    .filter((m) => m.to !== "note" && !m.same)
    .map((m) => ({ to: m.to as SlotField, value: p.fixes[m.to as SlotField] ?? m.value }))
    .sort((a, b) => order.indexOf(a.to) - order.indexOf(b.to));
  const filled = new Set(moved.map((m) => m.to));
  const cleared = [...new Set(p.moves.map((m) => m.from))].filter((f) => !filled.has(f) && !p.noted.some((n) => n.field === f));
  return { moved, cleared, noted: p.noted };
}
