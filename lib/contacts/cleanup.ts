/**
 * lib/contacts/cleanup.ts — D88 "Clean up my contacts": the eight rules,
 * what each fix changes, and how a fix is undone. PURE (no store, no clock).
 *
 * The Concierge reads a whole book and proposes groups of changes. Rules
 * come first and decide almost everything; M8 may only group labels the
 * rules couldn't fold (lib/contacts/cleanup-ai.ts), and those groups come
 * back here as `ai` input.
 *
 *  1. tags      — the same tag after capitals, spacing, punctuation and a
 *                 trailing plural "s" ("VIP", "vip", "V.I.P", "VIPs"), and
 *                 near spellings (one letter apart, both 5+ letters, no digits).
 *  2. sources   — lead sources that `sourceKey()` reads as one source but
 *                 are written differently ("Zillow", "Zillow.com"), and
 *                 `lead:` tags not written as `lead:<key>`.
 *  3. duplicates — D75's match rules (same email, or the same phone and the
 *                 same first name), plus anyone tagged "Possible duplicate".
 *                 Never a pair marked "Keep separate", or two people one
 *                 import kept separate on purpose. Merged one pair at a time
 *                 by D77's merge.
 *  4. basics    — no name, no state (filled from the ZIP when it has one), a
 *                 lead with no lead source.
 *  5. reach     — phones or emails the validators reject (kept "as written"
 *                 in their notes at import, or stored before checks existed).
 *  6. past_clients — a lead with a closed loan.
 *  7. agents    — a client whose record says real estate agent.
 *  8. lead_no_source — people a lead vendor's file brought in, with no source.
 *
 * Never: consent, stops, do-not-call, phone checks, the hold or provenance.
 * Fixes only change tags, relationship, kind (to Agents), lead source and a
 * state read from the ZIP. Phones and emails are never changed here (a new
 * phone or email resets permission, so that stays on the contact page).
 * No protected trait is ever a group: a tag that reads as one is left alone.
 */
import type { Loan } from "@/lib/pipeline/store";
import { isKnownSource, sourceKey, sourceLabel, SPHERE_KEY } from "@/lib/leads/source-key";
import { listRefusal } from "./ask-words";
import { nameOf } from "./merge";
import { cleanEmail, stateFromZip as zipState, toE164 } from "./normalize";
import { sameFirstName, UNDO_DAYS } from "./reimport";
import type { Contact } from "./store";
import { cleanTag, MAX_CONTACT_TAGS, mergeTags, POSSIBLE_DUPLICATE_TAG, sameTag } from "./tags";

export const RULES = ["tags", "sources", "duplicates", "basics", "reach", "past_clients", "agents", "lead_no_source"] as const;
export type RuleKey = (typeof RULES)[number];
export type FixKind = "merge_tags" | "one_source" | "merge_pairs" | "tag" | "fill_state" | "past_client" | "to_agents" | "set_source";

/** Tags a fix adds, so the loan officer can find the people later ("Needs a name"). */
export const CLEANUP_TAGS = { noName: "Needs a name", noState: "Needs a state", noSource: "Needs a lead source", reach: "Check phone or email" } as const;

/** Examples shown on a group, and the most people or pairs one group carries. */
export const MAX_EXAMPLES = 5;
export const MAX_PAIRS = 100;
/** A phone or email shared by more people than this is a shared line (an office), not a duplicate. */
export const MAX_SHARED = 6;
/** How long an applied clean-up can be undone (the same 30 days as an import). */
export const CLEANUP_UNDO_DAYS = UNDO_DAYS;

export type Variant = { label: string; count: number; where: "tag" | "field" };
export type Pair = { a: string; b: string; by: "email" | "phone" | "flagged" };
export type Reason = { code: "tag" | "note" | "file" | "brokerage" | "agent_match" | "phone" | "email"; raw?: string };
/** M8's grouping of labels the rules couldn't fold (zod-checked before it gets here). */
export type AiGroup = { kind: "tag" | "source"; labels: string[]; keep: string };

export type Suggestion = {
  /** Stable for the same finding (a rule and its key), so a skip and a review find it again. */
  id: string;
  rule: RuleKey;
  fix: FixKind;
  /** Everyone the fix would change, sorted by id. */
  people: string[];
  count: number;
  examples: string[];
  /** Changes whenever the people or the values the rule read change: a skipped group comes back only then. */
  fingerprint: string;
  /** merge_tags / one_source: the spelling kept. tag: the tag added. */
  target?: string;
  /** one_source: the `lead:` tag kept. */
  targetTag?: string;
  /** The spellings that change into `target` (merge_tags, one_source), with how many people carry each. */
  variants?: Variant[];
  pairs?: Pair[];
  /** lead_no_source: the import that brought them in (null when unknown). */
  importId?: string | null;
  importLabel?: string | null;
  /** Why each person is here (agents, reach), by id. */
  reasons?: Record<string, Reason>;
  ai?: boolean;
  needsInput?: "leadSource";
  /** A merge can't be undone; everything else can, for 30 days. */
  undoable: boolean;
};

export type ScanInput = {
  /** The whole book (both kinds), already scoped to one owner. */
  contacts: readonly Contact[];
  /** The book's loans from the loan system (only the link to a person and whether it closed). */
  loans?: readonly Pick<Loan, "contactId" | "closed" | "dead">[];
  /** The book's imports, for naming a file. */
  imports?: readonly { id: string; files: string[] }[];
  /** Pairs the loan officer said are two different people (`pairKey`). */
  separate?: readonly string[];
  ai?: readonly AiGroup[];
};

// ---- Small helpers ----

const stateFromZip = (zip: string | null | undefined) => zipState(zip ?? undefined);

/** One hash for a fingerprint (two FNV-1a passes, 16 hex characters). Not for secrets. */
export function hashOf(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x01000193) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** The two ids of a pair in one order. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * A tag as rule 1 compares it: capitals, accents, spacing and punctuation
 * dropped, and a trailing plural "s" ("VIPs" = "VIP"; "Class" keeps its "ss").
 */
export function foldKey(raw: string): string {
  let k = cleanTag(raw).toLocaleLowerCase("en-US").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  if (k.length >= 4 && k.endsWith("s") && !k.endsWith("ss")) k = k.slice(0, -1);
  return k;
}

/** Whether two folded tags are one letter apart (a letter added, dropped or changed). Both 5+ letters, no digits. */
export function nearSpelling(a: string, b: string): boolean {
  if (a === b || /\d/.test(a) || /\d/.test(b) || a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Tags the rules never fold: lead tags (rule 2's) and anything that reads as a protected trait. */
const tagRuleSkips = (t: string) => /^lead:/i.test(t) || !!listRefusal(t);

/** The most-used spelling; on a tie the one written with more capitals ("VIP" over "vip"), then alphabetical. */
const caps = (t: string) => (t.match(/[A-Z]/g) ?? []).length;
const most = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1] || caps(y[0]) - caps(x[0]) || x[0].localeCompare(y[0]))[0]?.[0] ?? "";
const examplesOf = (cs: readonly Contact[]) => [...cs].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, MAX_EXAMPLES).map((c) => nameOf(c).slice(0, 80));
const hasTag = (c: Contact, t: string) => (c.tags ?? []).some((x) => sameTag(x, t));
const delivered = (c: Contact) => c.source.startsWith("lead:");
const hasLeadTag = (c: Contact) => (c.tags ?? []).some((t) => /^lead:/i.test(t));

function make(s: Omit<Suggestion, "count" | "examples" | "fingerprint" | "people">, members: readonly Contact[], read: (c: Contact) => unknown): Suggestion {
  const sorted = [...new Map(members.map((c) => [c.id, c])).values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const fp = hashOf(JSON.stringify([s.id, s.fix, s.target ?? null, s.targetTag ?? null, s.variants ?? null, s.pairs ?? null, sorted.map((c) => [c.id, read(c)])]));
  return { ...s, people: sorted.map((c) => c.id), count: sorted.length, examples: examplesOf(sorted), fingerprint: fp };
}

// ---- Rule 1: tags that mean the same thing ----

type TagGroup = { spellings: Map<string, number> };

function tagGroups(contacts: readonly Contact[]): TagGroup[] {
  const count = new Map<string, number>();
  for (const c of contacts) for (const t of new Set(c.tags ?? [])) if (!tagRuleSkips(t)) count.set(t, (count.get(t) ?? 0) + 1);
  const byKey = new Map<string, Map<string, number>>();
  for (const [t, n] of count) {
    const k = foldKey(t);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, new Map());
    byKey.get(k)!.set(t, n);
  }
  // Near spellings join their groups (union-find over the folded keys).
  const keys = [...byKey.keys()].sort();
  const parent = new Map(keys.map((k) => [k, k]));
  const root = (k: string): string => (parent.get(k) === k ? k : root(parent.get(k)!));
  const byLen = new Map<number, string[]>();
  for (const k of keys) byLen.set(k.length, [...(byLen.get(k.length) ?? []), k]);
  for (const k of keys) {
    for (const len of [k.length, k.length + 1]) {
      for (const o of byLen.get(len) ?? []) {
        if (o <= k && len === k.length) continue;
        if (nearSpelling(k, o)) {
          const [x, y] = [root(k), root(o)].sort();
          parent.set(y, x);
        }
      }
    }
  }
  const joined = new Map<string, Map<string, number>>();
  for (const k of keys) {
    const r = root(k);
    if (!joined.has(r)) joined.set(r, new Map());
    for (const [t, n] of byKey.get(k)!) joined.get(r)!.set(t, n);
  }
  return [...joined.values()].filter((m) => m.size >= 2).map((spellings) => ({ spellings }));
}

function tagSuggestion(spellings: Map<string, number>, contacts: readonly Contact[], ai: boolean): Suggestion | null {
  const target = most(spellings);
  const variants = [...spellings].filter(([t]) => t !== target).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([label, count]) => ({ label, count, where: "tag" as const }));
  if (!variants.length) return null;
  const set = new Set(variants.map((v) => v.label));
  const members = contacts.filter((c) => (c.tags ?? []).some((t) => set.has(t)));
  if (!members.length) return null;
  const key = ai ? `ai:${hashOf([...spellings.keys()].sort().join("\n"))}` : [...spellings.keys()].map(foldKey).sort()[0];
  return make({ id: `tags:${key}`, rule: "tags", fix: "merge_tags", target, variants, ai: ai || undefined, undoable: true }, members, (c) => (c.tags ?? []).filter((t) => spellings.has(t)));
}

// ---- Rule 2: one lead source written different ways ----

function sourceSuggestions(contacts: readonly Contact[], aiSources: readonly AiGroup[]): Suggestion[] {
  const clients = contacts.filter((c) => c.kind === "contact");
  type G = { field: Map<string, number>; tags: Map<string, number> };
  const groups = new Map<string, G>();
  const g = (k: string) => groups.get(k) ?? (groups.set(k, { field: new Map(), tags: new Map() }), groups.get(k)!);
  for (const c of clients) {
    const v = (c.leadSource ?? "").trim();
    if (v) {
      let k = sourceKey(v);
      // "Referral", "Past client" and "SOI" share the scorecard's row, but they aren't the same words: fold them like tags only.
      if (k === SPHERE_KEY) k = `sphere:${foldKey(v)}`;
      if (k) g(k).field.set(v, (g(k).field.get(v) ?? 0) + 1);
    }
    for (const t of new Set(c.tags ?? [])) {
      if (!/^lead:/i.test(t)) continue;
      const k = sourceKey(t);
      if (k && t !== `lead:${k}`) g(k).tags.set(t, (g(k).tags.get(t) ?? 0) + 1);
    }
  }
  const out: Suggestion[] = [];
  for (const [k, { field, tags }] of groups) {
    const fieldTarget = !k.startsWith("sphere:") && isKnownSource(k) && k !== SPHERE_KEY ? sourceLabel(k) : most(field);
    const fieldVariants = field.size >= 2 || (field.size === 1 && !field.has(fieldTarget)) ? [...field].filter(([t]) => t !== fieldTarget) : [];
    const tagTarget = k.startsWith("sphere:") ? null : `lead:${k}`;
    const tagVariants = tagTarget ? [...tags] : [];
    if (!fieldVariants.length && !tagVariants.length) continue;
    // A source written one way only, just not the known spelling ("zillow.com" everywhere), is left as it is.
    if (!tagVariants.length && field.size < 2) continue;
    const fv = new Set(fieldVariants.map(([t]) => t));
    const tv = new Set(tagVariants.map(([t]) => t));
    const members = clients.filter((c) => fv.has((c.leadSource ?? "").trim()) || (c.tags ?? []).some((t) => tv.has(t)));
    if (!members.length) continue;
    const variants: Variant[] = [...fieldVariants.map(([label, count]) => ({ label, count, where: "field" as const })), ...tagVariants.map(([label, count]) => ({ label, count, where: "tag" as const }))].sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
    out.push(make({ id: `sources:${k}`, rule: "sources", fix: "one_source", target: fieldTarget || sourceLabel(k), ...(tagTarget && tagVariants.length ? { targetTag: tagTarget } : {}), variants, undoable: true }, members, (c) => [c.leadSource ?? null, (c.tags ?? []).filter((t) => tv.has(t))]));
  }
  // M8's groups of source labels.
  for (const a of aiSources) {
    const count = new Map<string, number>();
    for (const c of clients) {
      const v = (c.leadSource ?? "").trim();
      if (a.labels.includes(v)) count.set(v, (count.get(v) ?? 0) + 1);
    }
    if (count.size < 2) continue;
    const target = count.has(a.keep) ? a.keep : most(count);
    const variants = [...count].filter(([t]) => t !== target).map(([label, n]) => ({ label, count: n, where: "field" as const }));
    const fv = new Set(variants.map((v) => v.label));
    const members = clients.filter((c) => fv.has((c.leadSource ?? "").trim()));
    if (members.length) out.push(make({ id: `sources:ai:${hashOf([...count.keys()].sort().join("\n"))}`, rule: "sources", fix: "one_source", target, variants, ai: true, undoable: true }, members, (c) => c.leadSource ?? null));
  }
  return out;
}

// ---- Rule 3: possible duplicate people ----

function duplicatePairs(contacts: readonly Contact[], separate: ReadonlySet<string>): Pair[] {
  const pairs = new Map<string, Pair>();
  for (const kind of ["contact", "agent"] as const) {
    const people = contacts.filter((c) => c.kind === kind);
    const byEmail = new Map<string, Contact[]>();
    const byPhone = new Map<string, Contact[]>();
    for (const c of people) {
      if (c.email) byEmail.set(c.email.toLowerCase(), [...(byEmail.get(c.email.toLowerCase()) ?? []), c]);
      for (const p of new Set([c.phone, c.phone2].filter(Boolean) as string[])) byPhone.set(p, [...(byPhone.get(p) ?? []), c]);
    }
    const add = (a: Contact, b: Contact, by: Pair["by"]) => {
      if (a.id === b.id || a.ownerUserId !== b.ownerUserId) return;
      const key = pairKey(a.id, b.id);
      if (separate.has(key) || pairs.has(key)) return;
      // One import kept two rows apart on purpose (spouses on one phone, or the loan officer's "Keep separate").
      if (a.importId && a.importId === b.importId) return;
      const [x, y] = a.id < b.id ? [a, b] : [b, a];
      pairs.set(key, { a: x.id, b: y.id, by });
    };
    for (const group of byEmail.values()) if (group.length <= MAX_SHARED) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) add(group[i], group[j], "email");
    for (const group of byPhone.values()) {
      if (group.length > MAX_SHARED) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const [a, b] = [group[i], group[j]];
          if (sameFirstName(a.firstName, b.firstName)) add(a, b, "phone");
          else if (hasTag(a, POSSIBLE_DUPLICATE_TAG) || hasTag(b, POSSIBLE_DUPLICATE_TAG)) add(a, b, "flagged");
        }
      }
    }
  }
  return [...pairs.values()].sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1)).slice(0, MAX_PAIRS);
}

// ---- Rule 5: phones or emails that won't work ----

const AS_WRITTEN = /^(.{1,80}) \(as written\): (.+)$/gm;
const PHONE_LABEL = /phone|mobile|cell|\btel\b|home ?#|work ?#|^ph\b|other phone/i;
const EMAIL_LABEL = /e-?mail/i;

/** Why this person's phone or email won't work, or null. */
export function reachProblem(c: Contact): Reason | null {
  if (c.phone && !/^\+1\d{10}$/.test(c.phone)) return { code: "phone", raw: c.phone.slice(0, 40) };
  if (c.phone2 && !/^\+1\d{10}$/.test(c.phone2)) return { code: "phone", raw: c.phone2.slice(0, 40) };
  if (c.email && !cleanEmail(c.email)) return { code: "email", raw: c.email.slice(0, 60) };
  for (const m of (c.notes ?? "").matchAll(AS_WRITTEN)) {
    const [, label, raw] = m;
    if (/date|zip|postal|state/i.test(label)) continue;
    if ((EMAIL_LABEL.test(label) || raw.includes("@")) && !c.email && !cleanEmail(raw)) return { code: "email", raw: raw.trim().slice(0, 60) };
    if (PHONE_LABEL.test(label) && !raw.includes("@") && (!c.phone || !c.phone2) && !toE164(raw)) return { code: "phone", raw: raw.trim().slice(0, 40) };
  }
  return null;
}

// ---- Rule 7: agents filed as clients ----

const AGENT_WORDS = /\b(realtors?|real estate agents?|realty|listing agents?|buyer'?s agents?|brokerage|broker associate|keller williams|re\/?max|coldwell banker|century 21|exp realty|berkshire hathaway home ?services|sotheby'?s international)\b/i;
const NOTE_JOB = /^(company|employer|title|job ?title|occupation|position|brokerage|office|business|works? at)\s*:\s*(.+)$/gim;
const FILE_WORDS = /\b(realtors?|agent ?list|agents)\b/i;

/** Why a client's record says real estate agent, or null. `agents` indexes the book's agents. */
export function agentSignal(c: Contact, agents: { emails: Set<string>; phones: Map<string, string[]> }): Reason | null {
  for (const t of c.tags ?? []) if (AGENT_WORDS.test(t) || /^agents?$/i.test(t.trim())) return { code: "tag", raw: t.slice(0, 60) };
  if (c.agent?.brokerage) return { code: "brokerage", raw: c.agent.brokerage.slice(0, 60) };
  for (const m of (c.notes ?? "").matchAll(NOTE_JOB)) {
    const v = m[2].trim();
    if (AGENT_WORDS.test(v) || /\b(agent|broker)\b/i.test(v)) return { code: "note", raw: `${m[1]}: ${v}`.slice(0, 80) };
  }
  if (FILE_WORDS.test(c.source.replace(/^import:\s*/i, ""))) return { code: "file", raw: c.source.replace(/^import:\s*/i, "").slice(0, 80) };
  if (c.email && agents.emails.has(c.email.toLowerCase())) return { code: "agent_match" };
  for (const p of [c.phone, c.phone2]) if (p && (agents.phones.get(p) ?? []).some((f) => sameFirstName(f, c.firstName))) return { code: "agent_match" };
  return null;
}

/** A brokerage name from their own notes ("Company: …"), for the agent record a move makes. */
function brokerageFromNotes(c: Contact): string | null {
  for (const m of (c.notes ?? "").matchAll(NOTE_JOB)) if (/company|employer|brokerage|office|works? at/i.test(m[1]) && AGENT_WORDS.test(m[2])) return m[2].trim().slice(0, 120);
  return null;
}

// ---- All rules ----

/** Every suggestion for a book, in rule order (the biggest first within a rule). Skipped ones are filtered by the caller. */
export function findSuggestions(input: ScanInput): Suggestion[] {
  const contacts = input.contacts;
  const clients = contacts.filter((c) => c.kind === "contact");
  const separate = new Set(input.separate ?? []);
  const out: Suggestion[] = [];

  // 1. Tags (rules first; then M8's groups for labels no rule group already holds).
  const tagSugs = tagGroups(contacts).map((g) => tagSuggestion(g.spellings, contacts, false)).filter((s): s is Suggestion => !!s);
  const taken = new Set(tagSugs.flatMap((s) => [s.target!, ...s.variants!.map((v) => v.label)]));
  for (const a of input.ai ?? []) {
    if (a.kind !== "tag") continue;
    const spellings = new Map<string, number>();
    for (const c of contacts) for (const t of new Set(c.tags ?? [])) if (a.labels.includes(t) && !taken.has(t) && !tagRuleSkips(t)) spellings.set(t, (spellings.get(t) ?? 0) + 1);
    if (spellings.size < 2) continue;
    if (spellings.has(a.keep)) spellings.set(a.keep, spellings.get(a.keep)! + 0.5); // M8's pick wins a tie, never a clear majority
    const s = tagSuggestion(spellings, contacts, true);
    if (!s) continue;
    s.variants = s.variants!.map((v) => ({ ...v, count: Math.floor(v.count) }));
    for (const t of spellings.keys()) taken.add(t);
    tagSugs.push(s);
  }
  out.push(...tagSugs.sort((x, y) => y.count - x.count || (x.id < y.id ? -1 : 1)));

  // 2. Lead sources.
  out.push(...sourceSuggestions(contacts, (input.ai ?? []).filter((a) => a.kind === "source")).sort((x, y) => y.count - x.count || (x.id < y.id ? -1 : 1)));

  // 3. Duplicates.
  const pairs = duplicatePairs(contacts, separate);
  if (pairs.length) {
    const ids = new Set(pairs.flatMap((p) => [p.a, p.b]));
    out.push(make({ id: "duplicates", rule: "duplicates", fix: "merge_pairs", pairs, undoable: false }, contacts.filter((c) => ids.has(c.id)), (c) => [c.firstName, c.lastName, c.email, c.phone, c.phone2, c.kind]));
  }

  // 4. Missing basics.
  const noName = contacts.filter((c) => !c.firstName.trim() && !c.lastName.trim() && !hasTag(c, CLEANUP_TAGS.noName));
  if (noName.length) out.push(make({ id: "basics:no_name", rule: "basics", fix: "tag", target: CLEANUP_TAGS.noName, undoable: true }, noName, (c) => [c.firstName, c.lastName]));
  const fromZip = contacts.filter((c) => !c.state && !!c.zip && !!stateFromZip(c.zip));
  if (fromZip.length) out.push(make({ id: "basics:state_zip", rule: "basics", fix: "fill_state", undoable: true }, fromZip, (c) => [c.state, c.zip]));
  const noState = contacts.filter((c) => !c.state && !(c.zip && stateFromZip(c.zip)) && !hasTag(c, CLEANUP_TAGS.noState));
  if (noState.length) out.push(make({ id: "basics:no_state", rule: "basics", fix: "tag", target: CLEANUP_TAGS.noState, undoable: true }, noState, (c) => [c.state, c.zip]));
  const leadNone = clients.filter((c) => c.relationship === "lead" && !(c.leadSource ?? "").trim() && !delivered(c) && !hasLeadTag(c) && c.provenance !== "lead_vendor" && !hasTag(c, CLEANUP_TAGS.noSource));
  if (leadNone.length) out.push(make({ id: "basics:lead_none", rule: "basics", fix: "tag", target: CLEANUP_TAGS.noSource, undoable: true }, leadNone, (c) => [c.relationship, c.leadSource ?? null]));

  // 5. Phones or emails that won't work.
  const reasons5: Record<string, Reason> = {};
  const reach = contacts.filter((c) => {
    if (hasTag(c, CLEANUP_TAGS.reach)) return false;
    const r = reachProblem(c);
    if (r) reasons5[c.id] = r;
    return !!r;
  });
  if (reach.length) out.push(make({ id: "reach", rule: "reach", fix: "tag", target: CLEANUP_TAGS.reach, reasons: reasons5, undoable: true }, reach, (c) => [c.phone, c.phone2, c.email, c.notes]));

  // 6. Past clients still labeled as leads.
  const closedLoan = new Set((input.loans ?? []).filter((l) => l.closed && !l.dead && l.contactId).map((l) => l.contactId!));
  const past = clients.filter((c) => c.relationship === "lead" && (!!c.loan?.closedOn || closedLoan.has(c.id)));
  if (past.length) out.push(make({ id: "past_clients", rule: "past_clients", fix: "past_client", undoable: true }, past, (c) => [c.relationship, c.loan?.closedOn ?? null, closedLoan.has(c.id)]));

  // 7. Agents filed as clients (never someone with a loan, or a past client: they may be both).
  const agentIndex = { emails: new Set<string>(), phones: new Map<string, string[]>() };
  for (const a of contacts.filter((c) => c.kind === "agent")) {
    if (a.email) agentIndex.emails.add(a.email.toLowerCase());
    for (const p of [a.phone, a.phone2]) if (p) agentIndex.phones.set(p, [...(agentIndex.phones.get(p) ?? []), a.firstName]);
  }
  const anyLoan = new Set((input.loans ?? []).filter((l) => l.contactId).map((l) => l.contactId!));
  const reasons7: Record<string, Reason> = {};
  const agents = clients.filter((c) => {
    if (c.relationship === "past_client" || c.loan?.closedOn || anyLoan.has(c.id)) return false;
    const r = agentSignal(c, agentIndex);
    if (r) reasons7[c.id] = r;
    return !!r;
  });
  if (agents.length) out.push(make({ id: "agents", rule: "agents", fix: "to_agents", reasons: reasons7, undoable: true }, agents, (c) => [c.kind, c.relationship, reasons7[c.id]]));

  // 8. Imported leads with no source, one group per import.
  const files = new Map((input.imports ?? []).map((r) => [r.id, r.files.join(", ").slice(0, 120)]));
  const byImport = new Map<string, Contact[]>();
  for (const c of clients) {
    if (c.provenance !== "lead_vendor" || (c.leadSource ?? "").trim() || delivered(c)) continue;
    const k = c.importId ?? c.keptFrom ?? "";
    byImport.set(k, [...(byImport.get(k) ?? []), c]);
  }
  for (const [k, people] of [...byImport].sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? -1 : 1))) {
    out.push(make({ id: `lead_no_source:${k || "none"}`, rule: "lead_no_source", fix: "set_source", importId: k || null, importLabel: files.get(k) ?? null, needsInput: "leadSource", undoable: true }, people, (c) => [c.leadSource ?? null, c.provenance]));
  }
  return out;
}

// ---- Applying a fix, and undoing it ----

/** What one fix changed on one person: the fields (before and after) and the tags it added and took off. Never consent. */
export type Change = { id: string; before: Record<string, unknown>; after: Record<string, unknown>; addedTags: string[]; droppedTags: string[] };
const FIELDS = ["kind", "relationship", "leadSource", "state", "agent"] as const;
type FieldKey = (typeof FIELDS)[number];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A typed lead source, tidied (single spaces, at most 120 characters). */
export function cleanSource(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim();
}

/**
 * The person after one suggestion's fix, and what changed; null when it
 * changes nothing for them (already fixed, or no room for another tag).
 */
export function fixFor(s: Suggestion, c: Contact, input: { leadSource?: string } = {}, at = c.updatedAt): { next: Contact; change: Change } | null {
  const next: Contact = { ...c, tags: [...(c.tags ?? [])] };
  switch (s.fix) {
    case "merge_tags": {
      const v = new Set((s.variants ?? []).filter((x) => x.where === "tag").map((x) => x.label));
      if (!next.tags.some((t) => v.has(t))) return null;
      next.tags = mergeTags(next.tags.map((t) => (v.has(t) ? s.target! : t))).slice(0, MAX_CONTACT_TAGS);
      break;
    }
    case "one_source": {
      const fv = new Set((s.variants ?? []).filter((x) => x.where === "field").map((x) => x.label));
      const tv = new Set((s.variants ?? []).filter((x) => x.where === "tag").map((x) => x.label));
      if (fv.has((c.leadSource ?? "").trim())) next.leadSource = s.target!;
      if (s.targetTag && next.tags.some((t) => tv.has(t))) next.tags = mergeTags(next.tags.map((t) => (tv.has(t) ? s.targetTag! : t))).slice(0, MAX_CONTACT_TAGS);
      break;
    }
    case "tag": {
      if (hasTag(c, s.target!) || next.tags.length >= MAX_CONTACT_TAGS) return null;
      next.tags.push(s.target!);
      break;
    }
    case "fill_state": {
      const st = !c.state && c.zip ? stateFromZip(c.zip) : null;
      if (!st) return null;
      next.state = st;
      break;
    }
    case "past_client": {
      if (c.kind !== "contact" || c.relationship !== "lead") return null;
      next.relationship = "past_client";
      break;
    }
    case "to_agents": {
      if (c.kind !== "contact") return null;
      next.kind = "agent";
      next.relationship = "agent";
      next.agent = c.agent ?? { brokerage: brokerageFromNotes(c), units: null, volume: null, buyerUnits: null, listingUnits: null, avgPrice: null, topLender: null };
      break;
    }
    case "set_source": {
      const v = cleanSource(input.leadSource);
      if (!v || (c.leadSource ?? "").trim()) return null;
      next.leadSource = v;
      break;
    }
    default:
      return null;
  }
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (!same(c[f], next[f])) {
      before[f] = c[f] ?? null;
      after[f] = next[f] ?? null;
    }
  }
  const addedTags = next.tags.filter((t) => !(c.tags ?? []).includes(t));
  const droppedTags = (c.tags ?? []).filter((t) => !next.tags.includes(t));
  if (!Object.keys(after).length && !addedTags.length && !droppedTags.length) return null;
  next.updatedAt = at;
  return { next, change: { id: c.id, before, after, addedTags, droppedTags } };
}

/**
 * Puts one change back: a field only while it still holds the fix's value
 * (a later edit wins), the tags the fix added taken off and the ones it
 * took off put back. A move to Agents goes back only as a whole (kind and
 * relationship both still as the move left them). Never consent.
 */
export function undoChange(c: Contact, ch: Change, at: string): { next: Contact; restored: number; kept: number } {
  const next: Contact = { ...c, tags: [...(c.tags ?? [])] };
  let restored = 0;
  let kept = 0;
  const moved = "kind" in ch.after;
  const moveIntact = moved && same(c.kind, ch.after.kind) && (!("relationship" in ch.after) || same(c.relationship, ch.after.relationship));
  for (const f of Object.keys(ch.after) as FieldKey[]) {
    if (!FIELDS.includes(f)) continue;
    const unit = moved && (f === "kind" || f === "relationship" || f === "agent");
    if (unit ? moveIntact : same(c[f], ch.after[f])) {
      (next as Record<string, unknown>)[f] = ch.before[f] ?? null;
      restored++;
    } else kept++;
  }
  // Tags: take off only what the fix added and nobody took off since; put back what it took off.
  const dropped = new Set(ch.droppedTags);
  next.tags = next.tags.filter((t) => !(ch.addedTags.includes(t) && !dropped.has(t)));
  for (const t of ch.droppedTags) if (!next.tags.some((x) => sameTag(x, t)) && next.tags.length < MAX_CONTACT_TAGS) next.tags.push(t);
  if (ch.addedTags.length || ch.droppedTags.length) {
    if (same(next.tags, c.tags ?? [])) kept++;
    else restored++;
  }
  if (!same(next, c)) next.updatedAt = at;
  return { next, restored, kept };
}

/** Whether a clean-up run can still be undone. */
export const cleanupUndoOpen = (at: string, now: Date) => now.getTime() - Date.parse(at) <= CLEANUP_UNDO_DAYS * 86_400_000;

/** The ISO week ("2026-W48") of a moment on the Pacific calendar (the morning run's). */
export function isoWeek(d: Date, timeZone = "America/Los_Angeles"): string {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
