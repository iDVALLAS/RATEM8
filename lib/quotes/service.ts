/**
 * lib/quotes/service.ts — the personal estimate lifecycle (v37, L4).
 *
 *   createQuote  (M8 quote mode or an AI assistant) → requested
 *   priceQuote   (/mlo/quotes, or L4b's assistant later) → priced
 *   approveQuote (a loan officer licensed in the property's state) → approved, emailed
 *   rejectQuote  → rejected
 *
 * Numbers come only from buildPricingRun (APR, payments, the three
 * neutral options); nothing here estimates or adjusts a rate.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { CONFIG, licenseIn, mloById, mlosServing, STATE_NAMES_LINE, type Mlo, type StateCode } from "@/lib/config";
import { ESTIMATE_DISCLAIMER, quotesCopy } from "@/lib/content/quotes";
import { buildPricingRun } from "@/lib/pricing/build";
import { pacificLabel } from "@/lib/pricing/posted-rate";
import { lenderErrors, SOURCE_MAX_BYTES, SOURCE_TYPES } from "@/lib/pricing/publish";
import { getStore } from "@/lib/pricing/store";
import { tenantForState } from "@/lib/pricing/tenants";
import type { BandedScenario, QuoteInput } from "@/lib/pricing/types";
import { getRecords, type RecordStore } from "@/lib/records";
import { absoluteUrl } from "@/lib/site";
import { sendEmail } from "./email";
import { nearestScenario, type Nearest } from "./nearest";
import { LABELS, loanAmount, QuoteScenarioSchema, scenarioLine, stateForZip, type QuoteScenario } from "./scenario";
import { appendEvent, isQuoteId, loadQuote, newQuoteId, type Quote, type QuoteSource } from "./store";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// ── Estimate link key ────────────────────────────────────────────────

function linkSecret(): string | null {
  const s = process.env.QUOTE_LINK_SECRET;
  if (s && s.length >= 16) return s;
  return process.env.VERCEL ? null : "local-dev-only-quote-link-secret";
}

export function estimateKey(id: string): string | null {
  const s = linkSecret();
  return s ? createHmac("sha256", s).update(`estimate:${id}`).digest("base64url").slice(0, 32) : null;
}

export function keyValid(id: string, key: string | undefined): boolean {
  const want = estimateKey(id);
  if (!want || !key || key.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(key));
}

/** Previews link to their own deployment; their records are separate from production's. */
function baseUrl(path: string): string {
  const preview = process.env.VERCEL_ENV === "preview" && (process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL);
  return preview ? `https://${preview}${path}` : absoluteUrl(path);
}

export function estimateUrl(id: string): string | null {
  const k = estimateKey(id);
  return k ? baseUrl(`/estimate/${id}?k=${k}`) : null;
}

/** Ready to take requests here? Returns the reason when not. */
export function quotesReady(store: RecordStore = getRecords()): { ok: true } | { ok: false; reason: string } {
  if (!CONFIG.pricing.personalQuotes) return { ok: false, reason: "off" };
  if (!store.writable) return { ok: false, reason: "storage" };
  if (!linkSecret()) return { ok: false, reason: "secret" };
  return { ok: true };
}

// ── Who prices and approves ──────────────────────────────────────────

/** The loan officer a request goes to: the borrower's choice if licensed there, else the state's assignment. */
export function mloForState(state: StateCode, preferredMloId?: string | null): Mlo | undefined {
  const pref = mloById(preferredMloId);
  if (pref && licenseIn(pref, state)) return pref;
  const assigned = mloById((CONFIG.routing.stateAssignments as Partial<Record<StateCode, string>>)[state]);
  if (assigned && licenseIn(assigned, state)) return assigned;
  return mlosServing(state)[0];
}

/** The MLO the admin login acts as (until L5 gives each loan officer an account). */
export function adminMlo(): Mlo | undefined {
  return mloById(process.env.MLO_ADMIN_MLO_ID ?? CONFIG.routing.operatorMloId);
}

// ── Create ───────────────────────────────────────────────────────────

export type CreateInput = {
  scenario: unknown;
  email: unknown;
  emailConsent: unknown;
  source: QuoteSource;
  preferredMloId?: string | null;
  agentOrigin?: string | null;
};

export type CreateResult =
  | { ok: true; id: string; url: string; nearest: Nearest; state: StateCode; mlo: { id: string; firstName: string } }
  | { ok: false; status: number; error: string; issues?: string[] };

export async function createQuote(input: CreateInput, store: RecordStore = getRecords(), now = new Date()): Promise<CreateResult> {
  const ready = quotesReady(store);
  if (!ready.ok) return { ok: false, status: ready.reason === "off" ? 404 : 503, error: ready.reason === "off" ? quotesCopy.flow.off : "Personal estimates aren't available on this deployment yet." };
  const parsed = QuoteScenarioSchema.safeParse(input.scenario);
  if (!parsed.success) return { ok: false, status: 400, error: "Check the scenario.", issues: parsed.error.issues.map((i) => `${i.path.join(".") || "scenario"}: ${i.message}`) };
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email || email.length > 254 || !EMAIL.test(email)) return { ok: false, status: 400, error: quotesCopy.flow.badEmail };
  if (input.emailConsent !== true) return { ok: false, status: 400, error: quotesCopy.flow.needConsent };
  const state = stateForZip(parsed.data.zip);
  if (!state) return { ok: false, status: 422, error: fill(quotesCopy.flow.unlicensed, { states: STATE_NAMES_LINE }) };
  const mlo = mloForState(state, input.preferredMloId);
  if (!mlo) return { ok: false, status: 422, error: fill(quotesCopy.flow.unlicensed, { states: STATE_NAMES_LINE }) };

  const id = newQuoteId();
  const url = estimateUrl(id)!;
  const nearest = nearestScenario(parsed.data);
  await appendEvent(id, {
    type: "requested", at: now.toISOString(), id, source: input.source, scenario: parsed.data, state, mloId: mlo.id,
    email, emailConsent: true, nearest,
    ...(input.agentOrigin ? { agentOrigin: input.agentOrigin.slice(0, 80) } : {}),
  }, store);

  const line = scenarioLine(parsed.data);
  const alertTo = CONFIG.pricing.quoteAlertEmail;
  await Promise.all([
    alertTo ? sendEmail({ to: alertTo, subject: fill(quotesCopy.email.alertSubject, { id }), text: fill(quotesCopy.email.alertBody, { line, url: baseUrl(`/mlo/quotes?q=${id}`) }) }) : null,
    sendEmail({ to: email, subject: fill(quotesCopy.email.receivedSubject, { id }), text: fill(quotesCopy.email.receivedBody, { line, url }) }),
  ]);
  return { ok: true, id, url, nearest, state, mlo: { id: mlo.id, firstName: mlo.firstName } };
}

// ── Price ────────────────────────────────────────────────────────────

/** The quote as a scenario the pricing pipeline understands. */
export function bandedFor(q: Quote): BandedScenario {
  const s: QuoteScenario = q.requested.scenario;
  const loan = loanAmount(s);
  const fees = CONFIG.pricing.fees;
  return {
    id: q.id,
    title: `${LABELS.purpose[s.purpose]} · ${LABELS.loanType[s.loanType]}`,
    state: q.requested.state,
    location: `ZIP ${s.zip}`,
    purpose: s.purpose === "purchase" ? "purchase" : s.purpose === "cashout" ? "cash_out_refi" : "rate_term_refi",
    occupancy: s.occupancy,
    propertyType: s.propertyType,
    propertyValue: s.price,
    loanAmount: loan,
    ficoBand: LABELS.creditBand[s.creditBand],
    product: s.term === "15" ? "15yr_fixed" : "30yr_fixed",
    termMonths: s.term === "15" ? 180 : 360,
    program: s.loanType === "fha" || s.loanType === "va" ? s.loanType : "conventional",
    zip: s.zip,
    lockDays: 30,
    assumptions: [
      scenarioLine(s) + ".",
      `Loan amount ${usd(loan)} (${Math.round((loan / s.price) * 1000) / 10}% of the ${s.purpose === "purchase" ? "price" : "home's value"}).`,
      "30-day rate lock.",
      `APR includes discount points and LoanM8's lender fees (underwriting ${usd(fees.underwriting)}, processing ${usd(fees.processing)}). It excludes prepaid interest, escrow, mortgage insurance, any FHA or VA upfront fee, and third-party fees.`,
      "Based on the credit range and figures you gave, not a credit report or verified income.",
    ],
  };
}

export type PriceInput = { id: string; quotes: QuoteInput[]; source: { bytes: Uint8Array; mime: string } | null; actor: string; via?: "manual" | "assistant"; now?: Date };

export async function priceQuote(req: PriceInput, store: RecordStore = getRecords()): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const q = await loadQuote(req.id, store);
  if (!q) return { ok: false, errors: ["Unknown quote."] };
  if (q.status === "approved" || q.status === "rejected") return { ok: false, errors: [`This quote is already ${q.status}.`] };
  const tenant = tenantForState(q.requested.state);
  if (!tenant) return { ok: false, errors: ["No sponsoring brokerage prices this state."] };
  const errors: string[] = [];
  if (!req.source) errors.push("Attach the pricing screenshot or PDF.");
  else {
    if (!SOURCE_TYPES.includes(req.source.mime)) errors.push("Source must be a PNG, JPEG or PDF.");
    if (req.source.bytes.length > SOURCE_MAX_BYTES) errors.push("Source file is larger than 5 MB.");
  }
  if (req.quotes.length === 0) errors.push("Enter at least one lender result.");
  errors.push(...(await lenderErrors(tenant.id, req.quotes)));
  if (errors.length) return { ok: false, errors };
  const pricedAt = (req.now ?? new Date()).toISOString();
  const inputs = { runId: `quote-${q.id}-${pricedAt}`, tenantId: tenant.id, provider: "manual" as const, mode: "snapshot" as const, scenario: bandedFor(q), pricedAt, quotes: req.quotes };
  let built;
  try {
    built = buildPricingRun(inputs);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  const sourceSha256 = await getStore().putSource(req.source!.bytes, req.source!.mime, req.actor, tenant.id);
  await appendEvent(q.id, { type: "priced", at: pricedAt, by: req.actor, via: req.via ?? "manual", run: built.run, inputs, mapping: built.mapping, sourceSha256 }, store);
  return { ok: true };
}

// ── Approve / reject ─────────────────────────────────────────────────

export function approvalBlocker(q: Quote, approver: Mlo | undefined): string | null {
  if (q.status !== "priced") return q.status === "requested" ? "Price it first." : `Already ${q.status}.`;
  if (!approver) return "Set MLO_ADMIN_MLO_ID to the loan officer this login belongs to.";
  if (!licenseIn(approver, q.requested.state)) {
    const who = mloById(q.requested.mloId);
    return `Only a loan officer licensed in ${q.requested.state} can approve this${who ? ` (${who.name})` : ""}. Per-officer logins arrive with accounts (L5).`;
  }
  if (!q.priced?.run.selection.lowestRate) return "No eligible lender result to show.";
  return null;
}

export function disclaimerFor(q: Quote): string | null {
  const m = mloById(q.approved?.mloId);
  if (!q.approved || !m) return null;
  return fill(ESTIMATE_DISCLAIMER, { name: m.name, nmls: m.nmls, when: pacificLabel(q.approved.at, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) });
}

export async function approveQuote(id: string, actor: string, note: string, store: RecordStore = getRecords(), now = new Date()): Promise<{ ok: true; emailed: boolean } | { ok: false; errors: string[] }> {
  const q = await loadQuote(id, store);
  if (!q) return { ok: false, errors: ["Unknown quote."] };
  const approver = adminMlo();
  const block = approvalBlocker(q, approver);
  if (block) return { ok: false, errors: [block] };
  const clean = note.trim().slice(0, 600);
  await appendEvent(id, { type: "approved", at: now.toISOString(), by: actor, mloId: approver!.id, note: clean }, store);
  const done = (await loadQuote(id, store))!;
  const sent = await sendEmail({
    to: done.requested.email,
    subject: fill(quotesCopy.email.readySubject, { id }),
    text: fill(quotesCopy.email.readyBody, { line: scenarioLine(done.requested.scenario), url: estimateUrl(id) ?? "", disclaimer: disclaimerFor(done) ?? "" }),
  });
  await appendEvent(id, { type: "sent", at: new Date().toISOString(), ok: sent.ok, detail: sent.detail }, store);
  return { ok: true, emailed: sent.ok };
}

export async function rejectQuote(id: string, actor: string, reason: string, store: RecordStore = getRecords(), now = new Date()): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  if (!isQuoteId(id)) return { ok: false, errors: ["Unknown quote."] };
  const q = await loadQuote(id, store);
  if (!q) return { ok: false, errors: ["Unknown quote."] };
  if (q.status === "approved" || q.status === "rejected") return { ok: false, errors: [`Already ${q.status}.`] };
  if (!reason.trim()) return { ok: false, errors: ["Give a short reason (kept internal)."] };
  await appendEvent(id, { type: "rejected", at: now.toISOString(), by: actor, reason: reason.trim().slice(0, 600) }, store);
  return { ok: true };
}
