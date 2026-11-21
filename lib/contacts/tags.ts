/**
 * lib/contacts/tags.ts — tags on contacts (D73). Client-safe and pure.
 *
 * A tag is the loan officer's own label ("Past clients 2021", "Open house").
 * Two spellings that differ only in capitals are one tag: the first spelling
 * kept wins, and type-ahead offers the existing spelling. Filtering by a tag
 * is an exact match on that spelling.
 */

/** D69: limits that keep one long value from failing a whole batch. */
export const MAX_TAG = 60;
/** Tags on one person from one import (the file's own plus the ones picked for the import). */
export const MAX_TAGS = 20;
/** Tags on a contact (imports add up over time). */
export const MAX_CONTACT_TAGS = 30;
/** Tags picked for a whole import, or for one list in it. */
export const MAX_IMPORT_TAGS = 5;

/** One tag, tidied: no control characters, single spaces, at most 60 characters. */
export function cleanTag(raw: string): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TAG)
    .trim();
}

const key = (t: string) => t.toLocaleLowerCase("en-US");
export const sameTag = (a: string, b: string) => key(cleanTag(a)) === key(cleanTag(b));

/** Every tag from the lists in order, tidied, each once (the first spelling wins). No cap. */
export function mergeTags(...lists: readonly (readonly string[] | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list ?? []) {
      const t = cleanTag(raw);
      if (!t || seen.has(key(t))) continue;
      seen.add(key(t));
      out.push(t);
    }
  }
  return out;
}

/**
 * Adds `extra` to `base` within `cap`. The extra tags always fit (the tags
 * the loan officer picked for an import, so "See the people from this
 * import" finds everyone); `base` fills what's left, in order.
 */
export function withExtraTags(base: readonly string[], extra: readonly string[], cap = MAX_TAGS): string[] {
  const add = mergeTags(extra).slice(0, cap);
  const keep = mergeTags(base).filter((t) => !add.some((a) => sameTag(a, t)));
  return [...keep.slice(0, Math.max(0, cap - add.length)), ...add];
}

/** A tags cell from a file ("past client; realtor", "a, b", "a | b"). */
export function splitTags(raw: string): string[] {
  return raw.split(/[;,|]/).map((t) => t.trim()).filter(Boolean);
}

/** The list without `tag` (any capitals). */
export function withoutTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((t) => !sameTag(t, tag));
}

/** `from` renamed to `to` in place; if `to` is already there, the two become one. */
export function renameIn(tags: readonly string[], from: string, to: string): string[] {
  return mergeTags(tags.map((t) => (sameTag(t, from) ? to : t)));
}

/** The tag every import starts with: "Imported Nov 21, 2026" (the day of the run, on the loan officer's clock). */
export function importedTag(d: Date, timeZone?: string): string {
  return `Imported ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", ...(timeZone ? { timeZone } : {}) })}`;
}

/** D75: the tag on a record made from duplicates merged inside the files: "Merged at import Nov 21, 2026". */
export function mergedTag(d: Date, timeZone?: string): string {
  return `Merged at import ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", ...(timeZone ? { timeZone } : {}) })}`;
}

/** D75: someone in a file who matched two different people already in the book. */
export const POSSIBLE_DUPLICATE_TAG = "Possible duplicate";

/** The link to everyone with a tag on the Contacts page. */
export function tagHref(tag: string, kind: "contact" | "agent" = "contact", extra: Record<string, string> = {}): string {
  const u = new URLSearchParams({ ...(kind === "agent" ? { kind: "agent" } : {}), tag, ...extra });
  return `/mlo/contacts?${u}`;
}
