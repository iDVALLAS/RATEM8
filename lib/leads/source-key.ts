/**
 * lib/leads/source-key.ts — D83: one key per lead source. PURE.
 *
 * Spend and leads join on this key, so every place that names a source goes
 * through `sourceKey`: a delivered lead's vendor (`lead: Zillow`), the
 * `lead:<key>` tag, an import's Lead source column, an expense's Lead source
 * and the Business Manager's slices. The key is a lowercase slug; the named
 * vendors and the two built-in sources have aliases, so "Lending Tree",
 * "lendingtree" and "LendingTree.com" are one row.
 *
 * Lead-source values that mean a referral, a past client or the loan
 * officer's sphere ("Referral", "Past client", "SOI", "Friends & family")
 * go to the "Past clients & sphere" row (owner decision 5), never a vendor's.
 */

export const SPHERE_KEY = "past-clients-sphere";
export const WEB_FORM_KEY = "web-form";
/** An import marked as from a lead vendor with no Lead source column. */
export const VENDOR_FILE_KEY = "vendor-file";

/** The named sources, their display names and the words that mean them (matched on the squashed form: letters and digits only). */
export const KNOWN_SOURCES: readonly { key: string; label: string; aliases: readonly string[] }[] = [
  { key: "zillow", label: "Zillow", aliases: ["zillow", "zillowgroup", "zillowcom", "zillowleads", "zillowpremieragent", "zillowlendermarketplace", "zillowmortgages"] },
  { key: "lendingtree", label: "LendingTree", aliases: ["lendingtree", "lendingtreecom", "lendingtreeleads"] },
  { key: "bankrate", label: "Bankrate", aliases: ["bankrate", "bankratecom", "bankrateleads"] },
  { key: "lowermybills", label: "LowerMyBills", aliases: ["lowermybills", "lowermybillscom", "lmb"] },
  { key: "google-ads", label: "Google Ads", aliases: ["googleads", "adwords", "googleadwords", "googleppc", "googlesearchads", "googlesearch", "googlecpc"] },
  { key: "meta", label: "Meta", aliases: ["meta", "metaads", "facebook", "facebookads", "fb", "fbads", "instagram", "instagramads", "metaleadforms", "facebookleadads", "facebookleadforms"] },
  { key: SPHERE_KEY, label: "Past clients & sphere", aliases: ["pastclientssphere", "pastclientsandsphere", "pastclientsphere"] },
  { key: WEB_FORM_KEY, label: "Your web form", aliases: ["yourwebform", "webform", "website", "mywebsite", "web", "websiteform", "contactform", "landingpage", "onlineform", "webinquiry", "websitelead"] },
  { key: VENDOR_FILE_KEY, label: "Lead vendor file", aliases: ["leadvendorfile"] },
];

const BY_ALIAS = new Map(KNOWN_SOURCES.flatMap((s) => s.aliases.map((a) => [a, s.key] as const)));
const LABELS = new Map(KNOWN_SOURCES.map((s) => [s.key, s.label]));

/** Words that mean a referral, a past client or the loan officer's sphere (decision 5). */
const SPHERE_WORDS = /referr|\bpast ?clients?\b|\bpast ?customers?\b|\bformer ?clients?\b|\bprevious ?clients?\b|\brepeat (client|customer|business)\b|\bsphere\b|\bsoi\b|\bfriends?\b|\bfamily\b|word of mouth|\bpersonal (contacts?|network)\b/i;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** The plain slug: lowercase, words joined by "-", at most 30 characters. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/g, "");

/**
 * The key for a source as anyone named it: an alias's key, the sphere key for
 * a referral-type value, else the slug ("" for nothing readable).
 */
export function sourceKey(raw: string | null | undefined): string {
  const t = (raw ?? "").replace(/^lead:\s*/i, "").trim();
  if (!t) return "";
  const sq = squash(t);
  const known = BY_ALIAS.get(sq) ?? BY_ALIAS.get(sq.replace(/(com|leads?|ads?)$/, ""));
  if (known) return known;
  // A vendor's name inside a longer label ("Zillow Premier Agent leads", "LendingTree - refi") is that vendor.
  for (const s of KNOWN_SOURCES) if (s.key !== SPHERE_KEY && s.key !== WEB_FORM_KEY && s.key !== VENDOR_FILE_KEY && s.aliases.some((a) => a.length >= 6 && sq.includes(a))) return s.key;
  if (SPHERE_WORDS.test(t)) return SPHERE_KEY;
  return slug(t);
}

/** Back from a key to words, for a key nobody gave a label for ("my-vendor" → "My vendor"). */
const unslug = (k: string) => (k ? k[0].toUpperCase() + k.slice(1).replace(/-/g, " ") : k);

/** The name to show for a key: the named sources' own spelling, else the label it was first seen with, else the key in words. */
export function sourceLabel(key: string, seen?: string | null): string {
  return LABELS.get(key) ?? (seen?.replace(/^lead:\s*/i, "").trim() || unslug(key));
}

/** Whether a key is one of the named sources or the built-in two. */
export const isKnownSource = (key: string) => LABELS.has(key);

/** The vendors an expense can name, for pre-selecting its Lead source. */
const VENDOR_WORDS: [RegExp, string][] = [
  [/\bzillow\b/i, "zillow"],
  [/\blending ?tree\b/i, "lendingtree"],
  [/\bbankrate\b/i, "bankrate"],
  [/\blower ?my ?bills\b/i, "lowermybills"],
  [/\bgoogle ?ads\b|\badwords\b|\bgoogle (search|ppc|cpc)\b/i, "google-ads"],
  [/\bmeta\b|\bfacebook\b|\binstagram\b/i, "meta"],
];

/**
 * D83: when an expense's vendor or words name a known lead source (Zillow,
 * LendingTree, Bankrate, LowerMyBills, Google Ads, Meta), its key; else null.
 * Only a suggestion: the loan officer confirms it on the draft.
 */
export function guessLeadSource(text: string): string | null {
  for (const [re, key] of VENDOR_WORDS) if (re.test(text)) return key;
  return null;
}

/** Expense categories that can be lead spend (ads, lead software, and cards, postage and gifts for past clients and sphere). */
export const LEAD_SPEND_CATEGORIES = ["advertising", "software", "gifts", "office"] as const;
export const isLeadSpendCategory = (c: string) => (LEAD_SPEND_CATEGORIES as readonly string[]).includes(c);
