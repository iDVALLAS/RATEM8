/**
 * lib/pricing/anonymize.ts — Mode A lender anonymity.
 *
 * Lenders are re-lettered for every run: the order is the sha256 of
 * runId + lenderKey, so the same lender is not always "Lender A" and a
 * long-run mapping cannot be inferred from position. Deterministic for a
 * given run, so a stored run rebuilds identically. The real mapping is
 * returned separately and must only ever be stored server-side.
 */
import { sha256Hex } from "./canonical";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function letterFor(index: number): string {
  if (index < LETTERS.length) return `Lender ${LETTERS[index]}`;
  return `Lender ${LETTERS[Math.floor(index / LETTERS.length) - 1]}${LETTERS[index % LETTERS.length]}`;
}

/** Map lenderKey → public label for one run. */
export function assignLetters(runId: string, lenderKeys: string[]): Map<string, string> {
  const unique = Array.from(new Set(lenderKeys));
  const ordered = unique
    .map((key) => ({ key, h: sha256Hex(`${runId}:${key}`) }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  const map = new Map<string, string>();
  ordered.forEach((o, i) => map.set(o.key, letterFor(i)));
  return map;
}
