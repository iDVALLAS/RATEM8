/**
 * lib/registry/store.ts — loan officer sign-ups (D45). SERVER-ONLY.
 * Neon table cc_signups when DATABASE_URL is set, else memory.
 *
 * A sign-up is what a loan officer typed about themselves. It becomes
 * their loan officer record only after a person checks their NMLS record
 * and approves it (later, a RETR check can do that step).
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export type SignUpStatus = "unconfirmed" | "pending" | "approved" | "declined";
export type SignUpLicense = { state: string; license: string };

export type SignUp = {
  id: string;
  status: SignUpStatus;
  createdAt: string;
  confirmedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  /** The reviewer's note (sent with a decline). */
  note: string;
  name: string;
  email: string;
  phone: string;
  nmls: string;
  sponsorName: string;
  sponsorNmls: string;
  sponsorAddress: string;
  licenses: SignUpLicense[];
  calendly: string;
  applicationUrl: string;
  heardFrom: string;
  /** Their answer: does the sponsoring company allow client contacts in an outside system? */
  sponsorAllows: boolean;
  confirmHash: string | null;
  confirmExpires: string | null;
  /** Set on approval. */
  mloId: string | null;
  userId: string | null;
  verifiedBy: "human" | "retr" | null;
  verifiedAt: string | null;
  /** D61: who invited them to the pilot (their email), when they came from an invite. */
  invitedBy?: string | null;
};

export interface SignUpStore {
  put(s: SignUp): Promise<void>;
  get(id: string): Promise<SignUp | null>;
  byConfirm(hash: string): Promise<SignUp | null>;
  byEmail(email: string): Promise<SignUp[]>;
  list(status?: SignUpStatus): Promise<SignUp[]>;
}

class MemorySignUpStore implements SignUpStore {
  private m = new Map<string, SignUp>();
  async put(s: SignUp) {
    this.m.set(s.id, structuredClone(s));
  }
  async get(id: string) {
    const s = this.m.get(id);
    return s ? structuredClone(s) : null;
  }
  async byConfirm(hash: string) {
    const s = [...this.m.values()].find((x) => x.confirmHash === hash);
    return s ? structuredClone(s) : null;
  }
  async byEmail(email: string) {
    return [...this.m.values()].filter((x) => x.email === email).map((x) => structuredClone(x));
  }
  async list(status?: SignUpStatus) {
    return [...this.m.values()].filter((x) => !status || x.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => structuredClone(x));
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
class NeonSignUpStore implements SignUpStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= this.q(`CREATE TABLE IF NOT EXISTS cc_signups (id text PRIMARY KEY, email text NOT NULL, status text NOT NULL, created_at text NOT NULL, confirm_hash text, data jsonb NOT NULL)`).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  private row(r: Record<string, unknown>): SignUp {
    return (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as SignUp;
  }
  async put(s: SignUp) {
    await this.init();
    await this.q(
      `INSERT INTO cc_signups (id, email, status, created_at, confirm_hash, data) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, status = EXCLUDED.status, confirm_hash = EXCLUDED.confirm_hash, data = EXCLUDED.data`,
      [s.id, s.email, s.status, s.createdAt, s.confirmHash, JSON.stringify(s)],
    );
  }
  async get(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_signups WHERE id = $1`, [id]);
    return r[0] ? this.row(r[0]) : null;
  }
  async byConfirm(hash: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_signups WHERE confirm_hash = $1`, [hash]);
    return r[0] ? this.row(r[0]) : null;
  }
  async byEmail(email: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_signups WHERE email = $1`, [email])).map((r) => this.row(r));
  }
  async list(status?: SignUpStatus) {
    await this.init();
    const r = status ? await this.q(`SELECT data FROM cc_signups WHERE status = $1 ORDER BY created_at DESC LIMIT 1000`, [status]) : await this.q(`SELECT data FROM cc_signups ORDER BY created_at DESC LIMIT 1000`);
    return r.map((x) => this.row(x));
  }
}

let override: SignUpStore | null = null;
let neonStore: NeonSignUpStore | null = null;
const g = globalThis as unknown as { __lm8SignUpMemory?: MemorySignUpStore };
const memory = (g.__lm8SignUpMemory ??= new MemorySignUpStore());
export const setSignUpStoreForTests = (s: SignUpStore | null) => void (override = s);
export const newMemorySignUpStore = (): SignUpStore => new MemorySignUpStore();
export function signUpStore(): SignUpStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonSignUpStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
