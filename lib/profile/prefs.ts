/**
 * lib/profile/prefs.ts — each person's own settings (D79): their time zone,
 * the new-lead alert (text / email / both / off) and the hours alerts may
 * arrive. SERVER-ONLY. Neon table cc_user_prefs when DATABASE_URL is set,
 * else memory.
 *
 * Alerts that arrive outside the hours wait in `held` (ids only) until the
 * hours open: the morning run or the loan officer's next page view sends
 * them as one alert.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/m8/server";
import type { User } from "@/lib/accounts/store";
import { mloById } from "@/lib/config";
import { toE164 } from "@/lib/contacts/normalize";
import { STATE_ZONES } from "@/lib/send-gate/rules";
import { DEFAULT_ZONE, isZone, type TimeZone } from "@/lib/inbox/state";

export const LEAD_ALERTS = ["email", "text", "both", "off"] as const;
export type LeadAlert = (typeof LEAD_ALERTS)[number];
export const HELD_MAX = 25;

export type Prefs = {
  userId: string;
  timeZone: TimeZone;
  leadAlert: LeadAlert;
  /** Notification hours, local [from, to). */
  alertFrom: number;
  alertTo: number;
  /** Where alert texts go (the loan officer's own mobile). */
  alertPhone: string | null;
  /** Alerts waiting for the hours to open: who, and when the lead came in. */
  held: { contactId: string; at: string }[];
  updatedAt: string | null;
};

/** Their zone from their first license, else Pacific (what Command Center showed before D79). */
export function defaultZone(user: Pick<User, "mloId">): TimeZone {
  const st = mloById(user.mloId)?.licenses?.[0]?.state;
  const z = st ? STATE_ZONES[st]?.[0] : undefined;
  return isZone(z) ? z : DEFAULT_ZONE;
}

export function defaultPrefs(user: Pick<User, "id" | "mloId">): Prefs {
  return { userId: user.id, timeZone: defaultZone(user), leadAlert: "email", alertFrom: 8, alertTo: 21, alertPhone: toE164(mloById(user.mloId)?.phone), held: [], updatedAt: null };
}

/** A stored row read safely: anything odd falls back to the default. */
function cleanStored(user: Pick<User, "id" | "mloId">, raw: Partial<Prefs> | null): Prefs {
  const d = defaultPrefs(user);
  if (!raw) return d;
  const hour = (v: unknown, lo: number, hi: number, dflt: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : dflt);
  return {
    userId: user.id,
    timeZone: isZone(raw.timeZone) ? raw.timeZone : d.timeZone,
    leadAlert: LEAD_ALERTS.includes(raw.leadAlert as LeadAlert) ? (raw.leadAlert as LeadAlert) : d.leadAlert,
    alertFrom: hour(raw.alertFrom, 0, 23, d.alertFrom),
    alertTo: hour(raw.alertTo, 1, 24, d.alertTo),
    alertPhone: raw.alertPhone === undefined ? d.alertPhone : typeof raw.alertPhone === "string" ? toE164(raw.alertPhone) : null,
    held: Array.isArray(raw.held) ? raw.held.filter((h) => h && typeof h.contactId === "string" && typeof h.at === "string").slice(-HELD_MAX) : [],
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

export type PrefsInput = { timeZone?: unknown; leadAlert?: unknown; alertFrom?: unknown; alertTo?: unknown; alertPhone?: unknown };
export type PrefsCheck = { ok: true; values: Pick<Prefs, "timeZone" | "leadAlert" | "alertFrom" | "alertTo" | "alertPhone"> } | { ok: false; errors: Partial<Record<keyof PrefsInput, string>> };

/** The settings form, checked. */
export function checkPrefs(input: PrefsInput): PrefsCheck {
  const errors: Partial<Record<keyof PrefsInput, string>> = {};
  const timeZone = isZone(input.timeZone) ? input.timeZone : null;
  if (!timeZone) errors.timeZone = "Pick your time zone.";
  const leadAlert = LEAD_ALERTS.includes(input.leadAlert as LeadAlert) ? (input.leadAlert as LeadAlert) : null;
  if (!leadAlert) errors.leadAlert = "Pick how to hear about new leads.";
  const from = Number(input.alertFrom);
  const to = Number(input.alertTo);
  if (!Number.isInteger(from) || from < 0 || from > 23) errors.alertFrom = "Pick a start hour.";
  if (!Number.isInteger(to) || to < 1 || to > 24) errors.alertTo = "Pick an end hour.";
  else if (from === to) errors.alertTo = "Pick an end hour different from the start.";
  const rawPhone = typeof input.alertPhone === "string" ? input.alertPhone.trim() : "";
  const alertPhone = rawPhone ? toE164(rawPhone) : null;
  if (rawPhone && !alertPhone) errors.alertPhone = "That isn't a US mobile number.";
  else if (!alertPhone && (leadAlert === "text" || leadAlert === "both")) errors.alertPhone = "Add your mobile number for alert texts.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { timeZone: timeZone!, leadAlert: leadAlert!, alertFrom: from, alertTo: to, alertPhone } };
}

export interface PrefsStore {
  get(userId: string): Promise<Partial<Prefs> | null>;
  put(p: Prefs): Promise<void>;
  /** People with alerts waiting (the morning run sends them). */
  heldOwners(): Promise<string[]>;
}

export class MemoryPrefsStore implements PrefsStore {
  private m = new Map<string, Prefs>();
  async get(u: string) {
    const p = this.m.get(u);
    return p ? structuredClone(p) : null;
  }
  async put(p: Prefs) {
    this.m.set(p.userId, structuredClone(p));
  }
  async heldOwners() {
    return [...this.m.values()].filter((p) => p.held.length).map((p) => p.userId);
  }
}

type Row = Record<string, unknown>;
type Query = (t: string, p?: unknown[]) => Promise<Row[]>;
export class NeonPrefsStore implements PrefsStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Query) {}
  private init() {
    return (this.ready ??= this.q(`CREATE TABLE IF NOT EXISTS cc_user_prefs (user_id text PRIMARY KEY, body jsonb NOT NULL, held_count int NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL)`).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async get(u: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_user_prefs WHERE user_id = $1`, [u]);
    return r[0] ? (r[0].body as Partial<Prefs>) : null;
  }
  async put(p: Prefs) {
    await this.init();
    await this.q(`INSERT INTO cc_user_prefs (user_id, body, held_count, updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (user_id) DO UPDATE SET body = EXCLUDED.body, held_count = EXCLUDED.held_count, updated_at = now()`, [p.userId, JSON.stringify(p), p.held.length]);
  }
  async heldOwners() {
    await this.init();
    return (await this.q(`SELECT user_id FROM cc_user_prefs WHERE held_count > 0 LIMIT 500`)).map((r) => String(r.user_id));
  }
}

let override: PrefsStore | null = null;
let neonStore: NeonPrefsStore | null = null;
const g = globalThis as unknown as { __lm8PrefsMemory?: MemoryPrefsStore };
const memory = (g.__lm8PrefsMemory ??= new MemoryPrefsStore());
export const setPrefsStoreForTests = (s: PrefsStore | null) => void (override = s);
export function prefsStore(): PrefsStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonPrefsStore((t, p) => sql.query(t, p ?? []) as Promise<Row[]>);
  }
  return neonStore;
}

/** This person's settings (defaults until they save). */
export async function prefsFor(user: Pick<User, "id" | "mloId">): Promise<Prefs> {
  return cleanStored(user, await prefsStore().get(user.id).catch(() => null));
}

/** Their time zone alone (every page that shows a time uses it). */
export async function zoneFor(user: Pick<User, "id" | "mloId">): Promise<TimeZone> {
  return (await prefsFor(user)).timeZone;
}

/** Saves the settings form. Held alerts stay as they are. */
export async function savePrefs(user: Pick<User, "id" | "mloId">, input: PrefsInput, now = new Date()): Promise<PrefsCheck> {
  const r = checkPrefs(input);
  if (!r.ok) return r;
  const cur = await prefsFor(user);
  await prefsStore().put({ ...cur, ...r.values, updatedAt: now.toISOString() });
  return r;
}

/** Adds an alert to the waiting list (newest kept). */
export async function holdAlert(user: Pick<User, "id" | "mloId">, contactId: string, at: string): Promise<void> {
  const cur = await prefsFor(user);
  if (cur.held.some((h) => h.contactId === contactId)) return;
  await prefsStore().put({ ...cur, held: [...cur.held, { contactId, at }].slice(-HELD_MAX) });
}

/** Empties the waiting list and returns what was on it. */
export async function takeHeld(user: Pick<User, "id" | "mloId">): Promise<{ contactId: string; at: string }[]> {
  const cur = await prefsFor(user);
  if (!cur.held.length) return [];
  await prefsStore().put({ ...cur, held: [] });
  return cur.held;
}
