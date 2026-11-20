/**
 * lib/agents/store.ts — the team's settings, moves, playbook approvals and
 * listing rows (D54). SERVER-ONLY. Neon (data jsonb) or memory.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { AgentKey } from "./team";

export const SOURCES = ["book", "partners", "leads", "listings", "new_agents", "relocation", "mail"] as const;
export type Source = (typeof SOURCES)[number];

export type Goals = { yearlyIncome: number; incomePerLoan: number; appToClose: number; talkToApp: number; partnerTouchesPerWeek: number };
export const DEFAULT_GOALS: Goals = { yearlyIncome: 0, incomePerLoan: 0, appToClose: 70, talkToApp: 10, partnerTouchesPerWeek: 5 };

export type TeamSettings = {
  ownerUserId: string;
  enabled: boolean;
  sources: Source[];
  /** Approved playbook ids and the text version each was approved at. */
  playbooks: Record<string, string>;
  goals: Goals;
  /** Most automatic sends per day. */
  dailySends: number;
  /** How messages name the market ("Bellevue", "the Eastside"). */
  area: string;
  /** Suggest closing gifts, holiday thank-yous and lunches (each waits for a yes). */
  gifts: boolean;
  /** Optional most per agent per calendar year, in cents (0 = none set). */
  giftCapCents: number;
  lastRunAt: string | null;
  updatedAt: string;
};

export type MoveKind = "task" | "draft" | "send" | "spend" | "plan";
export type GiftKind = "closing" | "holiday" | "lunch";
export type MoveStatus = "open" | "done" | "dismissed" | "sent" | "blocked";
export type Move = {
  id: string;
  /** One move per key while it matters (agent:kind:contact:subject). */
  key: string;
  ownerUserId: string;
  agent: AgentKey;
  kind: MoveKind;
  title: string;
  why: string;
  contactId: string | null;
  loanId: string | null;
  playbookId: string | null;
  channel: "text" | "email" | null;
  subject: string;
  body: string;
  /** Spend requests: an estimate, then what was actually spent. */
  amountCents: number | null;
  /** Gift lanes (owner's practice, 2026-11-20): logged per person per year. */
  gift?: GiftKind | null;
  score: number;
  status: MoveStatus;
  /** What Compliance or the contact rules said. */
  note: string;
  createdAt: string;
  updatedAt: string;
  until: string | null;
};

export type ListingRow = { id: string; ownerUserId: string; status: "canceled" | "expired" | "withdrawn"; address: string; city: string; state: string; zip: string; price: number | null; date: string | null; agentContactId: string | null; agentName: string; brokerage: string; importedAt: string };

export interface TeamStore {
  settings(owner: string): Promise<TeamSettings>;
  putSettings(s: TeamSettings): Promise<void>;
  enabledOwners(): Promise<string[]>;
  moves(owner: string, opts?: { status?: MoveStatus | "any"; since?: string; limit?: number }): Promise<Move[]>;
  moveByKey(owner: string, key: string): Promise<Move | null>;
  move(id: string): Promise<Move | null>;
  putMove(m: Move): Promise<void>;
  listings(owner: string): Promise<ListingRow[]>;
  putListing(r: ListingRow): Promise<void>;
}

export const defaultSettings = (owner: string): TeamSettings => ({ ownerUserId: owner, enabled: false, sources: ["book", "partners", "leads", "listings", "new_agents", "relocation"], playbooks: {}, goals: { ...DEFAULT_GOALS }, dailySends: 20, area: "", gifts: true, giftCapCents: 0, lastRunAt: null, updatedAt: new Date(0).toISOString() });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export class MemoryTeamStore implements TeamStore {
  private s = new Map<string, TeamSettings>();
  private m = new Map<string, Move>();
  private l = new Map<string, ListingRow>();
  async settings(o: string) {
    return clone(this.s.get(o) ?? defaultSettings(o));
  }
  async putSettings(x: TeamSettings) {
    this.s.set(x.ownerUserId, clone(x));
  }
  async enabledOwners() {
    return [...this.s.values()].filter((x) => x.enabled).map((x) => x.ownerUserId);
  }
  async moves(o: string, opts: { status?: MoveStatus | "any"; since?: string; limit?: number } = {}) {
    const st = opts.status ?? "open";
    return [...this.m.values()].filter((x) => x.ownerUserId === o && (st === "any" || x.status === st) && (!opts.since || x.updatedAt >= opts.since)).sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, opts.limit ?? 500).map(clone);
  }
  async moveByKey(o: string, key: string) {
    const all = [...this.m.values()].filter((x) => x.ownerUserId === o && x.key === key).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all[0] ? clone(all[0]) : null;
  }
  async move(id: string) {
    const x = this.m.get(id);
    return x ? clone(x) : null;
  }
  async putMove(x: Move) {
    this.m.set(x.id, clone(x));
  }
  async listings(o: string) {
    return [...this.l.values()].filter((x) => x.ownerUserId === o).sort((a, b) => b.importedAt.localeCompare(a.importedAt)).map(clone);
  }
  async putListing(x: ListingRow) {
    this.l.set(x.id, clone(x));
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
class NeonTeamStore implements TeamStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= Promise.all([
      this.q(`CREATE TABLE IF NOT EXISTS cc_team_settings (owner_user_id text PRIMARY KEY, enabled boolean NOT NULL, data jsonb NOT NULL)`),
      this.q(`CREATE TABLE IF NOT EXISTS cc_team_moves (id text PRIMARY KEY, owner_user_id text NOT NULL, key text NOT NULL, status text NOT NULL, score real NOT NULL, created_at text NOT NULL, updated_at text NOT NULL, data jsonb NOT NULL)`),
      this.q(`CREATE INDEX IF NOT EXISTS cc_team_moves_owner ON cc_team_moves (owner_user_id, status)`),
      this.q(`CREATE INDEX IF NOT EXISTS cc_team_moves_key ON cc_team_moves (owner_user_id, key)`),
      this.q(`CREATE TABLE IF NOT EXISTS cc_team_listings (id text PRIMARY KEY, owner_user_id text NOT NULL, imported_at text NOT NULL, data jsonb NOT NULL)`),
    ]).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async settings(o: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_team_settings WHERE owner_user_id = $1`, [o]);
    return r[0] ? { ...defaultSettings(o), ...parse<TeamSettings>(r[0].data) } : defaultSettings(o);
  }
  async putSettings(x: TeamSettings) {
    await this.init();
    await this.q(`INSERT INTO cc_team_settings (owner_user_id, enabled, data) VALUES ($1,$2,$3) ON CONFLICT (owner_user_id) DO UPDATE SET enabled = EXCLUDED.enabled, data = EXCLUDED.data`, [x.ownerUserId, x.enabled, JSON.stringify(x)]);
  }
  async enabledOwners() {
    await this.init();
    return (await this.q(`SELECT owner_user_id FROM cc_team_settings WHERE enabled = true LIMIT 500`)).map((r) => String(r.owner_user_id));
  }
  async moves(o: string, opts: { status?: MoveStatus | "any"; since?: string; limit?: number } = {}) {
    await this.init();
    const st = opts.status ?? "open";
    const r = await this.q(`SELECT data FROM cc_team_moves WHERE owner_user_id = $1 AND ($2 = 'any' OR status = $2) AND ($3 = '' OR updated_at >= $3) ORDER BY score DESC, created_at DESC LIMIT $4`, [o, st, opts.since ?? "", opts.limit ?? 500]);
    return r.map((x) => parse<Move>(x.data));
  }
  async moveByKey(o: string, key: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_team_moves WHERE owner_user_id = $1 AND key = $2 ORDER BY created_at DESC LIMIT 1`, [o, key]);
    return r[0] ? parse<Move>(r[0].data) : null;
  }
  async move(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_team_moves WHERE id = $1`, [id]);
    return r[0] ? parse<Move>(r[0].data) : null;
  }
  async putMove(x: Move) {
    await this.init();
    await this.q(`INSERT INTO cc_team_moves (id, owner_user_id, key, status, score, created_at, updated_at, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, score = EXCLUDED.score, updated_at = EXCLUDED.updated_at, data = EXCLUDED.data`, [x.id, x.ownerUserId, x.key, x.status, x.score, x.createdAt, x.updatedAt, JSON.stringify(x)]);
  }
  async listings(o: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_team_listings WHERE owner_user_id = $1 ORDER BY imported_at DESC LIMIT 2000`, [o])).map((x) => parse<ListingRow>(x.data));
  }
  async putListing(x: ListingRow) {
    await this.init();
    await this.q(`INSERT INTO cc_team_listings (id, owner_user_id, imported_at, data) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [x.id, x.ownerUserId, x.importedAt, JSON.stringify(x)]);
  }
}

let override: TeamStore | null = null;
let neonStore: NeonTeamStore | null = null;
const g = globalThis as unknown as { __lm8TeamMemory?: MemoryTeamStore };
const memory = (g.__lm8TeamMemory ??= new MemoryTeamStore());
export const setTeamStoreForTests = (s: TeamStore | null) => void (override = s);
export function teamStore(): TeamStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonTeamStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
