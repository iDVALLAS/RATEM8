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

/** "Washington", "wa", "WA " → "WA"; null when it isn't a US state or DC. */
export function cleanState(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  const byCode = US_STATES.find((x) => x.code === up);
  if (byCode) return byCode.code;
  return US_STATES.find((x) => x.name.toLowerCase() === s.toLowerCase())?.code ?? null;
}

/** "John Q. Smith" → ["John", "Q. Smith"]; "Smith, John" → ["John", "Smith"]. */
export function splitName(raw: string | undefined): [string, string] {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return ["", ""];
  if (s.includes(",")) {
    const [last, first] = s.split(",", 2).map((x) => x.trim());
    return [first ?? "", last ?? ""];
  }
  const i = s.indexOf(" ");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

export function isoDate(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  // D42: an Excel date stored as a plain number (days since 1899-12-30).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n >= 2_000 && n <= 80_000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).toISOString().slice(0, 10) : null;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  const d = us ? new Date(Date.UTC(Number(us[3].length === 2 ? `20${us[3]}` : us[3]), Number(us[1]) - 1, Number(us[2]))) : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return y >= 1900 && y <= 2100 ? d.toISOString().slice(0, 10) : null;
}
