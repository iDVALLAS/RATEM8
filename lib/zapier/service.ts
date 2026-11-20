/**
 * lib/zapier/service.ts — Zapier (and Make, n8n, Pipedream) connections
 * out of Command Center (D65). SERVER-ONLY.
 *
 * The owner: "Zapier connections for power dialer or any other features
 * that are wanted such as power caller". Two directions:
 *  - Out: the loan officer pastes a Zapier "Catch Hook" address for an
 *    event, and Command Center posts to it: today's call list (on demand,
 *    for a power dialer), a new lead, a loan update, a client's reply.
 *  - In: a dialer's call results come back to /api/zapier/call with their
 *    key, and each is logged on the contact like a hand-logged call
 *    (asked-to-stop and wrong numbers are honored there).
 * The call list is the call session's (D11): only people the contact rules
 * allow right now. Florida, Oklahoma and Maryland regulate automated dialing
 * with their own consent rules, so people there go to a dialer only with
 * written permission to call; otherwise they stay on the hand-dialed list.
 * Hook addresses are sealed: they work like passwords.
 */
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { CONFIG } from "@/lib/config";
import { summarize } from "@/lib/contacts/service";
import { contactStore } from "@/lib/contacts/store";
import { toE164 } from "@/lib/contacts/normalize";
import { databaseUrl } from "@/lib/m8/server";
import { seal, unseal } from "@/lib/mail/seal";
import { callQueue, logCall, type CallResult } from "@/lib/calls/session";

export const EVENTS = {
  call_list: { label: "Call list for your dialer", when: "When you press \"Send this list to my dialer\" on Call session: today's people the contact rules allow to be called." },
  lead_created: { label: "New lead", when: "Each new lead from your lead vendors or web forms." },
  loan_updated: { label: "Loan update", when: "Each loan status change from your loan system." },
  client_replied: { label: "A client replied", when: "Each text reply from a client (who replied, not what they wrote)." },
} as const;
export type ZapEvent = keyof typeof EVENTS;
export const ZAP_EVENTS = Object.keys(EVENTS) as ZapEvent[];
/** States with their own autodialer consent laws (Fla. Stat. 501.059, Okla. 15 O.S. 775C, Md. Com. Law 14-4501). */
export const AUTODIALER_STATES = ["FL", "OK", "MD"];
export const MAX_HOOKS = 20;

export type Hook = { id: string; ownerUserId: string; event: ZapEvent; label: string; urlSealed: string; host: string; createdAt: string; lastAt: string | null; lastOk: boolean | null };

export interface HookStore {
  list(owner: string): Promise<Hook[]>;
  put(h: Hook): Promise<void>;
  remove(owner: string, id: string): Promise<void>;
}
class Memory implements HookStore {
  private m = new Map<string, Hook>();
  async list(o: string) {
    return [...this.m.values()].filter((h) => h.ownerUserId === o).map((h) => ({ ...h }));
  }
  async put(h: Hook) {
    this.m.set(h.id, { ...h });
  }
  async remove(o: string, id: string) {
    if (this.m.get(id)?.ownerUserId === o) this.m.delete(id);
  }
}
type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
class Neon implements HookStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= this.q(`CREATE TABLE IF NOT EXISTS cc_zap_hooks (id text PRIMARY KEY, owner_user_id text NOT NULL, data jsonb NOT NULL)`).catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async list(o: string) {
    await this.init();
    return (await this.q(`SELECT data FROM cc_zap_hooks WHERE owner_user_id = $1`, [o])).map((x) => parse<Hook>(x.data));
  }
  async put(h: Hook) {
    await this.init();
    await this.q(`INSERT INTO cc_zap_hooks (id, owner_user_id, data) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [h.id, h.ownerUserId, JSON.stringify(h)]);
  }
  async remove(o: string, id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_zap_hooks WHERE id = $1 AND owner_user_id = $2`, [id, o]);
  }
}
let override: HookStore | null = null;
let neonStore: Neon | null = null;
const g = globalThis as unknown as { __lm8ZapMemory?: Memory };
const memory = (g.__lm8ZapMemory ??= new Memory());
export const setHookStoreForTests = (s: HookStore | null) => void (override = s);
export const newMemoryHookStore = (): HookStore => new Memory();
export function hookStore(): HookStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new Neon((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}

const iso = (d: Date) => d.toISOString();

/** An https address on a public host (never this server's own network). */
export function checkHookUrl(raw: string): { ok: true; url: string; host: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Paste the full address Zapier gave you (it starts with https://hooks.zapier.com/)." };
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:") return { ok: false, error: "The address must start with https://." };
  if (u.username || u.password || u.port) return { ok: false, error: "That address isn't a plain web address." };
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^[\d.]+$/.test(host) || host.includes(":") || !host.includes(".")) return { ok: false, error: "Use the hook address from Zapier, Make, n8n or Pipedream." };
  return { ok: true, url: u.toString(), host };
}

export async function addHook(user: User, event: string, rawUrl: string, label: string, now = new Date()): Promise<{ ok: true; hook: Hook } | { ok: false; error: string }> {
  if (!(ZAP_EVENTS as string[]).includes(event)) return { ok: false, error: "Pick what to send." };
  const c = checkHookUrl(rawUrl);
  if (!c.ok) return c;
  if ((await hookStore().list(user.id)).length >= MAX_HOOKS) return { ok: false, error: `Up to ${MAX_HOOKS} connections.` };
  const hook: Hook = { id: `zh_${randomBytes(6).toString("base64url")}`, ownerUserId: user.id, event: event as ZapEvent, label: label.replace(/\s+/g, " ").trim().slice(0, 60) || EVENTS[event as ZapEvent].label, urlSealed: seal(c.url), host: c.host, createdAt: iso(now), lastAt: null, lastOk: null };
  await hookStore().put(hook);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "zapier.add", detail: { event, host: c.host } });
  return { ok: true, hook };
}

export const removeHook = (user: User, id: string) => hookStore().remove(user.id, id);

export type Poster = (url: string, body: unknown) => Promise<boolean>;
export const realPoster: Poster = async (url, body) => {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000), cache: "no-store", redirect: "error" });
    return res.ok;
  } catch {
    return false;
  }
};

/** Posts an event to every hook the loan officer set for it. Never throws. */
export async function emit(ownerUserId: string, event: ZapEvent, data: Record<string, unknown>, now = new Date(), post: Poster = realPoster): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const hooks = (await hookStore().list(ownerUserId).catch(() => [])).filter((h) => h.event === event);
  for (const h of hooks) {
    const url = unseal(h.urlSealed);
    const ok = url ? await post(url, { event, at: iso(now), source: "MLO Command Center", ...data }) : false;
    ok ? sent++ : failed++;
    await hookStore().put({ ...h, lastAt: iso(now), lastOk: ok }).catch(() => undefined);
  }
  return { sent, failed };
}

/** May this person go to an automated dialer? In FL, OK and MD only with written permission to call. */
export function dialerOk(state: string | null, permission: { granted: boolean; evidence?: string | null }): boolean {
  if (!state || !AUTODIALER_STATES.includes(state)) return true;
  return permission.granted && ["written", "web_form", "text_reply"].includes(permission.evidence ?? "");
}

const contactUrl = (id: string) => `${CONFIG.siteUrl.replace(/\/$/, "")}/mlo/contacts/${encodeURIComponent(id)}`;

/** Today's call list to the dialer: only people the contact rules allow now, with the autodialer states held back. */
export async function sendCallList(user: User, now = new Date(), post: Poster = realPoster): Promise<{ ok: true; sent: number; heldBack: number; hooks: number } | { ok: false; error: string }> {
  const hooks = (await hookStore().list(user.id)).filter((h) => h.event === "call_list");
  if (!hooks.length) return { ok: false, error: "Add your dialer's Zapier hook on Connections first (\"Call list for your dialer\")." };
  const { ready } = await callQueue(user, now);
  const people: Record<string, unknown>[] = [];
  let heldBack = 0;
  for (const it of ready) {
    const c = it.contact;
    if (c.state && AUTODIALER_STATES.includes(c.state) && !dialerOk(c.state, summarize(await contactStore().consents(c.id)).call[it.purpose])) {
      heldBack++;
      continue;
    }
    people.push({ firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email, state: c.state, reason: it.card.title, purpose: it.purpose, contactUrl: contactUrl(c.id) });
  }
  if (!people.length) return { ok: false, error: heldBack ? `Nobody to send: ${heldBack} ${heldBack === 1 ? "person is" : "people are"} in states that need written permission for dialers. Call them from Call session.` : "Nobody on today's list can be called right now." };
  const r = await emit(user.id, "call_list", { count: people.length, people }, now, post);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "zapier.call_list", detail: { count: people.length, heldBack } });
  return r.sent ? { ok: true, sent: people.length, heldBack, hooks: r.sent } : { ok: false, error: "Your dialer's hook didn't answer. Check the Zap is on." };
}

/** A dialer's disposition, in Command Center's words. */
export function resultFrom(raw: string): CallResult {
  const t = raw.toLowerCase();
  if (/do not call|dnc|stop|remove/.test(t)) return "asked_to_stop";
  if (/wrong/.test(t)) return "wrong_number";
  if (/appoint|book|scheduled|meeting|callback set|next step/.test(t)) return "booked";
  if (/not interested|not now/.test(t)) return "not_now";
  if (/voicemail|left message|\bvm\b|machine/.test(t)) return "voicemail";
  if (/no answer|busy|unanswered|missed|failed/.test(t)) return "no_answer";
  return "reached";
}

/** A call result from the dialer, logged on the loan officer's contact with that number. */
export async function logDialerCall(user: User, input: { phone: string; result: string; notes: string }, now = new Date()): Promise<{ ok: true; result: CallResult } | { ok: false; error: string }> {
  const phone = toE164(input.phone);
  if (!phone) return { ok: false, error: "No valid phone number." };
  const c = (await contactStore().findByPhone(phone)).find((x) => x.ownerUserId === user.id);
  if (!c) return { ok: false, error: "No contact with that number." };
  const result = resultFrom(input.result);
  const r = await logCall(user, c.id, result, `From your dialer: ${input.notes}`.slice(0, 600), "marketing", now);
  return r.ok ? { ok: true, result } : r;
}
