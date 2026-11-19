/**
 * lib/expenses/parse.ts — turns "lunch with an agent at Daniel's, $84" into
 * a draft expense without any AI (D37). Pure. The AI path in service.ts
 * does better on messy text; this one always works, and its drafts are
 * always confirmed by the loan officer before they count.
 */
import { guessCategory, type Category } from "./categories";

export type Draft = {
  kind: "expense" | "income" | "mileage" | "charity";
  date: string;
  amountCents: number | null;
  miles: number | null;
  vendor: string;
  category: Category;
  businessPct: number;
  purpose: string;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A date from "today", "yesterday", "last Tuesday", "11/12", "Nov 12", "2026-11-12"; else today (Pacific). */
export function parseDate(text: string, today: string): string {
  const t = text.toLowerCase();
  const shift = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const iso = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  if (iso) return iso[0];
  if (/\byesterday\b/.test(t)) return shift(-1);
  if (/\btoday\b|\btonight\b|\bthis morning\b/.test(t)) return today;
  const dow = t.match(/\b(?:last |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dow) {
    const want = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(dow[1]);
    const now = new Date(`${today}T12:00:00Z`).getUTCDay();
    return shift(-(((now - want + 7) % 7) || 7));
  }
  const y = Number(today.slice(0, 4));
  const pick = (m: number, d: number) => {
    const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return s > today ? `${y - 1}${s.slice(4)}` : s; // a date "in the future" means last year
  };
  const md = t.match(/\b(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])(?:\/(\d{2,4}))?\b/);
  if (md) {
    if (md[3]) return `${md[3].length === 2 ? `20${md[3]}` : md[3]}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
    return pick(Number(md[1]), Number(md[2]));
  }
  const mn = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(3[01]|[12]\d|0?[1-9])\b/);
  if (mn) return pick(MONTHS.indexOf(mn[1]) + 1, Number(mn[2]));
  return today;
}

const money = (s: string) => {
  const m = s.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))\b|\b(\d+)\s?(?:dollars|bucks)\b/i);
  if (!m) return null;
  const whole = (m[1] ?? m[3] ?? m[5] ?? "0").replace(/,/g, "");
  const frac = (m[2] ?? m[4] ?? "").padEnd(2, "0").slice(0, 2);
  return Number(whole) * 100 + Number(frac || 0);
};

/** One line or sentence each; "and" joins are left to the AI path. */
export function parseLine(line: string, today: string): Draft | null {
  const text = line.trim();
  if (text.length < 3) return null;
  const milesM = text.match(/\b(\d+(?:\.\d+)?)\s?(?:mi|miles?)\b/i);
  const amountCents = money(text.replace(milesM?.[0] ?? "\u0000", ""));
  const income = /\b(paid me|got paid|check from|deposit from|income|1099|comp from|payout from)\b/i.test(text);
  if (!milesM && amountCents === null) return null;
  const at = text.match(/\b(?:at|from|to)\s+([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})/);
  // "Home Trust paid me $6,200": the payer comes first.
  const payer = text.match(/^([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,3})\s+(?:paid me|sent me|deposited)\b/);
  const charity = /\b(charit\w*|volunteer\w*|non-?profit|church|food bank|habitat for humanity|donat\w*)\b/i.test(text);
  const kind: Draft["kind"] = milesM ? (charity ? "charity" : "mileage") : income ? "income" : "expense";
  const category = milesM ? "car" : guessCategory(text);
  return {
    kind,
    date: parseDate(text, today),
    amountCents: milesM ? null : amountCents,
    miles: milesM ? Number(milesM[1]) : null,
    vendor: (payer?.[1] ?? at?.[1])?.slice(0, 80) ?? "",
    category,
    businessPct: category === "utilities" ? 50 : 100,
    purpose: text.slice(0, 200),
  };
}

export function parseText(text: string, today: string): Draft[] {
  return text
    .split(/\n|;|(?<=[.!?])\s+(?=[A-Z0-9$])/)
    .map((l) => parseLine(l, today))
    .filter((d): d is Draft => d !== null)
    .slice(0, 20);
}
