/**
 * lib/leads/plan-store.ts — D86: each loan officer's saved lead plan. SERVER-ONLY.
 * Neon (`cc_lead_plans`, one row per loan officer, the plan as jsonb) when DATABASE_URL is set, in memory otherwise;
 * the same code reads and writes both. Private, like all spend: only its owner reads or changes it.
 *
 * Saving again replaces the plan; the version it replaces goes into the plan's own `history` (newest first, the
 * last PLAN_HISTORY kept), so nothing the loan officer saved is lost and Download everything carries all of it.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { LeftOut, PlanLine } from "./plan";

/** How many earlier versions a plan keeps. */
export const PLAN_HISTORY = 20;

export type PlanVersion = {
  savedAt: string;
  startedAt: string;
  budgetCents: number;
  targetCents: number;
  lines: PlanLine[];
  leftOut: LeftOut[];
  /** What made this version: the loan officer saved it, approved a Business Manager move, or approved a check-in. */
  why: "saved" | "approved" | "checkin";
};

export type LeadPlan = PlanVersion & {
  ownerUserId: string;
  /** Sources paused through an approved Business Manager move (left out of the split until `until`). */
  paused: { key: string; label: string; until: string | null }[];
  /** A check-in's proposed split, waiting for Approve (the move it belongs to). */
  pending: { moveId: string; day: number; budgetCents: number; lines: PlanLine[]; leftOut: LeftOut[] } | null;
  history: PlanVersion[];
};

export interface PlanStore {
  get(owner: string): Promise<LeadPlan | null>;
  put(p: LeadPlan): Promise<void>;
  /** Loan officers with a saved plan (the morning run moves their roadmap along). */
  owners(): Promise<string[]>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export class MemoryPlanStore implements PlanStore {
  private m = new Map<string, LeadPlan>();
  async get(owner: string) {
    const p = this.m.get(owner);
    return p ? clone(p) : null;
  }
  async put(p: LeadPlan) {
    this.m.set(p.ownerUserId, clone(p));
  }
  async owners() {
    return [...this.m.keys()];
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

export class NeonPlanStore implements PlanStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = this.q(`CREATE TABLE IF NOT EXISTS cc_lead_plans (owner_user_id text PRIMARY KEY, started_at text NOT NULL, saved_at text NOT NULL, data jsonb NOT NULL)`)
        .then(() => undefined)
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }
  async get(owner: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_lead_plans WHERE owner_user_id = $1`, [owner]);
    if (!r[0]) return null;
    const d = r[0].data;
    return (typeof d === "string" ? JSON.parse(d) : d) as LeadPlan;
  }
  async put(p: LeadPlan) {
    await this.init();
    await this.q(`INSERT INTO cc_lead_plans (owner_user_id, started_at, saved_at, data) VALUES ($1,$2,$3,$4) ON CONFLICT (owner_user_id) DO UPDATE SET started_at = EXCLUDED.started_at, saved_at = EXCLUDED.saved_at, data = EXCLUDED.data`, [p.ownerUserId, p.startedAt, p.savedAt, JSON.stringify(p)]);
  }
  async owners() {
    await this.init();
    return (await this.q(`SELECT owner_user_id FROM cc_lead_plans LIMIT 1000`)).map((x) => x.owner_user_id as string);
  }
}

let override: PlanStore | null = null;
let neonStore: NeonPlanStore | null = null;
const g = globalThis as unknown as { __lm8PlanMemory?: MemoryPlanStore };
const memory = (g.__lm8PlanMemory ??= new MemoryPlanStore());

export function setPlanStoreForTests(s: PlanStore | null) {
  override = s;
}

export function planStore(): PlanStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonPlanStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
