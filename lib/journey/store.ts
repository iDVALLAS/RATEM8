/**
 * lib/journey/store.ts — each loan's journey (D17) and document checklist
 * (D18). SERVER-ONLY. Neon when DATABASE_URL is set, memory otherwise.
 * Holds step status, the dates the federal clocks need, the lock decision,
 * and document names: never the documents themselves (those live in the
 * loan system's borrower portal).
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export type StepState = { status: "todo" | "done" | "na"; at: string; by: string; note?: string; auto?: boolean };
export type DocItem = { id: string; name: string; why: string; phase: "initial" | "final"; status: "needed" | "requested" | "received" | "reviewed" | "waived"; at: string };
export type Journey = {
  loanId: string;
  ownerUserId: string;
  steps: Record<string, StepState>;
  dates: { leSentOn: string | null; intentToProceedOn: string | null; cdSentOn: string | null; signingOn: string | null; voeOn: string | null };
  lock: { decision: "lock" | "float"; by: string; at: string } | null;
  docs: DocItem[];
  /** D19: who handles the processor steps (an account that works this loan officer's book). */
  processorUserId?: string | null;
  updatedAt: string;
};

export const emptyJourney = (loanId: string, ownerUserId: string): Journey => ({ loanId, ownerUserId, steps: {}, dates: { leSentOn: null, intentToProceedOn: null, cdSentOn: null, signingOn: null, voeOn: null }, lock: null, docs: [], updatedAt: "" });

export interface JourneyStore {
  get(loanId: string): Promise<Journey | null>;
  put(j: Journey): Promise<void>;
}

export class MemoryJourneyStore implements JourneyStore {
  private m = new Map<string, Journey>();
  async get(id: string) {
    const j = this.m.get(id);
    return j ? structuredClone(j) : null;
  }
  async put(j: Journey) {
    this.m.set(j.loanId, structuredClone(j));
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

export class NeonJourneyStore implements JourneyStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = this.q(`CREATE TABLE IF NOT EXISTS cc_journeys (loan_id text PRIMARY KEY, owner_user_id text NOT NULL, body jsonb NOT NULL)`).then(() => undefined).catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  async get(id: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_journeys WHERE loan_id = $1`, [id]);
    return r[0] ? ((typeof r[0].body === "string" ? JSON.parse(r[0].body) : r[0].body) as Journey) : null;
  }
  async put(j: Journey) {
    await this.init();
    await this.q(`INSERT INTO cc_journeys (loan_id, owner_user_id, body) VALUES ($1, $2, $3) ON CONFLICT (loan_id) DO UPDATE SET body = EXCLUDED.body`, [j.loanId, j.ownerUserId, JSON.stringify(j)]);
  }
}

let override: JourneyStore | null = null;
let neonStore: NeonJourneyStore | null = null;
const g = globalThis as unknown as { __lm8JourneyMemory?: MemoryJourneyStore };
const memory = (g.__lm8JourneyMemory ??= new MemoryJourneyStore());

export function setJourneyStoreForTests(s: JourneyStore | null) {
  override = s;
}

export function journeyStore(): JourneyStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonJourneyStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
