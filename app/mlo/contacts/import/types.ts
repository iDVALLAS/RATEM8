/**
 * The import wizard's shared shapes (D74). Client-side only: everything here
 * describes files read in the browser.
 */
import type { Csv } from "@/lib/contacts/csv";
import { guardOptOuts, type Field, type FixField, type Mapping, type RowFixes, type RowWarning } from "@/lib/contacts/mapping";
import type { ColumnChoice, ColumnFlag, ColumnTarget, FileAnswers } from "@/lib/contacts/review";

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
