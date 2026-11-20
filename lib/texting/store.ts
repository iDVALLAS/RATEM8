/**
 * lib/texting/store.ts — each sponsoring company's own texting setup (D56).
 * SERVER-ONLY. Neon table cc_texting when DATABASE_URL is set, else memory.
 * One record per company (its NMLS number). The Twilio subaccount's auth
 * token is stored sealed.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export const BUSINESS_TYPES = ["Limited Liability Corporation", "Corporation", "Partnership", "Co-operative", "Non-profit Corporation"] as const;
export const JOB_POSITIONS = ["CEO", "CFO", "Director", "GM", "VP", "General Counsel", "Other"] as const;
export const COMPANY_TYPES = ["private", "non-profit"] as const;

/** What the company tells the carriers (from its loan officer or owner). */
export type CompanyInfo = {
  legalName: string;
  ein: string;
  businessType: (typeof BUSINESS_TYPES)[number];
  companyType: (typeof COMPANY_TYPES)[number];
  website: string;
  privacyUrl: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  repFirst: string;
  repLast: string;
  repEmail: string;
  repPhone: string;
  repTitle: string;
  repPosition: (typeof JOB_POSITIONS)[number];
  areaCode: string;
};

/**
 * draft: saved, not sent for review. review: waiting for the platform owner
 * to approve the fees. working: Command Center is registering it, step by
 * step (some steps wait days for the carriers). live: texts can go.
 * attention: a step needs a person (the error says what). stopped: turned off.
 */
export type TextingStatus = "draft" | "review" | "working" | "live" | "attention" | "stopped";

export type TextingSetup = {
  company: string;
  companyName: string;
  info: CompanyInfo;
  status: TextingStatus;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Twilio pieces, filled in as each step finishes. */
  subaccountSid: string | null;
  subaccountTokenSealed: string | null;
  customerProfileSid: string | null;
  businessEndUserSid: string | null;
  repEndUserSid: string | null;
  addressSid: string | null;
  addressDocSid: string | null;
  primaryAssigned: boolean;
  profileSubmitted: boolean;
  trustProductSid: string | null;
  messagingEndUserSid: string | null;
  trustProductSubmitted: boolean;
  brandSid: string | null;
  brandStatus: string | null;
  serviceSid: string | null;
  phoneNumber: string | null;
  phoneNumberSid: string | null;
  numberAttached: boolean;
  campaignSid: string | null;
  campaignStatus: string | null;
  /** The step that last failed, why, and how many times in a row. */
  step: string;
  error: string;
  failures: number;
  checkedAt: string | null;
  liveAt: string | null;
  log: { at: string; text: string }[];
};

export interface TextingStore {
  get(company: string): Promise<TextingSetup | null>;
  put(s: TextingSetup): Promise<void>;
  all(): Promise<TextingSetup[]>;
  /** The record that owns a Twilio subaccount, for checking its webhooks. */
  bySubaccount(sid: string): Promise<TextingSetup | null>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

class MemoryTextingStore implements TextingStore {
  private m = new Map<string, TextingSetup>();
  async get(c: string) {
    const x = this.m.get(c);
    return x ? clone(x) : null;
  }
  async put(s: TextingSetup) {
    this.m.set(s.company, clone(s));
  }
  async all() {
    return [...this.m.values()].map(clone);
  }
  async bySubaccount(sid: string) {
    const x = [...this.m.values()].find((s) => s.subaccountSid === sid);
    return x ? clone(x) : null;
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

class NeonTextingStore implements TextingStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= this.q(`CREATE TABLE IF NOT EXISTS cc_texting (company text PRIMARY KEY, status text NOT NULL, subaccount_sid text, data jsonb NOT NULL)`).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async get(c: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_texting WHERE company = $1`, [c]);
    return r[0] ? parse<TextingSetup>(r[0].data) : null;
  }
  async put(s: TextingSetup) {
    await this.init();
    await this.q(`INSERT INTO cc_texting (company, status, subaccount_sid, data) VALUES ($1,$2,$3,$4) ON CONFLICT (company) DO UPDATE SET status = EXCLUDED.status, subaccount_sid = EXCLUDED.subaccount_sid, data = EXCLUDED.data`, [s.company, s.status, s.subaccountSid, JSON.stringify(s)]);
  }
  async all() {
    await this.init();
    return (await this.q(`SELECT data FROM cc_texting ORDER BY company`)).map((x) => parse<TextingSetup>(x.data));
  }
  async bySubaccount(sid: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_texting WHERE subaccount_sid = $1`, [sid]);
    return r[0] ? parse<TextingSetup>(r[0].data) : null;
  }
}

let override: TextingStore | null = null;
let neonStore: NeonTextingStore | null = null;
const g = globalThis as unknown as { __lm8TextingMemory?: MemoryTextingStore };
const memory = (g.__lm8TextingMemory ??= new MemoryTextingStore());
export const setTextingStoreForTests = (s: TextingStore | null) => void (override = s);
export const newMemoryTextingStore = (): TextingStore => new MemoryTextingStore();
export function textingStore(): TextingStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonTextingStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
