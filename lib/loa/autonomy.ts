/**
 * lib/loa/autonomy.ts — the LOA switches (D70). Pure: no store, no I/O.
 *
 * One switch per task the LOA can do, set separately for purchases and
 * refinances: Full-auto ("auto"), LO-Auth ("approve") or Off. Each task
 * has a highest allowed setting per loan type; the setting the loan
 * officer saved is clamped to it every time it's read, so lowering a
 * maximum also lowers old saved values. A loan can override a task, be
 * paused, or be held (a confirmed escrow or title email changed).
 *
 * In D70 nothing goes out on its own: Full-auto rows are saved and shown,
 * and act like LO-Auth until the autopilot lands (D71).
 */
import { CAP_GROUPS, CAP_WORDS, FACT_WORDS, LOCKED_WORDS, type CapGroup, type FactKey } from "@/lib/content/loa";
import type { Loan } from "@/lib/pipeline/store";
import type { LoaFile, Party, PartyRole } from "./store";

export type Mode = "auto" | "approve" | "off";
export type Purpose = "purchase" | "refi";
export const MODES = ["auto", "approve", "off"] as const;
export const PURPOSES = ["purchase", "refi"] as const;
const RANK: Record<Mode, number> = { off: 0, approve: 1, auto: 2 };
export const lowest = (...m: Mode[]): Mode => m.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), "auto" as Mode);
export const isMode = (x: unknown): x is Mode => x === "auto" || x === "approve" || x === "off";

export const CAP_KEYS = [
  "read_psa", "read_title", "read_approval", "read_fees",
  "escrow_fees", "open_escrow", "order_title", "payoffs", "payoff_auth",
  "insurance", "hoa", "appraisal_transfer", "appraisal_reminder",
  "deadline_reminders", "voe_reminder", "voe_written",
  "borrower_conditions", "third_party_conditions",
  "client_updates", "agent_updates",
  "forms_fill", "forms_send",
] as const;
export type CapKey = (typeof CAP_KEYS)[number];
export const isCapKey = (x: unknown): x is CapKey => (CAP_KEYS as readonly unknown[]).includes(x);

/** What a loan knows, for the per-loan checks. */
export type LoanCtx = { file: LoaFile; purpose: Purpose | null; agentOk: boolean };

export type Cap = {
  key: CapKey;
  label: string;
  help: string;
  group: CapGroup;
  applies: { purchase: boolean; refi: boolean };
  max: { purchase: Mode; refi: Mode };
  def: { purchase: Mode; refi: Mode };
  /** Messages to the borrower or their agent (still only through the contact rules). */
  contact?: boolean;
  /** The facts on the loan this job needs before it can go ahead. */
  facts?: FactKey[];
  /** The officer-level chip, e.g. "Needs escrow's email on each loan". */
  needChip?: string;
  /** Why the highest setting is below Full-auto, per loan type. */
  maxWhy?: { purchase?: string; refi?: string };
  /** A per-loan reason it waits (beyond missing facts), or null. */
  needs?: (ctx: LoanCtx, mode: Mode) => string | null;
  /** False when the job doesn't exist on this loan (no HOA, no agent consent). */
  onlyIf?: (ctx: LoanCtx) => boolean;
};

const both = (m: Mode) => ({ purchase: m, refi: m });
const w = (k: CapKey) => CAP_WORDS[k] as { label: string; help: string; need?: string; max?: string; maxRefi?: string };
const named = (f: LoaFile, role: PartyRole) => !!f.contract?.named?.includes(role);

function cap(key: CapKey, group: CapGroup, applies: Cap["applies"], max: Cap["max"], def: Cap["def"], extra: Partial<Cap> = {}): Cap {
  const x = w(key);
  const maxWhy = x.max ? { purchase: max.purchase === "auto" ? undefined : x.max, refi: max.refi === "auto" ? undefined : x.max } : x.maxRefi ? { refi: x.maxRefi } : undefined;
  return { key, label: x.label, help: x.help, group, applies, max, def, needChip: x.need, maxWhy, ...extra };
}

const P = { purchase: true, refi: false };
const PR = { purchase: true, refi: true };

export const CAPS: Cap[] = [
  cap("read_psa", "reading", P, { purchase: "auto", refi: "off" }, { purchase: "auto", refi: "off" }),
  cap("read_title", "reading", PR, both("auto"), both("auto")),
  cap("read_approval", "reading", PR, both("auto"), both("auto")),
  cap("read_fees", "reading", PR, both("auto"), both("auto")),
  cap("escrow_fees", "escrow_title", PR, both("auto"), both("approve"), { facts: ["escrow_email"] }),
  cap("open_escrow", "escrow_title", PR, { purchase: "auto", refi: "approve" }, both("approve"), {
    facts: ["escrow_company", "escrow_email"],
    needs: (c, m) => (m === "auto" && c.purpose === "purchase" && !named(c.file, "escrow") ? "the contract to name escrow" : null),
  }),
  cap("order_title", "escrow_title", PR, { purchase: "auto", refi: "approve" }, both("approve"), {
    facts: ["title_company", "title_email"],
    needs: (c, m) => (m === "auto" && c.purpose === "purchase" && !named(c.file, "title") ? "the contract to name title" : null),
  }),
  cap("payoffs", "escrow_title", PR, both("auto"), both("approve"), { facts: ["escrow_email"] }),
  cap("payoff_auth", "escrow_title", PR, both("approve"), both("off")),
  cap("insurance", "insurance_hoa", PR, both("auto"), both("approve"), { facts: ["insurance_email", "lender"] }),
  cap("hoa", "insurance_hoa", PR, both("approve"), { purchase: "approve", refi: "off" }, { facts: ["hoa"], onlyIf: (c) => c.file.hoa !== false }),
  cap("appraisal_transfer", "insurance_hoa", PR, both("approve"), both("off")),
  cap("appraisal_reminder", "insurance_hoa", PR, both("approve"), both("approve")),
  cap("deadline_reminders", "deadlines", PR, both("auto"), both("auto")),
  cap("voe_reminder", "deadlines", PR, both("auto"), both("auto")),
  cap("voe_written", "deadlines", PR, both("approve"), both("off")),
  cap("borrower_conditions", "conditions", PR, both("auto"), both("approve"), { contact: true }),
  cap("third_party_conditions", "conditions", PR, both("approve"), both("approve")),
  cap("client_updates", "updates", PR, both("auto"), both("approve"), { contact: true }),
  cap("agent_updates", "updates", PR, both("auto"), both("approve"), {
    contact: true,
    // Without the client's OK on file the job doesn't exist on the loan.
    onlyIf: (c) => c.agentOk,
  }),
  cap("forms_fill", "forms", PR, both("auto"), both("approve")),
  cap("forms_send", "forms", PR, both("approve"), both("approve")),
];

export const capByKey = (k: CapKey): Cap => CAPS.find((c) => c.key === k)!;
export const LOCKED = LOCKED_WORDS;
export const GROUP_ORDER = Object.keys(CAP_GROUPS) as CapGroup[];

/** The officer's saved switches (lib/loa/store.ts LoaAutonomy holds these and more). */
export type Modes = { purchase: Partial<Record<CapKey, Mode>>; refi: Partial<Record<CapKey, Mode>> };
export type SwitchSettings = { modes: Modes; pausedUntil: string | null };

export const loaAutoOn = (env: Record<string, string | undefined> = process.env) => env.CC_LOA_AUTO?.trim() !== "false";

/**
 * The setting that holds for one task on one loan, the lowest of: the loan's
 * own setting (else the officer's, else the default), the task's maximum,
 * "approve" while CC_LOA_AUTO is "false" or the loan is held. "off" when the
 * task doesn't apply to the loan type, or the officer or the loan is paused.
 * With the loan type unknown, the stricter of purchase and refinance.
 */
export function effectiveMode(
  c: Cap,
  purpose: Purpose | null,
  settings: SwitchSettings,
  file: Pick<LoaFile, "autonomy" | "paused" | "hold"> | null,
  now: Date,
  opts: { env?: Record<string, string | undefined>; ignorePause?: boolean } = {},
): Mode {
  if (purpose === null) return lowest(effectiveMode(c, "purchase", settings, file, now, opts), effectiveMode(c, "refi", settings, file, now, opts));
  if (!c.applies[purpose]) return "off";
  if (!opts.ignorePause) {
    if (file?.paused) return "off";
    if (settings.pausedUntil && Date.parse(settings.pausedUntil) > now.getTime()) return "off";
  }
  const saved = file?.autonomy?.[c.key] ?? settings.modes[purpose]?.[c.key] ?? c.def[purpose];
  const caps: Mode[] = [isMode(saved) ? saved : c.def[purpose], c.max[purpose]];
  if (!loaAutoOn(opts.env)) caps.push("approve");
  if (file?.hold) caps.push("approve");
  return lowest(...caps);
}

/** Purchase or refinance, from the loan system's purpose, else a contract on file. */
export function purposeKind(loan: Pick<Loan, "purpose">, file: Pick<LoaFile, "purposeOverride" | "contract"> | null): Purpose | null {
  if (file?.purposeOverride === "purchase" || file?.purposeOverride === "refi") return file.purposeOverride;
  const p = loan.purpose ?? "";
  if (/purch/i.test(p)) return "purchase";
  if (/refi|cash.?out|rate.?(and|&|\/)?.?term|r\/?t|streamline|irrrl/i.test(p)) return "refi";
  if (file?.contract) return "purchase";
  return null;
}

// ---- Facts each job needs ----

/** A safe recipient: an email the loan officer typed or confirmed. */
const confirmed = (p: Party | undefined) => !!p?.email && !!p.confirmedAt;
const party = (f: LoaFile, r: PartyRole) => f.parties.find((p) => p.role === r);

export function factKnown(f: LoaFile, k: FactKey): boolean {
  switch (k) {
    case "escrow_company": return !!party(f, "escrow")?.company;
    case "escrow_email": return confirmed(party(f, "escrow"));
    case "title_company": return !!party(f, "title")?.company;
    case "title_email": return confirmed(party(f, "title"));
    case "insurance_email": return confirmed(party(f, "insurance"));
    case "hoa": return f.hoa === true || f.hoa === false;
    case "lender": return !!party(f, "lender")?.company;
  }
}

export type CapRow = { cap: Cap; applies: boolean; mode: Mode; missing: FactKey[]; need: string | null; waits: boolean };

/** One task on one loan: whether it applies, its setting, and what it still needs. */
export function capRow(c: Cap, ctx: LoanCtx, settings: SwitchSettings, now: Date, env?: Record<string, string | undefined>): CapRow {
  const types = ctx.purpose ? [ctx.purpose] : PURPOSES;
  const applies = types.some((p) => c.applies[p]) && (c.onlyIf?.(ctx) ?? true);
  const mode = applies ? effectiveMode(c, ctx.purpose, settings, ctx.file, now, { env }) : "off";
  const missing = (c.facts ?? []).filter((k) => !factKnown(ctx.file, k));
  const extra = applies ? c.needs?.(ctx, mode) ?? null : null;
  const what = [...missing.map((k) => FACT_WORDS[k].short), ...(extra ? [extra] : [])];
  const need = applies && mode !== "off" && what.length ? what.join(", ") : null;
  return { cap: c, applies, mode, missing: applies && mode !== "off" ? missing : [], need, waits: !!need };
}

export function loanRows(ctx: LoanCtx, settings: SwitchSettings, now: Date, env?: Record<string, string | undefined>): CapRow[] {
  return CAPS.map((c) => capRow(c, ctx, settings, now, env));
}

export type Gap = { key: FactKey; unlocks: Cap[]; auto: boolean };

/** The questions "What the contract didn't answer" asks: each missing fact and the jobs it unlocks (Full-auto first). */
export function gaps(rows: CapRow[]): { auto: Gap[]; other: Gap[] } {
  const by = new Map<FactKey, { auto: Cap[]; other: Cap[] }>();
  for (const r of rows) {
    for (const k of r.missing) {
      const g = by.get(k) ?? { auto: [], other: [] };
      (r.mode === "auto" ? g.auto : g.other).push(r.cap);
      by.set(k, g);
    }
  }
  const auto: Gap[] = [];
  const other: Gap[] = [];
  for (const [key, g] of by) {
    if (g.auto.length) auto.push({ key, unlocks: [...g.auto, ...g.other], auto: true });
    else other.push({ key, unlocks: g.other, auto: false });
  }
  const order = Object.keys(FACT_WORDS) as FactKey[];
  const sort = (a: Gap, b: Gap) => order.indexOf(a.key) - order.indexOf(b.key);
  return { auto: auto.sort(sort), other: other.sort(sort) };
}

// ---- Presets and saving ----

export type Preset = "recommended" | "ask" | "off";
export const PRESETS: Preset[] = ["recommended", "ask", "off"];

export function presetModes(p: Preset): Modes {
  const out: Modes = { purchase: {}, refi: {} };
  for (const c of CAPS) {
    for (const t of PURPOSES) {
      if (!c.applies[t]) continue;
      out[t][c.key] = p === "recommended" ? c.def[t] : p === "ask" ? lowest("approve", c.max[t]) : "off";
    }
  }
  return out;
}

/** Cleans what a form sent: known tasks and modes only, each clamped to its maximum. */
export function cleanModes(input: Partial<Record<Purpose, Record<string, unknown>>>): Modes {
  const out: Modes = { purchase: {}, refi: {} };
  for (const t of PURPOSES) {
    for (const [k, v] of Object.entries(input[t] ?? {})) {
      if (!isCapKey(k) || !isMode(v)) continue;
      const c = capByKey(k);
      if (!c.applies[t]) continue;
      out[t][k] = lowest(v, c.max[t]);
    }
  }
  return out;
}

/** The setting each task shows on the officer's grid (saved, else the default, clamped). */
export function officerMode(c: Cap, t: Purpose, modes: Modes): Mode {
  const v = modes[t]?.[c.key];
  return lowest(isMode(v) ? v : c.def[t], c.max[t]);
}

/** Which "purpose.cap" keys differ between two saved sets (the audit records keys only). */
export function changedKeys(before: Modes, after: Modes): string[] {
  const out: string[] = [];
  for (const t of PURPOSES) for (const c of CAPS) if (c.applies[t] && officerMode(c, t, before) !== officerMode(c, t, after)) out.push(`${t}.${c.key}`);
  return out;
}

/** Who may change the switches: the loan officer whose book it is (not an assistant). */
export function canChangeSwitches(user: { id: string; role: string; status: string }, ownerUserId: string): boolean {
  return user.status === "active" && user.role !== "assistant" && user.id === ownerUserId;
}
