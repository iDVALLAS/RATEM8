/**
 * lib/contacts/lists.ts — saved lists (D78). SERVER-ONLY.
 *
 * A saved list is a name and a `ListRule` (lib/contacts/filter.ts), kept per
 * user in `cc_saved_lists` (Neon) or in memory. Lists are live: opening one
 * runs its rule again, so anyone who fits later is in it. Four built-in lists
 * (New this week, Needs permission, Past clients, Agents) are written in code
 * and can't be renamed or deleted.
 *
 * D80: a list can be frozen ("Freeze this list"): today's people get a tag
 * and the list's rule becomes that tag, so people who fit later don't join.
 * `saveSuggested` saves the lists picked at import (a rule that's already a
 * list links to it instead of making a second one).
 *
 * `peopleIn` is the one way the bulk actions, campaigns and the call session
 * read a list: the viewer's own scope (`scopeOf`), and `canSee` for everyone.
 */
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { User } from "@/lib/accounts/store";
import { databaseUrl } from "@/lib/m8/server";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { cleanRule, isEmptyRule, ListRuleSchema, sameRule, type ListRule } from "./filter";
import { canSee, scopeOf } from "./service";
import { contactStore, type Contact } from "./store";

export type SavedList = { id: string; userId: string; name: string; rule: ListRule; createdAt: string; updatedAt: string; frozen?: { at: string; tag: string } | null };
export type ListRef = { id: string; name: string; rule: ListRule; builtIn: boolean; frozenAt?: string | null };

export const MAX_LISTS = 30;
export const MAX_LIST_NAME = 60;
/** People one list action reads at most (bulk, campaign, download). */
export const MAX_LIST_PEOPLE = 25_000;

/** The four lists everyone starts with. */
export const DEFAULT_LISTS: ListRef[] = [
  { id: "d-new", name: lc.defaults.new, rule: { addedWithinDays: 7 }, builtIn: true },
  { id: "d-perm", name: lc.defaults.perm, rule: { permission: "relationship" }, builtIn: true },
  { id: "d-past", name: lc.defaults.past, rule: { relationship: "past_client" }, builtIn: true },
  { id: "d-agents", name: lc.defaults.agents, rule: { kind: "agent" }, builtIn: true },
];

export interface ListStore {
  forUser(userId: string): Promise<SavedList[]>;
  get(id: string): Promise<SavedList | null>;
  put(l: SavedList): Promise<void>;
  remove(id: string): Promise<void>;
}

export class MemoryListStore implements ListStore {
  private rows = new Map<string, SavedList>();
  async forUser(userId: string) {
    return [...this.rows.values()].filter((l) => l.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((l) => structuredClone(l));
  }
  async get(id: string) {
    const l = this.rows.get(id);
    return l ? structuredClone(l) : null;
  }
  async put(l: SavedList) {
    this.rows.set(l.id, structuredClone(l));
  }
  async remove(id: string) {
    this.rows.delete(id);
  }
}

type Q = (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]>;
const body = (r: Record<string, unknown>): SavedList => (typeof r.body === "string" ? JSON.parse(r.body) : r.body) as SavedList;

export class NeonListStore implements ListStore {
  private ready: Promise<unknown> | null = null;
  constructor(private q: Q) {}
  private init() {
    return (this.ready ??= (async () => {
      await this.q(`CREATE TABLE IF NOT EXISTS cc_saved_lists (id text PRIMARY KEY, user_id text NOT NULL, name text NOT NULL, body jsonb NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)`);
      await this.q(`CREATE INDEX IF NOT EXISTS cc_saved_lists_user ON cc_saved_lists (user_id, created_at)`);
    })().catch((e) => {
      this.ready = null;
      throw e;
    }));
  }
  async forUser(userId: string) {
    await this.init();
    return (await this.q(`SELECT body FROM cc_saved_lists WHERE user_id = $1 ORDER BY created_at LIMIT ${MAX_LISTS * 2}`, [userId])).map(body);
  }
  async get(id: string) {
    await this.init();
    const r = await this.q(`SELECT body FROM cc_saved_lists WHERE id = $1`, [id]);
    return r[0] ? body(r[0]) : null;
  }
  async put(l: SavedList) {
    await this.init();
    await this.q(`INSERT INTO cc_saved_lists (id, user_id, name, body, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at`, [l.id, l.userId, l.name, JSON.stringify(l), l.createdAt, l.updatedAt]);
  }
  async remove(id: string) {
    await this.init();
    await this.q(`DELETE FROM cc_saved_lists WHERE id = $1`, [id]);
  }
}

let override: ListStore | null = null;
let neonStore: NeonListStore | null = null;
const g = globalThis as unknown as { __lm8ListMemory?: MemoryListStore };
const memory = (g.__lm8ListMemory ??= new MemoryListStore());
export const setListStoreForTests = (s: ListStore | null) => void (override = s);
export function listStore(): ListStore {
  if (override) return override;
  const url = databaseUrl();
  if (!url) return memory;
  if (!neonStore) {
    const sql = neon(url);
    neonStore = new NeonListStore((t, p) => sql.query(t, p ?? []) as Promise<Record<string, unknown>[]>);
  }
  return neonStore;
}

const tidyName = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_LIST_NAME);

/** The built-in lists, then the user's own (oldest first). */
export async function listsFor(user: User): Promise<ListRef[]> {
  if (user.status !== "active") return DEFAULT_LISTS;
  const own = await listStore().forUser(user.id);
  return [...DEFAULT_LISTS, ...own.map((l) => ({ id: l.id, name: l.name, rule: cleanRule(l.rule), builtIn: false, frozenAt: l.frozen?.at ?? null }))];
}

/** One list by id: a built-in one, or one of the user's own (anyone else's is "not yours"). */
export async function listById(user: User, id: string): Promise<ListRef | null> {
  const d = DEFAULT_LISTS.find((l) => l.id === id);
  if (d) return d;
  if (!/^lst_[A-Za-z0-9_-]{6,40}$/.test(id) || user.status !== "active") return null;
  const l = await listStore().get(id);
  return l && l.userId === user.id ? { id: l.id, name: l.name, rule: cleanRule(l.rule), builtIn: false, frozenAt: l.frozen?.at ?? null } : null;
}

type Saved = { ok: true; list: ListRef } | { ok: false; error: string };

/** "Save this list". The rule is checked again here (it came from the page). D80: `freeze` keeps only today's people. */
export async function saveList(user: User, name: string, raw: unknown, now = new Date(), opts: { freeze?: boolean } = {}): Promise<Saved> {
  if (user.status !== "active") return { ok: false, error: lc.noList };
  const n = tidyName(name);
  if (!n) return { ok: false, error: lc.nameFirst };
  const parsed = ListRuleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: lc.failed };
  const rule = cleanRule(parsed.data);
  if (isEmptyRule(rule) && rule.kind !== "agent") return { ok: false, error: lc.nothingToSave };
  const own = await listStore().forUser(user.id);
  if (own.length >= MAX_LISTS) return { ok: false, error: lc.tooManyLists(MAX_LISTS) };
  if ([...DEFAULT_LISTS, ...own].some((l) => l.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: lc.sameName };
  const at = now.toISOString();
  const l: SavedList = { id: `lst_${randomBytes(9).toString("base64url")}`, userId: user.id, name: n, rule, createdAt: at, updatedAt: at };
  await listStore().put(l);
  if (opts.freeze) {
    const f = await freezeList(user, l.id, now);
    if (f.ok) return { ok: true, list: f.list };
  }
  return { ok: true, list: { id: l.id, name: l.name, rule, builtIn: false } };
}

const shortDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

/**
 * D80 "Freeze this list": everyone the list finds today gets a tag
 * ("<name> (Nov 22, 2026)"), and the list becomes that tag. Nobody who fits
 * later joins. The people themselves change only by the tag.
 */
export async function freezeList(user: User, id: string, now = new Date()): Promise<{ ok: true; list: ListRef; count: number; skipped: number } | { ok: false; error: string }> {
  const l = /^lst_/.test(id) ? await listStore().get(id) : null;
  if (DEFAULT_LISTS.some((d) => d.id === id)) return { ok: false, error: lc.defaultList };
  if (!l || l.userId !== user.id || user.status !== "active") return { ok: false, error: lc.noList };
  if (l.frozen) return { ok: true, list: { id: l.id, name: l.name, rule: cleanRule(l.rule), builtIn: false, frozenAt: l.frozen.at }, count: 0, skipped: 0 };
  const tag = lc.frozenTag(l.name.slice(0, 44), shortDay(now)).slice(0, 60);
  const { bulkTags } = await import("./tagging");
  const r = await bulkTags(user, { rule: l.rule }, { op: "addTag", tag }, now);
  if (!r.ok) return { ok: false, error: r.error };
  const rule = cleanRule({ kind: l.rule.kind, tagsAny: [tag] });
  const at = now.toISOString();
  await listStore().put({ ...l, rule, frozen: { at, tag }, updatedAt: at });
  const people = await peopleIn(user, rule, MAX_LIST_PEOPLE, now);
  return { ok: true, list: { id: l.id, name: l.name, rule, builtIn: false, frozenAt: at }, count: people.length, skipped: r.skipped };
}

export type SuggestedSave = { name: string; ok: boolean; list?: ListRef; existing?: boolean; error?: string };

/**
 * D80: the lists picked at import, saved as live lists. A rule that's
 * already one of the user's lists (or a built-in one, like Agents) links to
 * that list instead of making a second.
 */
export async function saveSuggested(user: User, items: readonly { name: string; rule: unknown }[], now = new Date()): Promise<SuggestedSave[]> {
  const out: SuggestedSave[] = [];
  for (const it of items.slice(0, 12)) {
    const parsed = ListRuleSchema.safeParse(it.rule);
    if (!parsed.success) {
      out.push({ name: tidyName(it.name), ok: false, error: lc.failed });
      continue;
    }
    const rule = cleanRule(parsed.data);
    const have = currentList(await listsFor(user), rule);
    if (have) {
      out.push({ name: tidyName(it.name), ok: true, list: have, existing: true });
      continue;
    }
    const r = await saveList(user, it.name, rule, now);
    out.push(r.ok ? { name: r.list.name, ok: true, list: r.list } : { name: tidyName(it.name), ok: false, error: r.error });
  }
  return out;
}

export async function renameList(user: User, id: string, name: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (DEFAULT_LISTS.some((l) => l.id === id)) return { ok: false, error: lc.defaultList };
  const l = /^lst_/.test(id) ? await listStore().get(id) : null;
  if (!l || l.userId !== user.id || user.status !== "active") return { ok: false, error: lc.noList };
  const n = tidyName(name);
  if (!n) return { ok: false, error: lc.nameFirst };
  const own = await listStore().forUser(user.id);
  if ([...DEFAULT_LISTS, ...own].some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: lc.sameName };
  await listStore().put({ ...l, name: n, updatedAt: now.toISOString() });
  return { ok: true };
}

export async function deleteList(user: User, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (DEFAULT_LISTS.some((l) => l.id === id)) return { ok: false, error: lc.defaultList };
  const l = /^lst_/.test(id) ? await listStore().get(id) : null;
  if (!l || l.userId !== user.id || user.status !== "active") return { ok: false, error: lc.noList };
  await listStore().remove(id);
  return { ok: true };
}

/** The list a rule is, if it's one of the user's (built-in first). */
export const currentList = (lists: ListRef[], rule: ListRule) => lists.find((l) => sameRule(l.rule, rule)) ?? null;

/**
 * Everyone a rule finds in the viewer's scope (their book; an assistant's is
 * the officer's; the owner's the team while there is one company), read page
 * by page before anything changes, each checked with `canSee`.
 */
export async function peopleIn(user: User, rule: ListRule, cap = MAX_LIST_PEOPLE, now = new Date(), opts: { book?: string } = {}): Promise<Contact[]> {
  if (user.status !== "active") return [];
  const store = contactStore();
  const out: Contact[] = [];
  const r = cleanRule(rule);
  // `book` narrows to one book inside the viewer's scope (a campaign reads only its own book).
  const scope = scopeOf(user);
  if (opts.book && scope !== undefined && scope !== opts.book) return [];
  const owner = opts.book ?? scope;
  for (let offset = 0; out.length < cap; offset += 500) {
    const { contacts } = await store.list({ ownerUserId: owner, rule: r, now, limit: 500, offset });
    out.push(...contacts);
    if (contacts.length < 500) break;
  }
  return out.slice(0, cap).filter((c) => canSee(user, c));
}
