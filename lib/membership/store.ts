/**
 * lib/membership/store.ts — membership fees, recruiting credits and the
 * area co-op budget (D35/D36). SERVER-ONLY.
 *
 * Neon when DATABASE_URL is set, memory otherwise. Payments and co-op
 * spending are append-only records: a credit or a co-op share is worked out
 * once, when the payment is recorded, and never rewritten.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export type Member = {
  userId: string;
  /** Their service area, as the owner names it ("Eastside King County, WA"). The co-op budget is kept per area. */
  area: string;
  /** The monthly membership fee, in cents. */
  feeCents: number;
  /** Who brought them in (one level), or null. */
  recruitedBy: string | null;
  /** When they joined, for the tenure rate. */
  joinedOn: string;
  /** D41: the AI plan (lib/config.ts AI_PLANS); "capped" when not set. */
  plan?: "capped" | "unlimited";
  updatedAt: string;
};

export type RecruitCredit = { recruiterUserId: string; rate: number; cents: number; status: "credited" | "held" };

export type Payment = {
  id: string;
  userId: string;
  /** "YYYY-MM". One per member per month. */
  month: string;
  feeCents: number;
  creditUsedCents: number;
  paidCents: number;
  /** The area's share (members have a say). */
  coopCents: number;
  /** The national share. */
  nationalCents: number;
  area: string;
  credit: RecruitCredit | null;
  recordedBy: string;
  recordedAt: string;
};

export const COOP_CHANNELS = ["search_ads", "social_ads", "mail", "sponsorship", "event", "print", "other"] as const;
export type CoopChannel = (typeof COOP_CHANNELS)[number];

/** The area budget's key for national marketing. */
export const NATIONAL = "National";

/** A member's say: how they'd like their area's budget split, in whole percent per channel (adds to 100). */
export type CoopPref = { userId: string; area: string; split: Partial<Record<CoopChannel, number>>; updatedAt: string };
export type CoopIdea = { id: string; area: string; userId: string; text: string; dollars: number | null; status: "open" | "approved" | "declined" | "done"; reply: string | null; at: string; decidedAt: string | null; decidedBy: string | null };

export type CoopSpend = { id: string; area: string; month: string; cents: number; what: string; channel: CoopChannel; proof: string; recordedBy: string; recordedAt: string };

export interface MembershipStore {
  member(userId: string): Promise<Member | null>;
  members(): Promise<Member[]>;
  putMember(m: Member): Promise<void>;
  /** False when that member already has a payment for that month. */
  addPayment(p: Payment): Promise<boolean>;
  payments(filter: { userId?: string; recruiterUserId?: string; area?: string }): Promise<Payment[]>;
  addSpend(s: CoopSpend): Promise<void>;
  spends(area: string): Promise<CoopSpend[]>;
  putPref(p: CoopPref): Promise<void>;
  prefs(area: string): Promise<CoopPref[]>;
  putIdea(i: CoopIdea): Promise<void>;
  idea(id: string): Promise<CoopIdea | null>;
  ideas(area: string | null): Promise<CoopIdea[]>;
}

export const areaKey = (a: string) => a.trim().toLowerCase().replace(/\s+/g, " ");

export class MemoryMembershipStore implements MembershipStore {
  private m = new Map<string, Member>();
  private p: Payment[] = [];
  private s: CoopSpend[] = [];
  private pr = new Map<string, CoopPref>();
  private id_ = new Map<string, CoopIdea>();
  async putPref(x: CoopPref) {
    this.pr.set(x.userId, { ...x, split: { ...x.split } });
  }
  async prefs(area: string) {
    return [...this.pr.values()].filter((x) => areaKey(x.area) === areaKey(area));
  }
  async putIdea(x: CoopIdea) {
    this.id_.set(x.id, { ...x });
  }
  async idea(id: string) {
    return this.id_.get(id) ?? null;
  }
  async ideas(area: string | null) {
    return [...this.id_.values()].filter((x) => area === null || areaKey(x.area) === areaKey(area)).sort((a, b) => b.at.localeCompare(a.at));
  }
  async member(id: string) {
    return this.m.get(id) ?? null;
  }
  async members() {
    return [...this.m.values()];
  }
  async putMember(x: Member) {
    this.m.set(x.userId, { ...x });
  }
  async addPayment(x: Payment) {
    if (this.p.some((y) => y.userId === x.userId && y.month === x.month)) return false;
    this.p.push({ ...x });
    return true;
  }
  async payments(f: { userId?: string; recruiterUserId?: string; area?: string }) {
    return this.p
      .filter((x) => (!f.userId || x.userId === f.userId) && (!f.recruiterUserId || x.credit?.recruiterUserId === f.recruiterUserId) && (!f.area || areaKey(x.area) === areaKey(f.area)))
      .sort((a, b) => a.month.localeCompare(b.month) || a.recordedAt.localeCompare(b.recordedAt));
  }
  async addSpend(x: CoopSpend) {
    this.s.push({ ...x });
  }
  async spends(area: string) {
    return this.s.filter((x) => areaKey(x.area) === areaKey(area)).sort((a, b) => a.month.localeCompare(b.month) || a.recordedAt.localeCompare(b.recordedAt));
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const toIso = (v: unknown) => new Date(v as string).toISOString();

export class NeonMembershipStore implements MembershipStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_members (user_id text PRIMARY KEY, area text NOT NULL, fee_cents integer NOT NULL, recruited_by text, joined_on date NOT NULL, updated_at timestamptz NOT NULL)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_member_payments (id text PRIMARY KEY, user_id text NOT NULL, month text NOT NULL, fee_cents integer NOT NULL, credit_used_cents integer NOT NULL, paid_cents integer NOT NULL, coop_cents integer NOT NULL, area text NOT NULL, credit jsonb, recorded_by text NOT NULL, recorded_at timestamptz NOT NULL, UNIQUE (user_id, month))`);
        await this.q(`ALTER TABLE cc_member_payments ADD COLUMN IF NOT EXISTS national_cents integer NOT NULL DEFAULT 0`);
        await this.q(`ALTER TABLE cc_members ADD COLUMN IF NOT EXISTS plan text`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_coop_prefs (user_id text PRIMARY KEY, area text NOT NULL, split jsonb NOT NULL, updated_at timestamptz NOT NULL)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_coop_ideas (id text PRIMARY KEY, area text NOT NULL, user_id text NOT NULL, text text NOT NULL, dollars numeric, status text NOT NULL, reply text, at timestamptz NOT NULL, decided_at timestamptz, decided_by text)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_coop_spend (id text PRIMARY KEY, area text NOT NULL, month text NOT NULL, cents integer NOT NULL, what text NOT NULL, channel text NOT NULL, proof text NOT NULL, recorded_by text NOT NULL, recorded_at timestamptz NOT NULL)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  private toMember = (r: Row): Member => ({ userId: r.user_id as string, area: r.area as string, feeCents: Number(r.fee_cents), recruitedBy: (r.recruited_by as string | null) ?? null, joinedOn: toIso(r.joined_on).slice(0, 10), plan: r.plan === "unlimited" ? "unlimited" : r.plan === "capped" ? "capped" : undefined, updatedAt: toIso(r.updated_at) });
  private toPayment = (r: Row): Payment => ({ id: r.id as string, userId: r.user_id as string, month: r.month as string, feeCents: Number(r.fee_cents), creditUsedCents: Number(r.credit_used_cents), paidCents: Number(r.paid_cents), coopCents: Number(r.coop_cents), nationalCents: Number(r.national_cents ?? 0), area: r.area as string, credit: (typeof r.credit === "string" ? JSON.parse(r.credit) : r.credit) as RecruitCredit | null, recordedBy: r.recorded_by as string, recordedAt: toIso(r.recorded_at) });
  async member(id: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_members WHERE user_id = $1`, [id]);
    return r[0] ? this.toMember(r[0]) : null;
  }
  async members() {
    await this.init();
    return (await this.q(`SELECT * FROM cc_members`)).map(this.toMember);
  }
  async putMember(m: Member) {
    await this.init();
    await this.q(
      `INSERT INTO cc_members (user_id, area, fee_cents, recruited_by, joined_on, updated_at, plan) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET area = EXCLUDED.area, fee_cents = EXCLUDED.fee_cents, recruited_by = EXCLUDED.recruited_by, joined_on = EXCLUDED.joined_on, updated_at = EXCLUDED.updated_at, plan = EXCLUDED.plan`,
      [m.userId, m.area, m.feeCents, m.recruitedBy, m.joinedOn, m.updatedAt, m.plan ?? null],
    );
  }
  async addPayment(p: Payment) {
    await this.init();
    const r = await this.q(
      `INSERT INTO cc_member_payments (id, user_id, month, fee_cents, credit_used_cents, paid_cents, coop_cents, national_cents, area, credit, recorded_by, recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (user_id, month) DO NOTHING RETURNING id`,
      [p.id, p.userId, p.month, p.feeCents, p.creditUsedCents, p.paidCents, p.coopCents, p.nationalCents, p.area, p.credit ? JSON.stringify(p.credit) : null, p.recordedBy, p.recordedAt],
    );
    return r.length > 0;
  }
  async payments(f: { userId?: string; recruiterUserId?: string; area?: string }) {
    await this.init();
    const r = f.userId
      ? await this.q(`SELECT * FROM cc_member_payments WHERE user_id = $1 ORDER BY month, recorded_at`, [f.userId])
      : f.recruiterUserId
        ? await this.q(`SELECT * FROM cc_member_payments WHERE credit->>'recruiterUserId' = $1 ORDER BY month, recorded_at`, [f.recruiterUserId])
        : f.area
          ? await this.q(`SELECT * FROM cc_member_payments WHERE lower(regexp_replace(trim(area), '\\s+', ' ', 'g')) = $1 ORDER BY month, recorded_at`, [areaKey(f.area)])
          : await this.q(`SELECT * FROM cc_member_payments ORDER BY month, recorded_at`);
    return r.map(this.toPayment);
  }
  async addSpend(s: CoopSpend) {
    await this.init();
    await this.q(`INSERT INTO cc_coop_spend (id, area, month, cents, what, channel, proof, recorded_by, recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [s.id, s.area, s.month, s.cents, s.what, s.channel, s.proof, s.recordedBy, s.recordedAt]);
  }
  async spends(area: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_coop_spend WHERE lower(regexp_replace(trim(area), '\\s+', ' ', 'g')) = $1 ORDER BY month, recorded_at`, [areaKey(area)]);
    return r.map((x) => ({ id: x.id as string, area: x.area as string, month: x.month as string, cents: Number(x.cents), what: x.what as string, channel: x.channel as CoopChannel, proof: x.proof as string, recordedBy: x.recorded_by as string, recordedAt: toIso(x.recorded_at) }));
  }
  async putPref(x: CoopPref) {
    await this.init();
    await this.q(`INSERT INTO cc_coop_prefs (user_id, area, split, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET area = EXCLUDED.area, split = EXCLUDED.split, updated_at = EXCLUDED.updated_at`, [x.userId, x.area, JSON.stringify(x.split), x.updatedAt]);
  }
  async prefs(area: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_coop_prefs WHERE lower(regexp_replace(trim(area), '\\s+', ' ', 'g')) = $1`, [areaKey(area)]);
    return r.map((x) => ({ userId: x.user_id as string, area: x.area as string, split: (typeof x.split === "string" ? JSON.parse(x.split) : x.split) as CoopPref["split"], updatedAt: toIso(x.updated_at) }));
  }
  async putIdea(x: CoopIdea) {
    await this.init();
    await this.q(
      `INSERT INTO cc_coop_ideas (id, area, user_id, text, dollars, status, reply, at, decided_at, decided_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, reply = EXCLUDED.reply, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by`,
      [x.id, x.area, x.userId, x.text, x.dollars, x.status, x.reply, x.at, x.decidedAt, x.decidedBy],
    );
  }
  private toIdea = (x: Row): CoopIdea => ({ id: x.id as string, area: x.area as string, userId: x.user_id as string, text: x.text as string, dollars: x.dollars === null || x.dollars === undefined ? null : Number(x.dollars), status: x.status as CoopIdea["status"], reply: (x.reply as string | null) ?? null, at: toIso(x.at), decidedAt: x.decided_at ? toIso(x.decided_at) : null, decidedBy: (x.decided_by as string | null) ?? null });
  async idea(id: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_coop_ideas WHERE id = $1`, [id]);
    return r[0] ? this.toIdea(r[0]) : null;
  }
  async ideas(area: string | null) {
    await this.init();
    const r = area === null ? await this.q(`SELECT * FROM cc_coop_ideas ORDER BY at DESC LIMIT 200`) : await this.q(`SELECT * FROM cc_coop_ideas WHERE lower(regexp_replace(trim(area), '\\s+', ' ', 'g')) = $1 ORDER BY at DESC LIMIT 200`, [areaKey(area)]);
    return r.map(this.toIdea);
  }
}

let override: MembershipStore | null = null;
let neonStore: NeonMembershipStore | null = null;
const g = globalThis as unknown as { __lm8MemberMemory?: MemoryMembershipStore };
const memory = (g.__lm8MemberMemory ??= new MemoryMembershipStore());

export function setMembershipStoreForTests(s: MembershipStore | null) {
  override = s;
}

export function membershipStore(): MembershipStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonMembershipStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
