/**
 * lib/pricing/posted-rate.ts — the two posted rates (v37, L4).
 *
 * Each Thursday the loan officer enters Freddie Mac's weekly averages
 * (PMMS, 30- and 15-year fixed). The posted rate is the average minus
 * CONFIG.pricing.postedMargin, rounded DOWN to the nearest postedStep, at
 * zero discount points. APR uses the lender fees in CONFIG.pricing.fees.
 * A week publishes only after the loan officer confirms they can honor
 * both rates; it shows until the honor window closes (the next Wednesday,
 * 11:59 PM Pacific). Pure functions plus a write-once store; every
 * correction or withdrawal is a new record.
 */
import { CONFIG } from "@/lib/config";
import { getJson, getRecords, putJson, stamp, type RecordStore } from "@/lib/records";
import { computeApr, paymentSchedule } from "./apr";

export const TZ = "America/Los_Angeles";

export type PostedProduct = "30yr_fixed" | "15yr_fixed";
export const POSTED_PRODUCTS: ReadonlyArray<{ product: PostedProduct; termMonths: number; label: string }> = [
  { product: "30yr_fixed", termMonths: 360, label: "30-year fixed" },
  { product: "15yr_fixed", termMonths: 180, label: "15-year fixed" },
];

export type PostedLine = {
  product: PostedProduct;
  /** Freddie Mac PMMS weekly average, percent, as published (2 decimals). */
  pmms: number;
  rate: number;
  apr: number;
  monthlyPayment: number;
};

export type PostedWeek = {
  schemaVersion: 1;
  /** PMMS release date (a Thursday), YYYY-MM-DD, Pacific calendar. */
  weekOf: string;
  lines: PostedLine[];
  /** First instant shown: release day 9:00 AM PT (noon ET). */
  releasedAt: string;
  /** Last instant shown and honored: the next Wednesday, 11:59:59 PM PT. */
  honorUntil: string;
  loanAmount: number;
  financeCharges: number;
  confirmedBy: string;
  confirmedAt: string;
  /** Optional ARIVE screenshot kept as evidence (sha256 in the pricing store). */
  evidenceSha256: string | null;
  withdrawn: boolean;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function financeCharges(): number {
  const f = CONFIG.pricing.fees;
  return f.underwriting + f.processing;
}

/** Average minus the margin, rounded down to the step (never up). */
export function postedRateFor(pmms: number, margin = CONFIG.pricing.postedMargin, step = CONFIG.pricing.postedStep): number {
  if (!(pmms > 1 && pmms < 20)) throw new Error("PMMS average must be a percent between 1 and 20");
  const raw = pmms - margin;
  return round3(Math.floor(raw / step + 1e-9) * step);
}

export function postedLoanAmount(): number {
  const p = CONFIG.pricing.postedProfile;
  return Math.round(p.examplePrice * (1 - p.minDownPct / 100));
}

export function postedLine(product: PostedProduct, pmms: number): PostedLine {
  const term = POSTED_PRODUCTS.find((p) => p.product === product)!.termMonths;
  const rate = postedRateFor(pmms);
  const loan = postedLoanAmount();
  return {
    product,
    pmms: Math.round(pmms * 100) / 100,
    rate,
    apr: computeApr(loan, rate, term, financeCharges()),
    monthlyPayment: Math.round(paymentSchedule(loan, rate, term)[0] * 100) / 100,
  };
}

// ── Pacific time ─────────────────────────────────────────────────────

function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** A Pacific wall-clock time as an instant. */
export function pacific(ymd: string, hh: number, mm: number, ss = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const first = new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000);
  return new Date(guess.getTime() - tzOffsetMinutes(first) * 60000);
}

/** YYYY-MM-DD in Pacific time. */
export function pacificDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isThursday(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 4;
}

export function weekWindow(weekOf: string): { releasedAt: string; honorUntil: string } {
  return {
    releasedAt: pacific(weekOf, 9, 0).toISOString(),
    honorUntil: pacific(addDays(weekOf, 6), 23, 59, 59).toISOString(),
  };
}

/** "Thu, Oct 30, 2:10 PM PT" style labels. */
export function pacificLabel(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }): string {
  return `${new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts }).format(new Date(iso))} PT`;
}

export function dayLabel(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${ymd}T12:00:00Z`));
}

// ── Building and storing a week ──────────────────────────────────────

export type PostedRequest = {
  weekOf: string;
  pmms30: number;
  pmms15: number;
  confirmed: boolean;
  actor: string;
  evidenceSha256?: string | null;
  now?: Date;
};

export function buildPostedWeek(req: PostedRequest): { ok: true; week: PostedWeek } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const now = req.now ?? new Date();
  if (!isThursday(req.weekOf)) errors.push("The week starts on the Thursday Freddie Mac releases its average. Pick that Thursday's date.");
  for (const [k, v] of [["30-year", req.pmms30], ["15-year", req.pmms15]] as const) {
    if (!(Number.isFinite(v) && v > 1 && v < 20)) errors.push(`Enter Freddie Mac's ${k} average as a percent, e.g. 6.17.`);
  }
  if (!req.confirmed) errors.push("Tick the box confirming you can honor both rates this week.");
  if (errors.length) return { ok: false, errors };
  const w = weekWindow(req.weekOf);
  if (Date.parse(w.honorUntil) < now.getTime()) return { ok: false, errors: ["That week's honor window has already closed."] };
  if (Date.parse(w.releasedAt) - now.getTime() > 7 * 86400_000) return { ok: false, errors: ["That week is more than a week away."] };
  return {
    ok: true,
    week: {
      schemaVersion: 1,
      weekOf: req.weekOf,
      lines: [postedLine("30yr_fixed", req.pmms30), postedLine("15yr_fixed", req.pmms15)],
      ...w,
      loanAmount: postedLoanAmount(),
      financeCharges: financeCharges(),
      confirmedBy: req.actor,
      confirmedAt: now.toISOString(),
      evidenceSha256: req.evidenceSha256 ?? null,
      withdrawn: false,
    },
  };
}

export async function savePostedWeek(week: PostedWeek, store: RecordStore = getRecords()): Promise<void> {
  if (!store.writable) throw new Error(store.reason ?? "Storage is read-only.");
  await putJson(store, `weekly/posted/${week.weekOf}/${stamp(new Date(week.confirmedAt))}.json`, week);
}

export async function withdrawPostedWeek(weekOf: string, actor: string, store: RecordStore = getRecords(), now = new Date()): Promise<boolean> {
  const latest = await latestForWeek(weekOf, store);
  if (!latest || latest.withdrawn) return false;
  await savePostedWeek({ ...latest, withdrawn: true, confirmedBy: actor, confirmedAt: now.toISOString() }, store);
  return true;
}

export async function latestForWeek(weekOf: string, store: RecordStore = getRecords()): Promise<PostedWeek | null> {
  const keys = await store.list(`weekly/posted/${weekOf}/`);
  const last = keys[keys.length - 1];
  return last ? getJson<PostedWeek>(store, last) : null;
}

/** The week showing now, or null (none published, withdrawn, or closed). */
export async function currentPostedWeek(now: Date = new Date(), store: RecordStore = getRecords()): Promise<PostedWeek | null> {
  const keys = await store.list("weekly/posted/");
  const weeks = Array.from(new Set(keys.map((k) => k.split("/")[2]))).sort().reverse();
  for (const wk of weeks.slice(0, 3)) {
    const w = await latestForWeek(wk, store);
    if (!w || w.withdrawn) continue;
    const t = now.getTime();
    if (t >= Date.parse(w.releasedAt) && t <= Date.parse(w.honorUntil)) return w;
  }
  return null;
}

/** The Thursday on or before `now` (Pacific), for the admin's default. */
export function thisThursday(now: Date = new Date()): string {
  let d = pacificDate(now);
  for (let i = 0; i < 7 && !isThursday(d); i++) d = addDays(d, -1);
  return d;
}
