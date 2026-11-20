/**
 * lib/campaigns/store.ts — campaigns and the people in them (D51).
 * SERVER-ONLY. Neon tables cc_campaigns and cc_enrollments when
 * DATABASE_URL is set, else memory.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export const CHANNELS = ["text", "email", "task"] as const;
export type StepChannel = (typeof CHANNELS)[number];
export type Step = { id: string; channel: StepChannel; waitDays: number; subject: string; body: string };

export type CampaignKind = "followup" | "nurture";
export type CampaignTrigger = "manual" | "new_lead";
export type CampaignStatus = "draft" | "active" | "paused";

export type Campaign = {
  id: string;
  ownerUserId: string;
  name: string;
  /** followup: stops when they reply. nurture: keeps going (STOP always ends it). */
  kind: CampaignKind;
  /** What it's about, for permission: their loan in process (service) or staying in touch (marketing). */
  purpose: "service" | "marketing";
  trigger: CampaignTrigger;
  /** 0 = Sunday … 6 = Saturday, in the person's own time zone. */
  days: number[];
  /** Local hours it may send in: [start, end). The contact rules may narrow it further. */
  hours: { start: number; end: number };
  steps: Step[];
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  /** Where it came from: a starter, the AI or blank. */
  origin: string;
};

export type StepLog = { stepId: string; at: string; outcome: "sent" | "skipped" | "task"; note: string };
export type EnrollmentStatus = "active" | "done" | "stopped";
export type Enrollment = {
  id: string;
  campaignId: string;
  ownerUserId: string;
  contactId: string;
  status: EnrollmentStatus;
  /** The next step to run, and when. */
  stepIndex: number;
  nextAt: string;
  startedAt: string;
  endedAt: string | null;
  reason: string;
  log: StepLog[];
};

export interface CampaignStore {
  putCampaign(c: Campaign): Promise<void>;
  getCampaign(id: string): Promise<Campaign | null>;
  campaigns(owner: string): Promise<Campaign[]>;
  activeByTrigger(owner: string, trigger: CampaignTrigger): Promise<Campaign[]>;
  deleteCampaign(id: string): Promise<void>;
  putEnrollment(e: Enrollment): Promise<void>;
  getEnrollment(id: string): Promise<Enrollment | null>;
  enrollments(campaignId: string): Promise<Enrollment[]>;
  activeForContact(contactId: string): Promise<Enrollment[]>;
  due(now: string, limit: number): Promise<Enrollment[]>;
}

const clone = <T,>(x: T): T => structuredClone(x);

export class MemoryCampaignStore implements CampaignStore {
  private c = new Map<string, Campaign>();
  private e = new Map<string, Enrollment>();
  async putCampaign(x: Campaign) {
    this.c.set(x.id, clone(x));
  }
  async getCampaign(id: string) {
    const x = this.c.get(id);
    return x ? clone(x) : null;
  }
  async campaigns(owner: string) {
    return [...this.c.values()].filter((x) => x.ownerUserId === owner).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone);
  }
  async activeByTrigger(owner: string, trigger: CampaignTrigger) {
    return [...this.c.values()].filter((x) => x.ownerUserId === owner && x.status === "active" && x.trigger === trigger).map(clone);
  }
  async deleteCampaign(id: string) {
    this.c.delete(id);
    for (const [k, v] of this.e) if (v.campaignId === id) this.e.delete(k);
  }
  async putEnrollment(x: Enrollment) {
    this.e.set(x.id, clone(x));
  }
  async getEnrollment(id: string) {
    const x = this.e.get(id);
    return x ? clone(x) : null;
  }
  async enrollments(campaignId: string) {
    return [...this.e.values()].filter((x) => x.campaignId === campaignId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(clone);
  }
  async activeForContact(contactId: string) {
    return [...this.e.values()].filter((x) => x.contactId === contactId && x.status === "active").map(clone);
  }
  async due(now: string, limit: number) {
    return [...this.e.values()].filter((x) => x.status === "active" && x.nextAt <= now).sort((a, b) => a.nextAt.localeCompare(b.nextAt)).slice(0, limit).map(clone);
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const data = <T,>(r: Record<string, unknown>): T => (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as T;

class NeonCampaignStore implements CampaignStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= (async () => {
      await this.q(`CREATE TABLE IF NOT EXISTS cc_campaigns (id text PRIMARY KEY, owner_user_id text NOT NULL, status text NOT NULL, trigger text NOT NULL, updated_at text NOT NULL, data jsonb NOT NULL)`);
      await this.q(`CREATE TABLE IF NOT EXISTS cc_enrollments (id text PRIMARY KEY, campaign_id text NOT NULL, owner_user_id text NOT NULL, contact_id text NOT NULL, status text NOT NULL, next_at text NOT NULL, started_at text NOT NULL, data jsonb NOT NULL)`);
      await this.q(`CREATE INDEX IF NOT EXISTS cc_enrollments_due ON cc_enrollments (status, next_at)`);
      await this.q(`CREATE INDEX IF NOT EXISTS cc_enrollments_contact ON cc_enrollments (contact_id, status)`);
    })().catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async putCampaign(x: Campaign) {
    await this.init();
    await this.q(`INSERT INTO cc_campaigns (id, owner_user_id, status, trigger, updated_at, data) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, trigger = EXCLUDED.trigger, updated_at = EXCLUDED.updated_at, data = EXCLUDED.data`, [x.id, x.ownerUserId, x.status, x.trigger, x.updatedAt, JSON.stringify(x)]);
  }
  async getCampaign(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_campaigns WHERE id = $1`, [id]);
    return r[0] ? data<Campaign>(r[0]) : null;
  }
  async campaigns(owner: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_campaigns WHERE owner_user_id = $1 ORDER BY updated_at DESC LIMIT 500`, [owner])).map((r) => data<Campaign>(r));
  }
  async activeByTrigger(owner: string, trigger: CampaignTrigger) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_campaigns WHERE owner_user_id = $1 AND status = 'active' AND trigger = $2`, [owner, trigger])).map((r) => data<Campaign>(r));
  }
  async deleteCampaign(id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_enrollments WHERE campaign_id = $1`, [id]);
    await this.q(`DELETE FROM cc_campaigns WHERE id = $1`, [id]);
  }
  async putEnrollment(x: Enrollment) {
    await this.init();
    await this.q(`INSERT INTO cc_enrollments (id, campaign_id, owner_user_id, contact_id, status, next_at, started_at, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, next_at = EXCLUDED.next_at, data = EXCLUDED.data`, [x.id, x.campaignId, x.ownerUserId, x.contactId, x.status, x.nextAt, x.startedAt, JSON.stringify(x)]);
  }
  async getEnrollment(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_enrollments WHERE id = $1`, [id]);
    return r[0] ? data<Enrollment>(r[0]) : null;
  }
  async enrollments(campaignId: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_enrollments WHERE campaign_id = $1 ORDER BY started_at DESC LIMIT 2000`, [campaignId])).map((r) => data<Enrollment>(r));
  }
  async activeForContact(contactId: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_enrollments WHERE contact_id = $1 AND status = 'active'`, [contactId])).map((r) => data<Enrollment>(r));
  }
  async due(now: string, limit: number) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_enrollments WHERE status = 'active' AND next_at <= $1 ORDER BY next_at LIMIT ${Math.max(1, Math.min(limit, 2000))}`, [now])).map((r) => data<Enrollment>(r));
  }
}

let override: CampaignStore | null = null;
let neonStore: NeonCampaignStore | null = null;
const g = globalThis as unknown as { __lm8CampaignMemory?: MemoryCampaignStore };
const memory = (g.__lm8CampaignMemory ??= new MemoryCampaignStore());
export const setCampaignStoreForTests = (s: CampaignStore | null) => void (override = s);
export function campaignStore(): CampaignStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonCampaignStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
