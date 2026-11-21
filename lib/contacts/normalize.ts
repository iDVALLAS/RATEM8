/**
 * lib/contacts/normalize.ts — cleaning imported contact fields (D2).
 * Client-safe and pure.
 */
import { US_STATES } from "@/lib/us-states";

/** US phone to E.164 (+1XXXXXXXXXX), or null. Rejects N11 and 555-01xx fiction numbers. */
export function toE164(raw: string | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
  if (/^\d{3}55501\d{2}$/.test(d)) return null;
  return `+1${d}`;
}

export function formatPhone(e164: string | null): string {
  if (!e164) return "";
  const d = e164.slice(2);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** D77: a ZIP or ZIP+4 ("98101", "98101-1234"), or null. */
export function cleanZip(raw: string | undefined): string | null {
  const z = (raw ?? "").trim();
  return /^\d{5}(-\d{4})?$/.test(z) ? z : null;
}

/** D77: up to two letters for a person's circle ("Ann Lee" → "AL", no name → "?"). */
export function initialsOf(first: string, last: string, fallback = ""): string {
  const pick = (s: string) => (s.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "").toUpperCase();
  return pick(first) + pick(last) || pick(fallback) || "?";
}

/** D77: the last four digits of a number, for a log line that shouldn't carry the whole number. */
export const lastFour = (e164: string | null) => (e164 ? `•••-${e164.slice(-4)}` : "none");

export function cleanEmail(raw: string | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && e.length <= 254 ? e : null;
}

/**
 * USPS ZIP prefixes (first three digits) by state, as ranges. Used only to
 * guess a property state when the file has a ZIP but no state.
 */
const ZIP3: [number, number, string][] = [
  [5, 5, "NY"], [6, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 59, "VT"], [60, 69, "CT"],
  [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"], [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"],
  [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"], [370, 385, "TN"],
  [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"],
  [530, 549, "WI"], [550, 567, "MN"], [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"],
  [660, 679, "KS"], [680, 693, "NE"], [700, 715, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"],
  [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [889, 898, "NV"], [900, 961, "CA"],
  [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];

export function stateFromZip(raw: string | undefined): string | null {
  const m = /^(\d{5})(?:-\d{4})?$/.exec((raw ?? "").trim());
  if (!m) return null;
  const z = Number(m[1].slice(0, 3));
  return ZIP3.find(([a, b]) => z >= a && z <= b)?.[2] ?? null;
}

/**
 * D74: the short forms people type (newspaper style and common shortenings),
 * compared without dots or spaces: "Wash." → WA, "Calif" → CA, "W. Va." → WV.
 */
const STATE_SHORT: Record<string, string> = {
  ala: "AL", alab: "AL", alas: "AK", ariz: "AZ", ark: "AR", calif: "CA", cal: "CA", cali: "CA", colo: "CO", conn: "CT", del: "DE", fla: "FL", flor: "FL",
  ill: "IL", ills: "IL", ind: "IN", kan: "KS", kans: "KS", mass: "MA", mich: "MI", minn: "MN", miss: "MS", mont: "MT", neb: "NE", nebr: "NE", nev: "NV",
  okla: "OK", ore: "OR", oreg: "OR", penn: "PA", penna: "PA", tenn: "TN", tex: "TX", wash: "WA", wis: "WI", wisc: "WI", wyo: "WY", wva: "WV", westva: "WV",
  dc: "DC", washdc: "DC", washingtondc: "DC", ncar: "NC", scar: "SC", ndak: "ND", sdak: "SD",
};

/**
 * "Washington", "wa", "WA " → "WA"; null when it isn't a US state or DC.
 * D74 also reads "N. Carolina", "No. Dakota", "Wash.", "Calif" and "N.C.".
 */
export function cleanState(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  const byCode = US_STATES.find((x) => x.code === up);
  if (byCode) return byCode.code;
  const byName = US_STATES.find((x) => x.name.toLowerCase() === s.toLowerCase());
  if (byName) return byName.code;
  // D74: dots become spaces, then "N" / "No" / "S" / "So" / "W" in front spell out North, South, West.
  const spaced = s.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const long = spaced.replace(/^(n|no)\s+(?=\S{3})/, "north ").replace(/^(s|so)\s+(?=\S{3})/, "south ").replace(/^w\s+(?=\S{3})/, "west ");
  const named = US_STATES.find((x) => x.name.toLowerCase() === long);
  if (named) return named.code;
  const compact = spaced.replace(/\s/g, "");
  const code = US_STATES.find((x) => x.code === compact.toUpperCase());
  if (code && compact.length === 2 && /\s|\./.test(s)) return code.code;
  return STATE_SHORT[compact] ?? null;
}

/** D74: how a one-column name is written when it has no comma. */
export type NameOrder = "first_last" | "last_first";

const NAME_PREFIX = /^(mr|mrs|ms|miss|mx|dr)\.?$/i;
const NAME_SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;
/** Words that start a last name and belong with the word after them ("de la Cruz", "van Buren", "Mc Donald"). */
const NAME_PARTICLE = /^(de|del|della|der|den|di|da|das|dos|du|la|le|van|von|ter|mc|mac|st\.?|bin|ibn)$/i;

/**
 * "John Q. Smith" → ["John", "Q. Smith"]; "Smith, John" → ["John", "Smith"].
 * D74: Mr, Mrs, Ms, Miss, Mx and Dr are dropped; Jr, Sr, II, III and IV stay
 * on the last name ("Dr. Robert Allen Jr." → Robert / Allen Jr.); "de la",
 * "van" and "Mc" last names stay together; `order` reads "Garcia Maria" as
 * Last First when the loan officer says the file is written that way.
 */
export function splitName(raw: string | undefined, order: NameOrder = "first_last"): [string, string] {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return ["", ""];
  const words = (t: string) => t.split(" ").filter(Boolean);
  const dropPrefix = (w: string[]) => {
    const out = [...w];
    while (out.length > 1 && NAME_PREFIX.test(out[0])) out.shift();
    return out;
  };
  if (s.includes(",")) {
    const [a, b = ""] = s.split(",", 2).map((x) => x.trim());
    // "John Smith, Jr." is First Last with a suffix after the comma.
    if (NAME_SUFFIX.test(b)) {
      const [f, l] = splitName(a, order);
      return [f, `${l} ${b}`.trim()];
    }
    const firstWords = dropPrefix(words(b));
    const suffix = firstWords.filter((w, i) => i > 0 && NAME_SUFFIX.test(w));
    const last = [...dropPrefix(words(a)), ...suffix].join(" ");
    return [firstWords.filter((w) => !suffix.includes(w)).join(" "), last];
  }
  const all = dropPrefix(words(s));
  const suffix = all.filter((w, i) => i > 0 && NAME_SUFFIX.test(w));
  const w = all.filter((x, i) => !(i > 0 && NAME_SUFFIX.test(x)));
  if (w.length === 1) return [w[0], suffix.join(" ")];
  let first: string[];
  let last: string[];
  if (order === "last_first") {
    let i = 0;
    while (i < w.length - 1 && NAME_PARTICLE.test(w[i])) i++;
    last = w.slice(0, i + 1);
    first = w.slice(i + 1);
  } else {
    // A particle after a middle name starts the last name ("Mary Ann van Buren"); otherwise the first word is the first name.
    const p = w.findIndex((x, i) => i >= 1 && i < w.length - 1 && NAME_PARTICLE.test(x));
    first = p >= 1 ? w.slice(0, p) : w.slice(0, 1);
    last = p >= 1 ? w.slice(p) : w.slice(1);
  }
  return [first.join(" "), [...last, ...suffix].join(" ")];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** D74: month first (US, "03/04/2021" is March 4) or day first ("03/04/2021" is 3 April). */
export type DateOrder = "mdy" | "dmy";
/** 3/4/2021, 03-04-21, with an optional time. */
const NUMERIC_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)?$/;

/** "March 4, 2021" from YYYY-MM-DD (US order), or "4 March 2021" (day first). */
export function spellDate(iso: string, order: DateOrder = "mdy"): string {
  const [y, m, d] = iso.split("-").map(Number);
  return order === "dmy" ? `${d} ${MONTH_NAMES[m - 1]} ${y}` : `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

export type DateScan = { mdyOnly: number; dmyOnly: number; either: number; example: string | null };

/**
 * D74: what a column's numeric dates say about their order. `dmyOnly`: the
 * first part is over 12 (15/03/2021); `mdyOnly`: the second is (03/15/2021);
 * `either`: both parts are 12 or under and differ (03/04/2021), the one that
 * needs asking about. `example` is the first such value.
 */
export function scanDates(values: string[]): DateScan {
  const out: DateScan = { mdyOnly: 0, dmyOnly: 0, either: 0, example: null };
  for (const v of values) {
    const m = NUMERIC_DATE.exec((v ?? "").trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) out.dmyOnly++;
    else if (b > 12 && a <= 12) out.mdyOnly++;
    else if (a <= 12 && b <= 12 && a !== b && a > 0 && b > 0) {
      out.either++;
      out.example ??= v.trim();
    }
  }
  return out;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/**
 * D74: why a date couldn't be read, in plain words: "February has no 31st",
 * "doesn't fit this file's date order", or "can't be read as a date".
 */
export function dateProblem(raw: string, order: DateOrder = "mdy", now = new Date()): string {
  const s = raw.trim();
  const num = NUMERIC_DATE.exec(s);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const parts = num ? (order === "dmy" ? { y: fullYear(num[3], now), m: Number(num[2]), d: Number(num[1]) } : { y: fullYear(num[3], now), m: Number(num[1]), d: Number(num[2]) }) : iso ? { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) } : null;
  if (!parts) return "can't be read as a date";
  if (parts.m > 12 && parts.d >= 1 && parts.d <= 12 && num) return "doesn't fit this file's date order (day and month look swapped)";
  if (parts.m >= 1 && parts.m <= 12 && parts.d > daysIn(parts.y || 2000, parts.m)) return `${MONTH_NAMES[parts.m - 1]} has no ${ordinal(parts.d)}`;
  return "can't be read as a date";
}

/** D74: a cell that only says "nothing here" ("N/A", "none", "-"), so it isn't flagged as a bad value. */
export const isPlaceholder = (raw: string) => /^(n\/?a|none|null|nil|unknown|tbd|-+|\.+|x|0)$/i.test(raw.trim());

/** D74: why a phone number wasn't read: too short, too long, a 555 test number, or not a real US number. */
export function phoneProblem(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d.length < 10) return d.length === 9 ? "is one digit short" : `is ${10 - d.length} digits short`;
  if (d.length > 10) return "has too many digits";
  if (/^\d{3}55501\d{2}$/.test(d)) return "is a made-up 555 number";
  return "doesn't look like a real US number";
}

/** D74: why an email wasn't read. */
export function emailProblem(raw: string): string {
  const e = raw.trim();
  if (!e.includes("@")) return "has no @";
  if (/\s/.test(e)) return "has a space in it";
  if (!/@[^@]+\.[a-z]{2,}$/i.test(e)) return "isn't a complete email address";
  return "doesn't look like an email address";
}

/** Days in a month (1–12) of a year, leap years included. */
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A real calendar date as YYYY-MM-DD, or null. Never rolls over ("02/30" is not March 2). */
function ymd(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "99" → 1999 and "21" → 2021: a two-digit year from next year on is the last century. */
function fullYear(yy: string, now: Date): number {
  const n = Number(yy);
  if (yy.length !== 2) return n;
  return n >= (now.getUTCFullYear() % 100) + 1 ? 1900 + n : 2000 + n;
}

/**
 * A date from an imported cell, as YYYY-MM-DD, or null when it can't be read
 * for sure (D69: a month over 12 or a day past the month's end is refused,
 * never rolled into the next month). Reads ISO dates, US month/day/year,
 * "Jan 5 2020", "5 Jan 2020" and Excel serial numbers. A bare year is read
 * only for fields that allow one (as January 1 of that year).
 */
export function isoDate(raw: string | undefined, opts: { allowYear?: boolean; now?: Date; order?: DateOrder } = {}): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const now = opts.now ?? new Date();
  // D42: an Excel date stored as a plain number (days since 1899-12-30).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n >= 2_000 && n <= 80_000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).toISOString().slice(0, 10) : null;
  }
  if (/^\d{4}$/.test(s)) return opts.allowYear ? ymd(Number(s), 1, 1) : null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const us = NUMERIC_DATE.exec(s);
  // D74: day first only when the loan officer said so (or every date in the column can only be day first).
  if (us) return opts.order === "dmy" ? ymd(fullYear(us[3], now), Number(us[2]), Number(us[1])) : ymd(fullYear(us[3], now), Number(us[1]), Number(us[2]));
  const monthOf = (w: string) => {
    const i = MONTHS.indexOf(w.slice(0, 3).toLowerCase());
    return i >= 0 && /^[a-z]+$/i.test(w) ? i + 1 : 0;
  };
  const mdy = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s);
  if (mdy) return monthOf(mdy[1]) ? ymd(Number(mdy[3]), monthOf(mdy[1]), Number(mdy[2])) : null;
  const dmy = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s);
  if (dmy) return monthOf(dmy[2]) ? ymd(Number(dmy[3]), monthOf(dmy[2]), Number(dmy[1])) : null;
  return null;
}
