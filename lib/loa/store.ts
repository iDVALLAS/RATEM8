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
import { isCapKey, isMode, type CapKey, type Mode, type Modes } from "./autonomy";

export const PARTY_ROLES = ["buyer_agent", "listing_agent", "escrow", "title", "lender", "insurance"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];
/**
 * D70: where a party came from. "document" = read from a document (never
 * trusted as a recipient on its own); "lo" = typed by the loan officer. An
 * email is a safe recipient only once the loan officer entered or confirmed it.
 * Parties saved before D70 have no source and count as read from a document.
 */
export type Party = { role: PartyRole; company: string; name: string; email: string; phone: string; source?: "document" | "lo"; confirmedAt?: string | null; confirmedBy?: string | null };

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
  /** D70: the parties the contract itself named (open escrow / order title go Full-auto only for these). */
  named?: PartyRole[];
  /** D70: fields the loan officer entered or confirmed; a later document never overwrites them. */
  fields?: Partial<Record<ContractField, { source: "document" | "lo"; confirmedAt: string | null }>>;
};
export const CONTRACT_FIELDS = ["price", "sellerCredits", "earnestMoney", "property", "mutualAcceptance", "earnestMoneyDue", "inspectionEnds", "financingContingencyEnds", "appraisalContingencyEnds", "closingDate", "possession"] as const;
export type ContractField = (typeof CONTRACT_FIELDS)[number];

/** D70: a new document disagreed with a value the loan officer entered or confirmed. Nothing changes until they choose. */
export type ReviewChange = { id: string; kind: "party" | "contract"; role: PartyRole | null; field: string; label: string; was: string; now: string; next: unknown; at: string };

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

/**
 * A message the LOA prepared for a third party. D70 adds the switch it came
 * from (`cap`, `mode`), when a queued one may go (`sendAfter`, D71) and who
 * approved it. "queued" / "held" / "stopped" are D71's autopilot states.
 *
 * D71: a Full-auto text to the client or their agent waits here too
 * (`to` "client" / "agent", `channel` "text", `contactId`), so Stop works the
 * same for every message. It still goes only through sendText and the gate.
 */
export type DraftTo = PartyRole | "client" | "agent";
export type Draft = {
  id: string; to: DraftTo; toName: string; toEmail: string; subject: string; body: string;
  kind: "escrow_fees" | "open_title" | "open_escrow" | "payoffs" | "insurance" | "conditions_lo" | "borrower_conditions" | "client_update" | "agent_update" | "other";
  status: "draft" | "queued" | "held" | "stopped" | "sent" | "discarded";
  createdAt: string; sentAt: string | null;
  cap?: CapKey; mode?: Mode; sendAfter?: string | null; approvedBy?: string | null;
  /** D71: "morning" = with the next morning run (the default); "soon" = the undo window (15 minutes). */
  when?: "morning" | "soon";
  /** D71: the planner wanted Full-auto; why it asks the loan officer instead (shown on screen). */
  autoReason?: string | null;
  wanted?: Mode;
  /** D71: a fingerprint of the fixed template as planned (to, subject, body), so an edited body never goes on its own. */
  fixed?: string;
  channel?: "email" | "text";
  contactId?: string | null;
  /** D71: 0 for the first message, 1–2 for follow-ups. */
  followUp?: number;
};

/**
 * D71: one line of "What your LOA did". Never the message or the address
 * (`toRole` only). `ref` is the draft it was about, for Stop and corrections.
 */
export type AutoEntry = { at: string; cap: CapKey; mode: Mode; action: string; toRole: string; status: "queued" | "sent" | "stopped" | "held" | "failed" | "done"; reason: string | null; ref?: string | null };

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
  /** D70: this loan's own switches (only the ones changed "just this loan"). */
  autonomy?: Partial<Record<CapKey, Mode>>;
  /** D70: nothing automatic on this loan. */
  paused?: boolean;
  /** D70: the loan officer's answer when the loan system doesn't say purchase or refinance. */
  purposeOverride?: "purchase" | "refi";
  /** D70: is there an HOA or condo association (null = not answered). */
  hoa?: boolean | null;
  /** D70: a confirmed escrow or title email changed in a new document: everything automatic waits. */
  hold?: { role: PartyRole; reason: string; at: string } | null;
  /** D70: differences a new document found, waiting for the loan officer. */
  review?: ReviewChange[];
  /** D71: what the autopilot did on this loan, newest last, the last 100. */
  auto?: AutoEntry[];
};

export const emptyFile = (loanId: string, ownerUserId: string): LoaFile => ({ loanId, ownerUserId, contract: null, parties: [], deadlines: [], title: null, escrowFees: null, conditions: [], approvalReceivedAt: null, checks: {}, drafts: [], log: [], updatedAt: "", autonomy: {}, paused: false, hoa: null, hold: null, review: [], auto: [] });

/**
 * D70: one loan officer's LOA switches. `modes` holds only what they set;
 * everything else is the task's default, and every value is clamped to the
 * task's maximum when it's read (lib/loa/autonomy.ts effectiveMode).
 * `undoMinutes` and `dailyAutoSends` are used by the autopilot (D71).
 * D71 `sendWhen`: Full-auto messages go with the next morning run (the
 * owner's default), or `undoMinutes` after they're ready ("soon").
 */
export type LoaAutonomy = { ownerUserId: string; modes: Modes; undoMinutes: number; dailyAutoSends: number; sendWhen: "morning" | "soon"; pausedUntil: string | null; updatedAt: string };

export const defaultAutonomy = (ownerUserId: string): LoaAutonomy => ({ ownerUserId, modes: { purchase: {}, refi: {} }, undoMinutes: 15, dailyAutoSends: 15, sendWhen: "morning", pausedUntil: null, updatedAt: "" });

/** Merges a stored row over the defaults, dropping anything unknown. */
export function withAutonomyDefaults(ownerUserId: string, raw: Partial<LoaAutonomy> | null | undefined): LoaAutonomy {
  const d = defaultAutonomy(ownerUserId);
  if (!raw) return d;
  const clean = (m: unknown): Partial<Record<CapKey, Mode>> => {
    const out: Partial<Record<CapKey, Mode>> = {};
    if (m && typeof m === "object") for (const [k, v] of Object.entries(m)) if (isCapKey(k) && isMode(v)) out[k] = v;
    return out;
  };
  const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);
  return {
    ownerUserId,
    modes: { purchase: clean(raw.modes?.purchase), refi: clean(raw.modes?.refi) },
    undoMinutes: num(raw.undoMinutes, 0, 120, d.undoMinutes),
    dailyAutoSends: num(raw.dailyAutoSends, 0, 50, d.dailyAutoSends),
    sendWhen: raw.sendWhen === "soon" ? "soon" : "morning",
    pausedUntil: typeof raw.pausedUntil === "string" ? raw.pausedUntil : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

/** A lender's overlays, read once from what the loan officer uploaded. */
export type Overlay = { id: string; ownerUserId: string; lender: string; title: string; rules: string; chars: number; createdAt: string };

export interface LoaStore {
  file(loanId: string): Promise<LoaFile | null>;
  putFile(f: LoaFile): Promise<void>;
  filesFor(owner: string): Promise<LoaFile[]>;
  overlays(owner: string): Promise<Overlay[]>;
  putOverlay(o: Overlay): Promise<void>;
  removeOverlay(owner: string, id: string): Promise<void>;
  /** D70: the loan officer's switches, defaults merged in. */
  autonomy(owner: string): Promise<LoaAutonomy>;
  putAutonomy(x: LoaAutonomy): Promise<void>;
  /** D71: loan officers with switches saved, or with a message waiting to go on its own. */
  activeOwners(): Promise<string[]>;
  /** D71: loan officers with a message waiting to go on its own. */
  queuedOwners(): Promise<string[]>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

class MemoryLoaStore implements LoaStore {
  private f = new Map<string, LoaFile>();
  private o = new Map<string, Overlay>();
  private a = new Map<string, LoaAutonomy>();
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
  async autonomy(owner: string) {
    return withAutonomyDefaults(owner, this.a.get(owner) ?? null);
  }
  async putAutonomy(x: LoaAutonomy) {
    this.a.set(x.ownerUserId, clone(x));
  }
  async queuedOwners() {
    return [...new Set([...this.f.values()].filter((x) => x.drafts.some((d) => d.status === "queued")).map((x) => x.ownerUserId))];
  }
  async activeOwners() {
    return [...new Set([...this.a.keys(), ...(await this.queuedOwners())])];
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
      this.q(`CREATE TABLE IF NOT EXISTS cc_loa_autonomy (owner_user_id text PRIMARY KEY, data jsonb NOT NULL)`),
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
  async autonomy(owner: string) {
    await this.init();
    const r = await this.q(`SELECT data FROM cc_loa_autonomy WHERE owner_user_id = $1`, [owner]);
    return withAutonomyDefaults(owner, r[0] ? parse<LoaAutonomy>(r[0].data) : null);
  }
  async putAutonomy(x: LoaAutonomy) {
    await this.init();
    await this.q(`INSERT INTO cc_loa_autonomy (owner_user_id, data) VALUES ($1,$2) ON CONFLICT (owner_user_id) DO UPDATE SET data = EXCLUDED.data`, [x.ownerUserId, JSON.stringify(x)]);
  }
  async queuedOwners() {
    await this.init();
    return (await this.q(`SELECT DISTINCT owner_user_id FROM cc_loa_files WHERE data->'drafts' @> '[{"status":"queued"}]'::jsonb`)).map((r) => String(r.owner_user_id));
  }
  async activeOwners() {
    await this.init();
    return (await this.q(`SELECT owner_user_id FROM cc_loa_autonomy UNION SELECT DISTINCT owner_user_id FROM cc_loa_files WHERE data->'drafts' @> '[{"status":"queued"}]'::jsonb`)).map((r) => String(r.owner_user_id));
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
