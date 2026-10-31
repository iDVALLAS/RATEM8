/**
 * lib/quotes/store.ts — personal estimate requests as write-once events.
 *
 * quotes/{id}/{seq}-{type}.json. The current state is the fold of the
 * events, so every request carries its own audit trail: requested →
 * priced → approved (and sent) or rejected. Nothing reaches a borrower or
 * an AI assistant until an `approved` event exists, written by a licensed
 * loan officer through /mlo/quotes.
 *
 * The borrower's email sits only in the `requested` event and is never
 * logged, never put in the loan officer's alert, and shown masked in the
 * queue. The estimate link carries a key derived from the quote id and a
 * server secret (lib/quotes/service.ts), so no key is stored at all.
 */
import { randomBytes } from "node:crypto";
import { getJson, getRecords, putJson, type RecordStore } from "@/lib/records";
import type { StateCode } from "@/lib/config";
import type { PricingRun, RunInputs } from "@/lib/pricing/types";
import type { Nearest } from "./nearest";
import type { QuoteScenario } from "./scenario";

export type QuoteSource = "m8" | "agent";

export type RequestedEvent = {
  type: "requested";
  at: string;
  id: string;
  source: QuoteSource;
  scenario: QuoteScenario;
  state: StateCode;
  /** The loan officer who must price and approve (licensed in `state`). */
  mloId: string;
  email: string;
  emailConsent: true;
  nearest: Nearest;
  /** Optional free-text tag an AI assistant sends (X-Agent-Origin). */
  agentOrigin?: string;
};

export type PricedEvent = {
  type: "priced";
  at: string;
  by: string;
  /** "assistant" once L4b sends results; "manual" when the loan officer enters them. */
  via: "manual" | "assistant";
  run: PricingRun;
  inputs: RunInputs;
  /** label → lender key (server only). */
  mapping: Record<string, string>;
  sourceSha256: string;
};

export type ApprovedEvent = { type: "approved"; at: string; by: string; mloId: string; note: string };
export type RejectedEvent = { type: "rejected"; at: string; by: string; reason: string };
export type SentEvent = { type: "sent"; at: string; ok: boolean; detail: string };

export type QuoteEvent = RequestedEvent | PricedEvent | ApprovedEvent | RejectedEvent | SentEvent;

export type QuoteStatus = "requested" | "priced" | "approved" | "rejected";

export type Quote = {
  id: string;
  status: QuoteStatus;
  requested: RequestedEvent;
  priced: PricedEvent | null;
  approved: ApprovedEvent | null;
  rejected: RejectedEvent | null;
  sent: SentEvent | null;
  events: QuoteEvent[];
};

const ID = /^Q-[A-Z2-9]{6}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newQuoteId(): string {
  const b = randomBytes(6);
  return `Q-${Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("")}`;
}

export function isQuoteId(id: string): boolean {
  return ID.test(id);
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "(hidden)";
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}

export function fold(events: QuoteEvent[]): Quote | null {
  const requested = events.find((e): e is RequestedEvent => e.type === "requested");
  if (!requested) return null;
  const last = <T extends QuoteEvent["type"]>(t: T) => [...events].reverse().find((e) => e.type === t) as Extract<QuoteEvent, { type: T }> | undefined;
  const approved = last("approved") ?? null;
  const rejected = last("rejected") ?? null;
  const priced = last("priced") ?? null;
  const status: QuoteStatus = approved ? "approved" : rejected ? "rejected" : priced ? "priced" : "requested";
  return { id: requested.id, status, requested, priced, approved, rejected, sent: last("sent") ?? null, events };
}

export async function appendEvent(id: string, e: QuoteEvent, store: RecordStore = getRecords()): Promise<void> {
  if (!isQuoteId(id)) throw new Error("bad quote id");
  if (!store.writable) throw new Error(store.reason ?? "Storage is read-only.");
  const n = (await store.list(`quotes/${id}/`)).length;
  await putJson(store, `quotes/${id}/${String(n + 1).padStart(4, "0")}-${e.type}.json`, e);
}

export async function loadQuote(id: string, store: RecordStore = getRecords()): Promise<Quote | null> {
  if (!isQuoteId(id)) return null;
  const keys = await store.list(`quotes/${id}/`);
  const events = (await Promise.all(keys.map((k) => getJson<QuoteEvent>(store, k)))).filter((e): e is QuoteEvent => e !== null);
  return fold(events);
}

/** Every quote, newest first. */
export async function listQuotes(store: RecordStore = getRecords()): Promise<Quote[]> {
  const keys = await store.list("quotes/");
  const ids = Array.from(new Set(keys.map((k) => k.split("/")[1]).filter(isQuoteId)));
  const qs = (await Promise.all(ids.map((id) => loadQuote(id, store)))).filter((q): q is Quote => q !== null);
  return qs.sort((a, b) => b.requested.at.localeCompare(a.requested.at));
}
