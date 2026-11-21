/**
 * lib/contacts/tagging.ts — changing tags (D73). SERVER-ONLY.
 *
 *  - One person's tags (the contact page): `setContactTags`.
 *  - Many people at once (the Contacts list's bulk bar): `bulkTags`. Every
 *    id is checked with `canSee` before anything changes; one id outside the
 *    viewer's book refuses the whole request.
 *  - Rename, merge and delete a tag (the Tags panel): `renameTag`,
 *    `deleteTag`, on the viewer's own book only (an assistant's is the book
 *    of the loan officer they assist).
 *
 * The audit log keeps counts, never the tag text or names.
 */
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";
import { canSee, scopeOf } from "./service";
import { contactStore, type Contact, type ContactFilter } from "./store";
import { cleanTag, MAX_CONTACT_TAGS, mergeTags, renameIn, sameTag, withoutTag } from "./tags";

/** Ids sent from a page selection (one page is 50). */
export const MAX_BULK_IDS = 500;
/** People one "Select all N matching" request changes. */
export const MAX_BULK_MATCHING = 25_000;

type Result = { ok: true; changed: number; skipped: number } | { ok: false; error: string };

/** The book whose tags this user manages: their own, or for an assistant the officer's they assist. */
export function tagBook(user: User): string | null {
  if (user.status !== "active") return null;
  if (user.role === "assistant") return user.assistsUserId || null;
  return user.id;
}

/** Every contact matching a filter, read page by page before anything changes (a change can move people out of it). */
async function allMatching(f: ContactFilter, cap: number): Promise<Contact[]> {
  const store = contactStore();
  const out: Contact[] = [];
  for (let offset = 0; out.length < cap; offset += 500) {
    const { contacts } = await store.list({ ...f, limit: 500, offset });
    out.push(...contacts);
    if (contacts.length < 500) break;
  }
  return out.slice(0, cap);
}

/** The contact page: replaces one person's tags. */
export async function setContactTags(actor: User, contactId: string, tags: readonly string[], now = new Date()): Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> {
  const store = contactStore();
  const c = await store.get(contactId);
  if (!c || !canSee(actor, c)) return { ok: false, error: tc.noContact };
  const next = mergeTags(tags);
  if (next.length > MAX_CONTACT_TAGS) return { ok: false, error: tc.tooMany(MAX_CONTACT_TAGS) };
  await store.put({ ...c, tags: next, updatedAt: now.toISOString() });
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "contact.tags", detail: { contactId, count: next.length } });
  return { ok: true, tags: next };
}

export type BulkTarget = { ids: string[] } | { filter: { kind: "contact" | "agent"; q?: string; rel?: string; tag?: string } };
export type BulkOp = { op: "addTag" | "removeTag"; tag: string };

/**
 * The bulk bar: add or remove one tag for the people picked, or for
 * everyone matching the list's filter (D78 adds the other actions).
 */
export async function bulkTags(actor: User, target: BulkTarget, op: BulkOp, now = new Date()): Promise<Result> {
  if (actor.status !== "active") return { ok: false, error: tc.noContact };
  const tag = cleanTag(op.tag);
  if (!tag) return { ok: false, error: tc.typeTag };
  const store = contactStore();
  let people: Contact[];
  if ("ids" in target) {
    const ids = [...new Set(target.ids)];
    if (!ids.length) return { ok: false, error: tc.pickPeople };
    if (ids.length > MAX_BULK_IDS) return { ok: false, error: tc.tooManyPicked(MAX_BULK_IDS) };
    people = [];
    for (const id of ids) {
      const c = await store.get(id);
      // One person outside the viewer's book refuses everything, before anything changes.
      if (!c || !canSee(actor, c)) return { ok: false, error: tc.notYours };
      people.push(c);
    }
  } else {
    const f = target.filter;
    people = await allMatching({ ownerUserId: scopeOf(actor), kind: f.kind, q: f.q || undefined, relationship: f.rel || undefined, tag: f.tag || undefined }, MAX_BULK_MATCHING);
    if (people.some((c) => !canSee(actor, c))) return { ok: false, error: tc.notYours };
  }
  let changed = 0;
  let skipped = 0;
  const at = now.toISOString();
  for (const c of people) {
    const has = c.tags.some((t) => sameTag(t, tag));
    let next: string[] | null = null;
    if (op.op === "addTag") {
      if (has) continue;
      if (c.tags.length >= MAX_CONTACT_TAGS) {
        skipped++;
        continue;
      }
      next = [...c.tags, tag];
    } else if (has) next = withoutTag(c.tags, tag);
    if (!next) continue;
    await store.put({ ...c, tags: next, updatedAt: at });
    changed++;
  }
  await accountStore().audit({ at, actor: actor.email, action: `contacts.tags.${op.op === "addTag" ? "add" : "remove"}`, detail: { picked: people.length, changed, skipped, by: "ids" in target ? "selection" : "filter" } });
  return { ok: true, changed, skipped };
}

/**
 * Renames a tag in the viewer's book. When `to` is already a tag there, the
 * two become one (Merge into…).
 */
export async function renameTag(actor: User, from: string, to: string, now = new Date()): Promise<Result> {
  const book = tagBook(actor);
  if (!book) return { ok: false, error: tc.noBook };
  const name = cleanTag(to);
  if (!name) return { ok: false, error: tc.typeTag };
  if (name === from) return { ok: true, changed: 0, skipped: 0 };
  const people = await allMatching({ ownerUserId: book, tag: from }, MAX_BULK_MATCHING);
  const at = now.toISOString();
  let changed = 0;
  for (const c of people) {
    if (c.ownerUserId !== book) continue;
    await contactStore().put({ ...c, tags: renameIn(c.tags, from, name).slice(0, MAX_CONTACT_TAGS), updatedAt: at });
    changed++;
  }
  await accountStore().audit({ at, actor: actor.email, action: "contacts.tags.rename", detail: { changed, ...(book !== actor.id ? { book } : {}) } });
  return { ok: true, changed, skipped: 0 };
}

/** Merge into…: like a rename, but `into` must already be a tag in the viewer's book. */
export async function mergeTag(actor: User, from: string, into: string, now = new Date()): Promise<Result> {
  const book = tagBook(actor);
  if (!book) return { ok: false, error: tc.noBook };
  const tags = await contactStore().tagCounts(book);
  const target = tags.find((t) => t.tag === into);
  if (!target || into === from) return { ok: false, error: tc.pickMerge };
  return renameTag(actor, from, target.tag, now);
}

/** Takes a tag off everyone in the viewer's book (the people stay). */
export async function deleteTag(actor: User, tag: string, now = new Date()): Promise<Result> {
  const book = tagBook(actor);
  if (!book) return { ok: false, error: tc.noBook };
  const people = await allMatching({ ownerUserId: book, tag }, MAX_BULK_MATCHING);
  const at = now.toISOString();
  let changed = 0;
  for (const c of people) {
    if (c.ownerUserId !== book) continue;
    await contactStore().put({ ...c, tags: c.tags.filter((t) => t !== tag), updatedAt: at });
    changed++;
  }
  await accountStore().audit({ at, actor: actor.email, action: "contacts.tags.delete", detail: { changed, ...(book !== actor.id ? { book } : {}) } });
  return { ok: true, changed, skipped: 0 };
}
