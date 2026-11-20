/**
 * lib/loa/store.ts — the Loan Officer Assistant's file on each loan, and the
 * lender overlay library (D62). SERVER-ONLY. Neon tables cc_loa_files and
 * cc_loa_overlays when DATABASE_URL is set, else memory.
 *
 * What's kept is what the LOA read out of a document (dates, the parties,
 * title exceptions, conditions, fees), never the document itself, and never
 * Social Security numbers, dates of birth or account numbers.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";

export const PARTY_ROLES = ["buyer_agent", "listing_agent", "escrow", "title", "lender", "insurance"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];
export type Party = { role: PartyRole; company: string; name: string; email: string; phone: string };

export type Deadline = { key: string; label: string; date: string; source: "contract" | "trid" | "lender" | "guide" | "manual"; done: boolean };

export type Contract = {
  price: number | null;
  sellerCredits: number | null;
  earnestMoney: number | null;
  property: { street: string; city: string; state: string; zip: string } | null;
  mutualAcceptance: string | null;
  earnestMoneyDue: string | null;
  inspectionEnds: string | null;
  financingContingencyEnds: string | null;
  appraisalContingencyEnds: string | null;
  closingDate: string | null;
  possession: string | null;
  notes: string[];
};

export type TitleItem = { id: string; kind: "mortgage" | "lien" | "judgment" | "tax" | "hoa" | "easement" | "other"; text: string; payoff: boolean; status: "open" | "payoff_requested" | "cleared" };

export type Condition = { id: string; text: string; owner: "borrower" | "third_party" | "loan_officer" | "lender"; priorTo: "docs" | "funding" | "closing" | "other"; status: "open" | "requested" | "received" | "cleared" };

export type EscrowFees = { from: string; total: number | null; lines: { label: string; amount: number }[]; receivedAt: string };

/** The LOA's checklist beyond the Loan Journey steps; each is ticked automatically when it can be, or by hand. */
export const CHECKS = [
  { key: "contract", label: "Purchase agreement read and on the file" },
  { key: "le", label: "Loan Estimate sent within 3 business days of application" },
  { key: "itp", label: "Intent to proceed on file" },
  { key: "appraisal_ordered", label: "Appraisal ordered" },
  { key: "appraisal_received", label: "Appraisal received and reviewed" },
  { key: "escrow_fees", label: "Escrow fees received" },
  { key: "title_opened", label: "Title opened" },
  { key: "title_reviewed", label: "Title commitment reviewed for liens and payoffs" },
  { key: "payoffs", label: "Payoffs ordered with escrow" },
  { key: "insurance", label: "Homeowner's insurance binder on file" },
  { key: "cpl", label: "Closing protection letter on file" },
  { key: "wire", label: "Wire instructions verified by phone with the escrow officer" },
  { key: "conditions", label: "Conditions from the approval cleared" },
  { key: "voe", label: "Verbal employment re-verification inside the window" },
  { key: "cd", label: "Closing Disclosure received 3 business days before signing" },
  { key: "lock", label: "Rate lock covers the closing date" },
  { key: "signing", label: "Signing scheduled" },
  { key: "funded", label: "Funded and recorded" },
] as const;
export type CheckKey = (typeof CHECKS)[number]["key"];
export type CheckState = { done: boolean; at: string; by: string; note?: string };

export type Draft = { id: string; to: PartyRole; toName: string; toEmail: string; subject: string; body: string; kind: "escrow_fees" | "open_title" | "payoffs" | "conditions_lo" | "other"; status: "draft" | "sent" | "discarded"; createdAt: string; sentAt: string | null };

export type LoaFile = {
  loanId: string;
  ownerUserId: string;
  contract: Contract | null;
  parties: Party[];
  deadlines: Deadline[];
  title: { commitmentDate: string | null; vesting: string; items: TitleItem[]; receivedAt: string } | null;
  escrowFees: EscrowFees | null;
  conditions: Condition[];
  approvalReceivedAt: string | null;
  checks: Partial<Record<CheckKey, CheckState>>;
  drafts: Draft[];
  log: { at: string; text: string }[];
  updatedAt: string;
};

export const emptyFile = (loanId: string, ownerUserId: string): LoaFile => ({ loanId, ownerUserId, contract: null, parties: [], deadlines: [], title: null, escrowFees: null, conditions: [], approvalReceivedAt: null, checks: {}, drafts: [], log: [], updatedAt: "" });

/** A lender's overlays, read once from what the loan officer uploaded. */
export type Overlay = { id: string; ownerUserId: string; lender: string; title: string; rules: string; chars: number; createdAt: string };

export interface LoaStore {
  file(loanId: string): Promise<LoaFile | null>;
  putFile(f: LoaFile): Promise<void>;
  filesFor(owner: string): Promise<LoaFile[]>;
  overlays(owner: string): Promise<Overlay[]>;
  putOverlay(o: Overlay): Promise<void>;
  removeOverlay(owner: string, id: string): Promise<void>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

class MemoryLoaStore implements LoaStore {
  private f = new Map<string, LoaFile>();
  private o = new Map<string, Overlay>();
  async file(id: string) {
    const x = this.f.get(id);
    return x ? clone(x) : null;
  }
  async putFile(x: LoaFile) {
    this.f.set(x.loanId, clone(x));
  }
  async filesFor(owner: string) {
    return [...this.f.values()].filter((x) => x.ownerUserId === owner).map(clone);
  }
  async overlays(owner: string) {
    return [...this.o.values()].filter((x) => x.ownerUserId === owner).sort((a, b) => a.lender.localeCompare(b.lender)).map(clone);
  }
  async putOverlay(x: Overlay) {
    this.o.set(x.id, clone(x));
  }
  async removeOverlay(owner: string, id: string) {
    if (this.o.get(id)?.ownerUserId === owner) this.o.delete(id);
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

class NeonLoaStore implements LoaStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= Promise.all([
      this.q(`CREATE TABLE IF NOT EXISTS cc_loa_files (loan_id text PRIMARY KEY, owner_user_id text NOT NULL, data jsonb NOT NULL)`),
      this.q(`CREATE TABLE IF NOT EXISTS cc_loa_overlays (id text PRIMARY KEY, owner_user_id text NOT NULL, data jsonb NOT NULL)`),
    ]).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async file(id: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_loa_files WHERE loan_id = $1`, [id]);
    return r[0] ? parse<LoaFile>(r[0].data) : null;
  }
  async putFile(x: LoaFile) {
    await this.init();
    await this.q(`INSERT INTO cc_loa_files (loan_id, owner_user_id, data) VALUES ($1,$2,$3) ON CONFLICT (loan_id) DO UPDATE SET data = EXCLUDED.data`, [x.loanId, x.ownerUserId, JSON.stringify(x)]);
  }
  async filesFor(owner: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_loa_files WHERE owner_user_id = $1`, [owner])).map((x) => parse<LoaFile>(x.data));
  }
  async overlays(owner: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_loa_overlays WHERE owner_user_id = $1`, [owner])).map((x) => parse<Overlay>(x.data)).sort((a, b) => a.lender.localeCompare(b.lender));
  }
  async putOverlay(x: Overlay) {
    await this.init();
    await this.q(`INSERT INTO cc_loa_overlays (id, owner_user_id, data) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [x.id, x.ownerUserId, JSON.stringify(x)]);
  }
  async removeOverlay(owner: string, id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_loa_overlays WHERE id = $1 AND owner_user_id = $2`, [id, owner]);
  }
}

let override: LoaStore | null = null;
let neonStore: NeonLoaStore | null = null;
const g = globalThis as unknown as { __lm8LoaMemory?: MemoryLoaStore };
const memory = (g.__lm8LoaMemory ??= new MemoryLoaStore());
export const setLoaStoreForTests = (s: LoaStore | null) => void (override = s);
export const newMemoryLoaStore = (): LoaStore => new MemoryLoaStore();
export function loaStore(): LoaStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonLoaStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}
