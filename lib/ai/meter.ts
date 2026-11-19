/**
 * lib/ai/meter.ts — which model each Command Center feature uses, what it
 * costs, and each member's monthly allowance (D41). SERVER-ONLY.
 *
 *  - aiMeter(user, route) gives a feature its key, its model (from the
 *    member's plan in lib/config.ts AI_PLANS) and a record() to call with
 *    the response's usage. It returns null when there's no key or the
 *    month's allowance is used; every feature already has a no-AI path,
 *    so it falls back instead of failing.
 *  - CC_CONCIERGE_MODEL, when set, overrides every route (testing).
 *  - Usage is kept per call (tokens and cost, never the text), and summed
 *    per member per month (Pacific).
 *  - The public borrower chat is recorded against the routed loan
 *    officer, never stopped.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import { AI_PLANS, AI_PRICES, type AiPlan, type AiRoute } from "@/lib/config";
import { accountStore, type User } from "@/lib/accounts/store";
import { membershipStore } from "@/lib/membership/store";

/** Command Center's own key (a separate workspace), else the chat's. Same rule as the Concierge's ccAnthropicKey (D20). */
const ccAnthropicKey = () => process.env.CC_ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null;

export type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
export type UsageRow = { userId: string; route: AiRoute; model: string; input: number; output: number; cacheRead: number; cacheWrite: number; costMicros: number; at: string };

/** Cost in millionths of a dollar. An unknown model is priced as the most expensive one, so it's never undercounted. */
export function costMicros(model: string, u: Usage): number {
  const p = AI_PRICES[model] ?? Object.values(AI_PRICES).reduce((a, b) => (b.output > a.output ? b : a));
  const n = (x: number | null | undefined) => Math.max(0, x ?? 0);
  // $ per million tokens × tokens = micro-dollars.
  return Math.round(n(u.input_tokens) * p.input + n(u.output_tokens) * p.output + n(u.cache_read_input_tokens) * p.cacheRead + n(u.cache_creation_input_tokens) * p.cacheWrite);
}

/** "YYYY-MM" in Pacific time, and the first day of the next month. */
export function monthOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
}
export function resetsOn(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export interface UsageStore {
  add(r: UsageRow): Promise<void>;
  month(userId: string, month: string): Promise<{ costMicros: number; calls: number; byRoute: Record<string, number> }>;
  monthAll(month: string): Promise<{ userId: string; costMicros: number; calls: number }[]>;
}

export class MemoryUsageStore implements UsageStore {
  rows: UsageRow[] = [];
  async add(r: UsageRow) {
    this.rows.push({ ...r });
  }
  async month(userId: string, month: string) {
    const rs = this.rows.filter((r) => r.userId === userId && monthOf(new Date(r.at)) === month);
    const byRoute: Record<string, number> = {};
    for (const r of rs) byRoute[r.route] = (byRoute[r.route] ?? 0) + r.costMicros;
    return { costMicros: rs.reduce((n, r) => n + r.costMicros, 0), calls: rs.length, byRoute };
  }
  async monthAll(month: string) {
    const by = new Map<string, { costMicros: number; calls: number }>();
    for (const r of this.rows.filter((x) => monthOf(new Date(x.at)) === month)) {
      const v = by.get(r.userId) ?? { costMicros: 0, calls: 0 };
      by.set(r.userId, { costMicros: v.costMicros + r.costMicros, calls: v.calls + 1 });
    }
    return [...by.entries()].map(([userId, v]) => ({ userId, ...v }));
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
class NeonUsageStore implements UsageStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    this.ready ??= (async () => {
      await this.q(`CREATE TABLE IF NOT EXISTS cc_ai_usage (id bigserial PRIMARY KEY, user_id text NOT NULL, route text NOT NULL, model text NOT NULL, input_tokens integer NOT NULL, output_tokens integer NOT NULL, cache_read integer NOT NULL, cache_write integer NOT NULL, cost_micros bigint NOT NULL, month text NOT NULL, at timestamptz NOT NULL)`);
      await this.q(`CREATE INDEX IF NOT EXISTS cc_ai_usage_month ON cc_ai_usage (user_id, month)`);
    })().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }
  async add(r: UsageRow) {
    await this.init();
    await this.q(`INSERT INTO cc_ai_usage (user_id, route, model, input_tokens, output_tokens, cache_read, cache_write, cost_micros, month, at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [r.userId, r.route, r.model, r.input, r.output, r.cacheRead, r.cacheWrite, r.costMicros, monthOf(new Date(r.at)), r.at]);
  }
  async month(userId: string, month: string) {
    await this.init();
    const r = await this.q(`SELECT route, SUM(cost_micros) AS c, COUNT(*) AS n FROM cc_ai_usage WHERE user_id = $1 AND month = $2 GROUP BY route`, [userId, month]);
    const byRoute = Object.fromEntries(r.map((x) => [x.route as string, Number(x.c)]));
    return { costMicros: r.reduce((n, x) => n + Number(x.c), 0), calls: r.reduce((n, x) => n + Number(x.n), 0), byRoute };
  }
  async monthAll(month: string) {
    await this.init();
    const r = await this.q(`SELECT user_id, SUM(cost_micros) AS c, COUNT(*) AS n FROM cc_ai_usage WHERE month = $1 GROUP BY user_id`, [month]);
    return r.map((x) => ({ userId: x.user_id as string, costMicros: Number(x.c), calls: Number(x.n) }));
  }
}

let override: UsageStore | null = null;
let neonStore: NeonUsageStore | null = null;
const g = globalThis as unknown as { __lm8UsageMemory?: MemoryUsageStore };
const memory = (g.__lm8UsageMemory ??= new MemoryUsageStore());
export function setUsageStoreForTests(s: UsageStore | null) {
  override = s;
}
export function usageStore(): UsageStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonUsageStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}

export async function planOf(userId: string): Promise<AiPlan> {
  const m = await membershipStore().member(userId).catch(() => null);
  return m?.plan && m.plan in AI_PLANS ? m.plan : "capped";
}

export type Allowance = { plan: AiPlan; label: string; usedCents: number; allowanceCents: number; left: number; over: boolean; resetsOn: string; calls: number; byRoute: Record<string, number> };

export async function allowanceFor(userId: string, now = new Date()): Promise<Allowance> {
  const plan = await planOf(userId);
  const month = monthOf(now);
  const u = await usageStore().month(userId, month);
  const usedCents = u.costMicros / 10_000;
  const allowanceCents = AI_PLANS[plan].allowanceCents;
  return { plan, label: AI_PLANS[plan].label, usedCents, allowanceCents, left: Math.max(0, allowanceCents - usedCents), over: usedCents >= allowanceCents, resetsOn: resetsOn(month), calls: u.calls, byRoute: Object.fromEntries(Object.entries(u.byRoute).map(([k, v]) => [k, v / 10_000])) };
}

export type Meter = { apiKey: string; model: string; record: (usage: Usage | null | undefined) => Promise<void> };

/** A feature's key, model and usage recorder, or null (no key, or the month's allowance is used). */
export async function aiMeter(user: Pick<User, "id"> | null, route: Exclude<AiRoute, "chat">, now = new Date()): Promise<Meter | null> {
  const apiKey = ccAnthropicKey();
  if (!apiKey || !user) return null;
  const a = await allowanceFor(user.id, now).catch(() => null);
  if (a?.over) return null;
  const plan = a?.plan ?? "capped";
  const model = process.env.CC_CONCIERGE_MODEL?.trim() || AI_PLANS[plan].models[route];
  return { apiKey, model, record: (u) => recordUsage(user.id, route, model, u, now) };
}

export async function recordUsage(userId: string, route: AiRoute, model: string, u: Usage | null | undefined, now = new Date()): Promise<void> {
  if (!u) return;
  await usageStore()
    .add({ userId, route, model, input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, costMicros: costMicros(model, u), at: now.toISOString() })
    .catch(() => undefined);
}

/** Public chat: recorded against the loan officer the visitor was routed to (their account), never limited. */
export async function recordChatUsage(mloId: string | null, model: string, u: Usage, now = new Date()): Promise<void> {
  if (!mloId) return;
  const user = (await accountStore().listUsers().catch(() => [])).find((x) => x.mloId === mloId && x.status === "active");
  await recordUsage(user?.id ?? `mlo:${mloId}`, "chat", model, u, now);
}

/** Said wherever a feature fell back because the AI isn't available. */
export async function aiOffReason(user: Pick<User, "id"> | null, now = new Date()): Promise<string> {
  if (!ccAnthropicKey()) return "the AI key isn't in Vercel yet";
  if (!user) return "you're not signed in";
  const a = await allowanceFor(user.id, now).catch(() => null);
  return a?.over ? `this month's AI allowance is used (it resets ${a.resetsOn})` : "the AI isn't available right now";
}

/** A feature's model call, built on its meter, or null (the feature then takes its no-AI path). */
export async function aiCall<T>(user: Pick<User, "id"> | null, route: Exclude<AiRoute, "chat">, make: (m: Meter) => T, now = new Date()): Promise<T | null> {
  const m = await aiMeter(user, route, now);
  return m ? make(m) : null;
}
