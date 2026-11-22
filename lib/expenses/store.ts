/**
 * lib/expenses/store.ts — a loan officer's own business expenses, income,
 * miles and receipts (D37). SERVER-ONLY.
 *
 * Private to each person: every read and write is by owner id, and no
 * role (not even the owner of the company) can see someone else's.
 * Receipts are kept in the database (Neon), up to 5MB each.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { Category } from "./categories";

export type Entry = {
  id: string;
  ownerUserId: string;
  /** "charity": miles driven for a charity, kept apart from the business books (Schedule A, not Schedule C). */
  kind: "expense" | "income" | "mileage" | "charity";
  date: string;
  /** Expenses and income; for miles, worked out from the rate on the trip's date. */
  amountCents: number;
  miles: number | null;
  vendor: string;
  category: Category;
  /** Share used for business, 1–100 (a phone used half for work is 50). */
  businessPct: number;
  purpose: string;
  /** Who received a gift (for the $25-per-person rule), else null. */
  recipient: string | null;
  receiptId: string | null;
  /** D83: "monthly" = made from a monthly amount set on Lead sources (a draft to confirm, like the others). */
  source: "typed" | "m8" | "receipt" | "monthly";
  /**
   * D83: the lead source this spend was for (`sourceKey()`: "zillow", "past-clients-sphere"), or null when it isn't
   * lead spend. Spend and leads join on it (the scorecard, D84).
   */
  leadSource: string | null;
  status: "draft" | "confirmed";
  createdAt: string;
  updatedAt: string;
};

export type Receipt = { id: string; ownerUserId: string; name: string; type: string; size: number; data: string; createdAt: string };
export type TaxProfile = { ownerUserId: string; year: number; homeOfficeSqFt: number; notes: string; updatedAt: string };

export interface ExpenseStore {
  put(e: Entry): Promise<void>;
  get(owner: string, id: string): Promise<Entry | null>;
  list(owner: string, year: number | null): Promise<Entry[]>;
  remove(owner: string, id: string): Promise<void>;
  putReceipt(r: Receipt): Promise<void>;
  receipt(owner: string, id: string): Promise<Receipt | null>;
  receipts(owner: string): Promise<Omit<Receipt, "data">[]>;
  profile(owner: string, year: number): Promise<TaxProfile | null>;
  putProfile(p: TaxProfile): Promise<void>;
}

export class MemoryExpenseStore implements ExpenseStore {
  private e = new Map<string, Entry>();
  private r = new Map<string, Receipt>();
  private p = new Map<string, TaxProfile>();
  async put(x: Entry) {
    this.e.set(x.id, { ...x, leadSource: x.leadSource ?? null });
  }
  async get(owner: string, id: string) {
    const x = this.e.get(id);
    return x && x.ownerUserId === owner ? { ...x } : null;
  }
  async list(owner: string, year: number | null) {
    return [...this.e.values()].filter((x) => x.ownerUserId === owner && (year === null || x.date.startsWith(`${year}-`))).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }
  async remove(owner: string, id: string) {
    if (this.e.get(id)?.ownerUserId === owner) this.e.delete(id);
  }
  async putReceipt(x: Receipt) {
    this.r.set(x.id, { ...x });
  }
  async receipt(owner: string, id: string) {
    const x = this.r.get(id);
    return x && x.ownerUserId === owner ? x : null;
  }
  async receipts(owner: string) {
    return [...this.r.values()].filter((x) => x.ownerUserId === owner).map(({ data: _d, ...rest }) => rest);
  }
  async profile(owner: string, year: number) {
    return this.p.get(`${owner}:${year}`) ?? null;
  }
  async putProfile(x: TaxProfile) {
    this.p.set(`${x.ownerUserId}:${x.year}`, { ...x });
  }
}

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
const iso = (v: unknown) => new Date(v as string).toISOString();

export class NeonExpenseStore implements ExpenseStore {
  private ready: Promise<void> | null = null;
  constructor(private q: Query) {}
  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.q(`CREATE TABLE IF NOT EXISTS cc_expenses (id text PRIMARY KEY, owner_user_id text NOT NULL, kind text NOT NULL, date date NOT NULL, amount_cents integer NOT NULL, miles numeric, vendor text NOT NULL, category text NOT NULL, business_pct integer NOT NULL, purpose text NOT NULL, recipient text, receipt_id text, source text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)`);
        await this.q(`CREATE INDEX IF NOT EXISTS cc_expenses_owner ON cc_expenses (owner_user_id, date)`);
        // D83: the lead source of lead spend (existing rows stay null).
        await this.q(`ALTER TABLE cc_expenses ADD COLUMN IF NOT EXISTS lead_source text`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_expense_receipts (id text PRIMARY KEY, owner_user_id text NOT NULL, name text NOT NULL, type text NOT NULL, size integer NOT NULL, data text NOT NULL, created_at timestamptz NOT NULL)`);
        await this.q(`CREATE TABLE IF NOT EXISTS cc_tax_profiles (owner_user_id text NOT NULL, year integer NOT NULL, home_office_sqft integer NOT NULL, notes text NOT NULL, updated_at timestamptz NOT NULL, PRIMARY KEY (owner_user_id, year))`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }
  private toEntry = (r: Row): Entry => ({ id: r.id as string, ownerUserId: r.owner_user_id as string, kind: r.kind as Entry["kind"], date: iso(r.date).slice(0, 10), amountCents: Number(r.amount_cents), miles: r.miles === null || r.miles === undefined ? null : Number(r.miles), vendor: r.vendor as string, category: r.category as Category, businessPct: Number(r.business_pct), purpose: r.purpose as string, recipient: (r.recipient as string | null) ?? null, receiptId: (r.receipt_id as string | null) ?? null, source: r.source as Entry["source"], leadSource: (r.lead_source as string | null) ?? null, status: r.status as Entry["status"], createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
  async put(e: Entry) {
    await this.init();
    await this.q(
      `INSERT INTO cc_expenses (id, owner_user_id, kind, date, amount_cents, miles, vendor, category, business_pct, purpose, recipient, receipt_id, source, status, created_at, updated_at, lead_source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, date = EXCLUDED.date, amount_cents = EXCLUDED.amount_cents, miles = EXCLUDED.miles, vendor = EXCLUDED.vendor, category = EXCLUDED.category, business_pct = EXCLUDED.business_pct, purpose = EXCLUDED.purpose, recipient = EXCLUDED.recipient, receipt_id = EXCLUDED.receipt_id, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at, lead_source = EXCLUDED.lead_source
       WHERE cc_expenses.owner_user_id = EXCLUDED.owner_user_id`,
      [e.id, e.ownerUserId, e.kind, e.date, e.amountCents, e.miles, e.vendor, e.category, e.businessPct, e.purpose, e.recipient, e.receiptId, e.source, e.status, e.createdAt, e.updatedAt, e.leadSource ?? null],
    );
  }
  async get(owner: string, id: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_expenses WHERE id = $1 AND owner_user_id = $2`, [id, owner]);
    return r[0] ? this.toEntry(r[0]) : null;
  }
  async list(owner: string, year: number | null) {
    await this.init();
    const r = year === null ? await this.q(`SELECT * FROM cc_expenses WHERE owner_user_id = $1 ORDER BY date DESC, created_at DESC LIMIT 2000`, [owner]) : await this.q(`SELECT * FROM cc_expenses WHERE owner_user_id = $1 AND date >= $2 AND date < $3 ORDER BY date DESC, created_at DESC`, [owner, `${year}-01-01`, `${year + 1}-01-01`]);
    return r.map(this.toEntry);
  }
  async remove(owner: string, id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_expenses WHERE id = $1 AND owner_user_id = $2`, [id, owner]);
  }
  async putReceipt(x: Receipt) {
    await this.init();
    await this.q(`INSERT INTO cc_expense_receipts (id, owner_user_id, name, type, size, data, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [x.id, x.ownerUserId, x.name, x.type, x.size, x.data, x.createdAt]);
  }
  async receipt(owner: string, id: string) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_expense_receipts WHERE id = $1 AND owner_user_id = $2`, [id, owner]);
    return r[0] ? { id: r[0].id as string, ownerUserId: r[0].owner_user_id as string, name: r[0].name as string, type: r[0].type as string, size: Number(r[0].size), data: r[0].data as string, createdAt: iso(r[0].created_at) } : null;
  }
  async receipts(owner: string) {
    await this.init();
    const r = await this.q(`SELECT id, owner_user_id, name, type, size, created_at FROM cc_expense_receipts WHERE owner_user_id = $1 ORDER BY created_at`, [owner]);
    return r.map((x) => ({ id: x.id as string, ownerUserId: x.owner_user_id as string, name: x.name as string, type: x.type as string, size: Number(x.size), createdAt: iso(x.created_at) }));
  }
  async profile(owner: string, year: number) {
    await this.init();
    const r = await this.q(`SELECT * FROM cc_tax_profiles WHERE owner_user_id = $1 AND year = $2`, [owner, year]);
    return r[0] ? { ownerUserId: owner, year, homeOfficeSqFt: Number(r[0].home_office_sqft), notes: r[0].notes as string, updatedAt: iso(r[0].updated_at) } : null;
  }
  async putProfile(p: TaxProfile) {
    await this.init();
    await this.q(`INSERT INTO cc_tax_profiles (owner_user_id, year, home_office_sqft, notes, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (owner_user_id, year) DO UPDATE SET home_office_sqft = EXCLUDED.home_office_sqft, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at`, [p.ownerUserId, p.year, p.homeOfficeSqFt, p.notes, p.updatedAt]);
  }
}

let override: ExpenseStore | null = null;
let neonStore: NeonExpenseStore | null = null;
const g = globalThis as unknown as { __lm8ExpenseMemory?: MemoryExpenseStore };
const memory = (g.__lm8ExpenseMemory ??= new MemoryExpenseStore());

export function setExpenseStoreForTests(s: ExpenseStore | null) {
  override = s;
}

export function expenseStore(): ExpenseStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonExpenseStore((text, params) => sql.query(text, params ?? []) as Promise<Row[]>);
  }
  return neonStore;
}
