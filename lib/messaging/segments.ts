/**
 * lib/messaging/segments.ts — what a text costs, and keeping it cheap (D25).
 * Client-safe and pure.
 *
 * Carriers bill per segment. Plain GSM-7 text fits 160 characters in one
 * segment (153 each when split). One character outside GSM-7 (a curly quote,
 * a long dash, an emoji) switches the whole text to UCS-2: 70 in one
 * segment, 67 each when split, so a 150-character text costs 3 segments
 * instead of 1 (ledger item 13). Typographic punctuation is swapped for its
 * plain form before sending, which never changes the meaning.
 */

const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€\f";
const BASIC = new Set([...GSM_BASIC]);
const EXT = new Set([...GSM_EXT]);

const SWAPS: [RegExp, string][] = [
  [/[‘’‚′´]/g, "'"],
  [/[“”„″]/g, '"'],
  [/[–—‒―−]/g, "-"],
  [/…/g, "..."],
  [/[     ]/g, " "],
  [/[•·]/g, "-"],
  [/[​‌‍﻿]/g, ""],
];

/** Swaps typographic punctuation for plain GSM-7 characters. */
export function toGsm(text: string): string {
  let t = text;
  for (const [re, to] of SWAPS) t = t.replace(re, to);
  return t;
}

export const isGsm = (text: string) => [...text].every((ch) => BASIC.has(ch) || EXT.has(ch));

export type SegmentInfo = { encoding: "GSM-7" | "UCS-2"; units: number; segments: number; offenders: string[] };

/** Segments a text will bill as. */
export function segmentInfo(text: string): SegmentInfo {
  if (isGsm(text)) {
    const units = [...text].reduce((n, ch) => n + (EXT.has(ch) ? 2 : 1), 0);
    return { encoding: "GSM-7", units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153), offenders: [] };
  }
  // UCS-2 counts UTF-16 code units (an emoji is 2).
  const units = text.length;
  const offenders = [...new Set([...text].filter((ch) => !BASIC.has(ch) && !EXT.has(ch)))].slice(0, 5);
  return { encoding: "UCS-2", units, segments: units <= 70 ? 1 : Math.ceil(units / 67), offenders };
}

/** A short label for a draft card ("1 text segment", "3 segments: an emoji makes it bill as UCS-2"). */
export function segmentLabel(text: string): string {
  const s = segmentInfo(toGsm(text));
  const base = `${s.segments} text segment${s.segments === 1 ? "" : "s"}`;
  return s.encoding === "UCS-2" ? `${base} (${s.offenders.join(" ")} makes it bill at 70 characters a segment)` : base;
}
