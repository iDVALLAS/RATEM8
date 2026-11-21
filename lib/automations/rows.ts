/**
 * lib/automations/rows.ts — the Automations page's rows (D76). Pure.
 *
 * Each automation is one row with the D70 three-way switch:
 *  - Off: not drafted at all (the recipe is off);
 *  - LO-Auth: drafted to the Concierge desk for the loan officer's OK;
 *  - Full-auto: only borrower and agent updates, and it's the same switch
 *    as the LOA's "Status updates to the client" / "...buyer's agent"
 *    (lib/loa/service.ts autonomyOf/syncAutomations). Every other row asks.
 */
import type { Mode } from "@/lib/loa/autonomy";
import { CAP_WORDS } from "@/lib/content/loa";
import { RECIPES, recipeById, STAGE_LABELS, type Recipe } from "./recipes";

export type SharedCap = "client_updates" | "agent_updates";
export const SHARED_OF: Partial<Record<Recipe["group"], SharedCap>> = { borrower_updates: "client_updates", agent_updates: "agent_updates" };

/** When a recipe runs, in a few words. */
export function whenOf(r: Recipe): string {
  const t = r.trigger;
  if (t.kind === "stage") return `When the loan reaches “${STAGE_LABELS[t.stage]}”`;
  if (t.kind === "closed_days") return t.days % 30 === 0 && t.days >= 60 ? `${t.days / 30} months after closing` : `${t.days} days after closing`;
  return "When someone new is added";
}

/** What each row shows: off when the recipe is off, else the shared LOA setting (or LO-Auth). */
export function rowMode(r: Recipe, enabled: string[], shared: Partial<Record<SharedCap, Mode>>): Mode {
  if (!enabled.includes(r.id)) return "off";
  const cap = SHARED_OF[r.group];
  return cap && shared[cap] === "auto" ? "auto" : "approve";
}

/**
 * Reads the saved form: which recipes are on, and the one setting each
 * shared group asked for (the strongest any of its rows chose, since the
 * page keeps them in step).
 */
export function readRows(get: (id: string) => unknown): { enabled: string[]; shared: Partial<Record<SharedCap, "auto" | "approve">> } {
  const enabled: string[] = [];
  const shared: Partial<Record<SharedCap, "auto" | "approve">> = {};
  for (const r of RECIPES) {
    const v = get(r.id);
    const m: Mode = v === "auto" || v === "approve" ? v : v === "on" ? "approve" : "off";
    if (m === "off") continue;
    enabled.push(r.id);
    const cap = SHARED_OF[r.group];
    if (cap) shared[cap] = m === "auto" || shared[cap] === "auto" ? "auto" : "approve";
  }
  return { enabled, shared };
}

/** "3 of 8 on" for a group. */
export function groupCount(group: Recipe["group"], enabled: string[]): { on: number; all: number } {
  const rs = RECIPES.filter((r) => r.group === group);
  return { on: rs.filter((r) => enabled.includes(r.id)).length, all: rs.length };
}

/** "Recently fired": what ran, in words (an LOA job shows as the LOA's own row). */
export function firedLabel(recipeId: string): string {
  const r = recipeById(recipeId);
  if (r) return r.label;
  const cap = recipeId.startsWith("loa.") ? recipeId.slice(4) : null;
  if (cap && cap in CAP_WORDS) return `Your LOA: ${CAP_WORDS[cap as keyof typeof CAP_WORDS].label}`;
  return "An automation";
}

const OUTCOME: Record<string, string> = {
  drafted: "draft on your desk",
  auto: "done on its own (Full-auto)",
  approve: "ready for your OK (LO-Auth)",
  send: "sent by your LOA",
  loa: "handled by your LOA",
  off: "skipped: switched off",
  "loa-off": "skipped: switched off",
};
/** What happened, in words. */
export const firedOutcome = (o: string) => OUTCOME[o] ?? "reminder set";
