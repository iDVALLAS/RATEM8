/**
 * The import wizard's shared shapes (D74). Client-side only: everything here
 * describes files read in the browser.
 */
import type { Csv } from "@/lib/contacts/csv";
import { guardOptOuts, type Field, type FixField, type Mapping, type RowFixes, type RowWarning } from "@/lib/contacts/mapping";
import type { ColumnChoice, ColumnFlag, ColumnTarget, FileAnswers } from "@/lib/contacts/review";
import type { M8Read, RowSort } from "@/lib/contacts/guess";
import type { Plan, SlotFixes } from "@/lib/contacts/reslot";

export type Item = {
  id: string;
  name: string;
  table: Csv;
  mapping: Mapping;
  rel: string | null;
  by: "names" | "m8";
  tags: string[];
  /** Columns matched to no field: notes, a tag, or not imported (the loan officer's pick; otherwise the default). */
  choice: Record<number, ColumnChoice>;
  /** Columns to check (M8 unsure or disagreeing, matched by contents only). */
  flags: Record<number, ColumnFlag>;
  /** Columns the loan officer chose or confirmed. */
  ok: number[];
  answers: FileAnswers;
  fixes: RowFixes;
  /** The columns panel: open or closed by the loan officer (null: open when something needs checking). */
  expanded: boolean | null;
  /** D93: M8's reading of the columns (null: not read, no AI, or a RETR file). */
  m8: M8Read | null;
  /** D93: the file looks like a RETR export, so nothing in it goes to M8. */
  retr: boolean;
  /** D93: in a mixed import, M8's sort of rows the rules couldn't sort (row index → kind), and the loan officer's moves. */
  m8Sorts?: Record<number, RowSort>;
  moves: Record<number, "client" | "agent">;
};

/** A "Needs a look" row with the list it came from. */
export type Look = RowWarning & { itemId: string; file: string; key: string };

export const lookKey = (itemId: string, at: number, field: FixField) => `${itemId}:${at}:${field}`;

/** Points a column at a field (taking the field from any other column), or at notes, a tag or "Don't import". */
export function setTarget(it: Item, col: number, target: ColumnTarget): Item {
  const m: Mapping = { ...it.mapping };
  for (const [f, c] of Object.entries(m) as [Field, number | undefined][]) if (c === col) delete m[f];
  const choice = { ...it.choice };
  if (target === "notes" || target === "tag" || target === "skip") choice[col] = target;
  else {
    m[target] = col;
    delete choice[col];
  }
  const flags = { ...it.flags };
  delete flags[col];
  return { ...it, mapping: guardOptOuts(it.table.headers, m), choice, flags, ok: [...new Set([...it.ok, col])] };
}

export function setFix(it: Item, at: number, field: FixField, value: string): Item {
  return { ...it, fixes: { ...it.fixes, [at]: { ...it.fixes[at], [field]: value } } };
}

/** D93.1: several boxes of one row at once (a shifted row, or a value moved to another box). A notes line is added, never replaced. */
export function setFixes(it: Item, at: number, patch: SlotFixes): Item {
  const cur = it.fixes[at] ?? {};
  const { note, ...boxes } = patch;
  const notes = [cur.note, note].filter(Boolean).join("\n");
  return { ...it, fixes: { ...it.fixes, [at]: { ...cur, ...boxes, ...(notes ? { note: notes } : {}) } } };
}

/** D93.1: a shifted row worked out on the device (or M8's moves for it), shown as one card. */
export type RowPlan = { key: string; itemId: string; at: number; row: number; file: string; name: string; plan: Plan; by: "device" | "m8"; why?: string; /** The "Needs a look" keys it answers. */ looks: string[] };
