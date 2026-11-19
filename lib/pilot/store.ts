/**
 * lib/pilot/store.ts — problem reports from loan officers (D44).
 * SERVER-ONLY. Neon table cc_reports when DATABASE_URL is set, else memory.
 *
 * A report holds what the loan officer typed (with SSNs, dates of birth,
 * account numbers, phone numbers and other people's emails masked first),
 * the Command Center page it came from (path only, never the query), the
 * screen width and the color theme. Nothing else from the page is captured.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export const REPORT_KINDS = { broken: "Something's broken", confusing: "Something's confusing", idea: "An idea" } as const;
export type ReportKind = keyof typeof REPORT_KINDS;
export const REPORT_STATUS = { open: "Open", seen: "Looking into it", fixed: "Fixed", wontfix: "Not changing" } as const;
export type ReportStatus = keyof typeof REPORT_STATUS;

export type Report = {
  id: string;
  userId: string;
  at: string;
  kind: ReportKind;
  path: string;
  message: string;
  width: number | null;
  theme: string | null;
  status: ReportStatus;
  note: string;
  updatedAt: string | null;
};

export interface ReportStore {
  put(r: Report): Promise<void>;
  get(id: string): Promise<Report | null>;
  list(opts?: { userId?: string; limit?: number }): Promise<Report[]>;
}

class MemoryReportStore implements ReportStore {
  private m = new Map<string, Report>();
  async put(r: Report) {
    this.m.set(r.id, { ...r });
  }
  async get(id: string) {
    const r = this.m.get(id);
    return r ? { ...r } : null;
  }
  async list(opts: { userId?: string; limit?: number } = {}) {
    return [...this.m.values()]
      .filter((r) => !opts.userId || r.userId === opts.userId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, opts.limit ?? 500)
      .map((r) => ({ ...r }));
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
class NeonReportStore implements ReportStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= this.q(
      `CREATE TABLE IF NOT EXISTS cc_reports (id text PRIMARY KEY, user_id text NOT NULL, at text NOT NULL, kind text NOT NULL, path text NOT NULL, message text NOT NULL, width int, theme text, status text NOT NULL, note text NOT NULL DEFAULT '', updated_at text)`,
    ).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  private row(r: Record<string, unknown>): Report {
    return {
      id: String(r.id),
      userId: String(r.user_id),
      at: String(r.at),
      kind: r.kind as ReportKind,
      path: String(r.path),
      message: String(r.message),
      width: r.width === null || r.width === undefined ? null : Number(r.width),
      theme: (r.theme as string | null) ?? null,
      status: r.status as ReportStatus,
      note: String(r.note ?? ""),
      updatedAt: (r.updated_at as string | null) ?? null,
    };
  }
  async put(r: Report) {
    await this.init();
    await this.q(
      `INSERT INTO cc_reports (id, user_id, at, kind, path, message, width, theme, status, note, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at`,
      [r.id, r.userId, r.at, r.kind, r.path, r.message, r.width, r.theme, r.status, r.note, r.updatedAt],
    );
  }
  async get(id: string) {
    await this.init();
    const rows = await this.q(`SELECT * FROM cc_reports WHERE id = $1`, [id]);
    return rows[0] ? this.row(rows[0]) : null;
  }
  async list(opts: { userId?: string; limit?: number } = {}) {
    await this.init();
    const limit = Math.min(Math.max(opts.limit ?? 500, 1), 2000);
    const rows = opts.userId
      ? await this.q(`SELECT * FROM cc_reports WHERE user_id = $1 ORDER BY at DESC LIMIT ${limit}`, [opts.userId])
      : await this.q(`SELECT * FROM cc_reports ORDER BY at DESC LIMIT ${limit}`);
    return rows.map((r) => this.row(r));
  }
}

let override: ReportStore | null = null;
let neonStore: NeonReportStore | null = null;
const g = globalThis as unknown as { __lm8ReportMemory?: MemoryReportStore };
const memory = (g.__lm8ReportMemory ??= new MemoryReportStore());
export const setReportStoreForTests = (s: ReportStore | null) => void (override = s);
export const newMemoryReportStore = (): ReportStore => new MemoryReportStore();
export function reportStore(): ReportStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonReportStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
