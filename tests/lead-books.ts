/**
 * tests/lead-books.ts — D87: seeded random lead books (events, spend, loans) for the scorecard, planner and red-team
 * sweeps. Same seed, same book, every run. Test code only.
 */
import type { ScoreEvent, ScoreLoan, ScoreSpend } from "@/lib/leads/scorecard";
import { NOW } from "./lead-ask-harness";

/** A small seeded random number generator, so every run sweeps the same books. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SOURCES = [
  ["zillow", "Zillow"],
  ["lendingtree", "LendingTree"],
  ["bankrate", "Bankrate"],
  ["web-form", "Your web form"],
  ["past-clients-sphere", "Past clients & sphere"],
  ["google-ads", "Google Ads"],
  ["meta", "Meta"],
] as const;

export function randomBook(seed: number): { events: ScoreEvent[]; spend: ScoreSpend[]; loans: ScoreLoan[] } {
  const r = rng(seed);
  const DAY = 86_400_000;
  const at = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
  const events: ScoreEvent[] = [];
  const spend: ScoreSpend[] = [];
  const loans: ScoreLoan[] = [];
  for (const [key, label] of SOURCES) {
    if (r() < 0.25) continue;
    const n = Math.floor(r() * 40);
    const named = r();
    for (let i = 0; i < n; i++) events.push({ contactId: `${key}-${seed}-${i}`, sourceKey: key, sourceLabel: label, at: at(Math.floor(r() * 400)), duplicate: r() < 0.1, namesYou: r() < named, datedBy: r() < 0.05 ? "none" : "delivery" });
    for (let i = Math.floor(r() * 4); i > 0; i--) spend.push({ date: at(Math.floor(r() * 300)).slice(0, 10), amountCents: Math.floor(r() * 400_000), businessPct: [100, 50, 0, 120, Number.NaN][Math.floor(r() * 5)], leadSource: key, status: r() < 0.85 ? "confirmed" : "draft", kind: "expense" });
    for (let i = 0; i < n; i++) {
      if (r() > 0.12) continue;
      const started = Math.floor(r() * 300);
      const closed = r() < 0.6;
      loans.push({ id: `l-${key}-${seed}-${i}`, contactId: `${key}-${seed}-${i}`, closed, dead: !closed && r() < 0.2, milestoneAt: at(Math.max(0, started - 30)), keyDates: { application: r() < 0.8 ? at(started).slice(0, 10) : null }, history: [{ at: at(started) }] });
    }
  }
  return { events, spend, loans };
}

