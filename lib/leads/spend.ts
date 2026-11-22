/**
 * lib/leads/spend.ts — D83: a monthly amount per lead source. SERVER-ONLY.
 * Neon (`cc_lead_monthly`) when DATABASE_URL is set, in memory otherwise.
 *
 * On Lead sources the loan officer can say "Zillow, $1,200 a month". Each
 * month that makes one draft expense, tagged with the source, in the drafts
 * on Expenses ("To confirm"). Nothing posts on its own: a draft counts only
 * once the loan officer confirms it, as with every draft. One draft per
 * source per month, made by the morning run or the loan officer's next visit
 * to Lead sources or Expenses; a draft they delete isn't made again.
 *
 * Private, like all spend: only its owner reads or changes it (assistants
 * never see spend).
 */
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { User } from "@/lib/accounts/store";
import { expenseStore, type Entry } from "@/lib/expenses/store";
import { sourceKey, sourceLabel } from "./source-key";

export type MonthlyAmount = {
  ownerUserId: string;
  sourceKey: string;
  /** As the loan officer named it, for a key that isn't one of the named sources. */
  sourceLabel: string;
  cents: number;
  /** The last month ("YYYY-MM") a draft was made for (null before the first). */
  lastMonth: string | null;
  updatedAt: string;
};

export interface MonthlyStore {
  list(owner: string): Promise<MonthlyAmount[]>;
  put(m: MonthlyAmount): Promise<void>;
  remove(owner: string, key: string): Promise<void>;
  /** Owners with at least one monthly amount (the morning run makes their drafts). */
  owners(): Promise<string[]>;
}

export class MemoryMonthlyStore implements MonthlyStore {
  private m = new Map<string, MonthlyAmount>();
  async list(owner: string) {
    return [...this.m.values()].filter((x) => x.ownerUserId === owner).map((x) => ({ ...x })).sort((a, b) => b.cents - a.cents || a.sourceKey.localeCompare(b.sourceKey));
  }
  async put(x: MonthlyAmount) {
    this.m.set(`${x.ownerUserId}\n${x.sourceKey}`, { ...x });
  }
  async remove(owner: string, key: string) {
    this.m.delete(`${owner}\n${key}`);
  }
  async owners() {
    return [...new Set([...this.m.values()].map((x) => x.ownerUserId))];
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

export class NeonMonthlyStore implements MonthlyStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = this.q(`CREATE TABLE IF NOT EXISTS cc_lead_monthly (owner_user_id text NOT NULL, source_key text NOT NULL, source_label text NOT NULL, cents integer NOT NULL, last_month text, updated_at timestamptz NOT NULL, PRIMARY KEY (owner_user_id, source_key))`)
        .then(() => undefined)
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }
  async list(owner: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_lead_monthly WHERE owner_user_id = $1 ORDER BY cents DESC, source_key`, [owner]);
    return r.map((x) => ({ ownerUserId: owner, sourceKey: x.source_key as string, sourceLabel: x.source_label as string, cents: Number(x.cents), lastMonth: (x.last_month as string | null) ?? null, updatedAt: new Date(x.updated_at as string).toISOString() }));
  }
  async put(m: MonthlyAmount) {
    await this.init();
    await this.q(`INSERT INTO cc_lead_monthly (owner_user_id, source_key, source_label, cents, last_month, updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (owner_user_id, source_key) DO UPDATE SET source_label = EXCLUDED.source_label, cents = EXCLUDED.cents, last_month = EXCLUDED.last_month, updated_at = EXCLUDED.updated_at`, [m.ownerUserId, m.sourceKey, m.sourceLabel, m.cents, m.lastMonth, m.updatedAt]);
  }
  async remove(owner: string, key: string) {
    await this.init();
    await this.q(`DELETE FROM cc_lead_monthly WHERE owner_user_id = $1 AND source_key = $2`, [owner, key]);
  }
  async owners() {
    await this.init();
    return (await this.q(`SELECT DISTINCT owner_user_id FROM cc_lead_monthly LIMIT 1000`)).map((x) => x.owner_user_id as string);
  }
}

let override: MonthlyStore | null = null;
let neonStore: NeonMonthlyStore | null = null;
const g = globalThis as unknown as { __lm8MonthlyMemory?: MemoryMonthlyStore };
const memory = (g.__lm8MonthlyMemory ??= new MemoryMonthlyStore());

export function setMonthlyStoreForTests(s: MonthlyStore | null) {
  override = s;
}

export function monthlyStore(): MonthlyStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonMonthlyStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}

/** The month on the West Coast ("YYYY-MM"), like the rest of the books. */
export const pacificMonth = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);

export const MAX_MONTHLY_CENTS = 100_000_00;

export type MonthlyResult = { ok: true; key: string; label: string; drafts: number } | { ok: false; error: "source" | "amount" | "assistant" };

/** Sets (or changes) a source's monthly amount, then makes this month's draft if it isn't made yet. */
export async function setMonthly(user: User, rawSource: string, dollars: number, now = new Date()): Promise<MonthlyResult> {
  if (user.role === "assistant") return { ok: false, error: "assistant" };
  const name = rawSource.replace(/\s+/g, " ").trim().slice(0, 60);
  const key = sourceKey(name);
  if (!key) return { ok: false, error: "source" };
  const cents = Math.round(dollars * 100);
  if (!Number.isFinite(cents) || cents < 100 || cents > MAX_MONTHLY_CENTS) return { ok: false, error: "amount" };
  const store = monthlyStore();
  const before = (await store.list(user.id)).find((m) => m.sourceKey === key);
  const label = sourceLabel(key, before?.sourceLabel ?? name);
  await store.put({ ownerUserId: user.id, sourceKey: key, sourceLabel: label, cents, lastMonth: before?.lastMonth ?? null, updatedAt: now.toISOString() });
  return { ok: true, key, label, drafts: await makeMonthlyDrafts(user, now) };
}

export async function removeMonthly(user: User, key: string): Promise<void> {
  if (user.role === "assistant") return;
  await monthlyStore().remove(user.id, key);
}

/** The draft's id for one source and month: two runs at once write the same draft, never two. */
export const monthlyDraftId = (owner: string, key: string, month: string) => `x_m${createHash("sha256").update(`${owner}\n${key}\n${month}`).digest("base64url").slice(0, 16)}`;

/**
 * Makes this month's draft for each monthly amount that doesn't have one yet,
 * dated the 1st of the month (the loan officer fixes the date when they
 * confirm). Returns how many were made. Never posts anything.
 */
export async function makeMonthlyDrafts(user: User, now = new Date()): Promise<number> {
  if (user.role === "assistant") return 0;
  const store = monthlyStore();
  const month = pacificMonth(now);
  let made = 0;
  for (const m of await store.list(user.id)) {
    if (m.lastMonth && m.lastMonth >= month) continue;
    const id = monthlyDraftId(user.id, m.sourceKey, month);
    if (!(await expenseStore().get(user.id, id))) {
      const at = now.toISOString();
      const entry: Entry = { id, ownerUserId: user.id, kind: "expense", date: `${month}-01`, amountCents: m.cents, miles: null, vendor: m.sourceLabel.slice(0, 80), category: "advertising", businessPct: 100, purpose: `Monthly amount for ${m.sourceLabel} (set on Lead sources)`.slice(0, 200), recipient: null, receiptId: null, source: "monthly", leadSource: m.sourceKey, status: "draft", createdAt: at, updatedAt: at };
      await expenseStore().put(entry);
      made++;
    }
    await store.put({ ...m, lastMonth: month });
  }
  return made;
}
