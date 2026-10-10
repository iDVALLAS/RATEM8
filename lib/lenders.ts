/**
 * lib/lenders.ts — lender BRAND registry for <LenderMark /> (v23).
 *
 * Separate from lib/pricing/lenders.ts (pricing consent flags), keyed by
 * the same slugs, plus the lenders the original demo named.
 *
 * Rules:
 *  - `logoApproved` ships false for EVERY lender. The owner flips one to
 *    true only after confirming that lender's broker brand guidelines allow
 *    a consumer-facing logo. Until then LenderMark draws a monogram tile.
 *  - The logo file is supplied by the owner at public/lenders/{slug}.svg.
 *    Nothing here was downloaded, scraped, or redrawn. A test fails the
 *    build if an approved lender has no file.
 *  - `brandColor` is null until the owner copies it from that lender's
 *    brand guide. Until then the tile is tinted with a data-palette hue
 *    (`tint`), which is ours, not the lender's.
 *  - Lender names render only where a named display already existed (the
 *    original scripted demo). Public pricing stays anonymized.
 */

export type DataHue = 1 | 2 | 3 | 4 | 5 | 6;

export type LenderBrand = {
  slug: string;
  name: string;
  /** Two or three letters for the monogram tile. Initials, never a logo. */
  monogram: string;
  /** Owner-confirmed permission to show this lender's logo. */
  logoApproved: boolean;
  /** Hex from the lender's own brand guide, once confirmed. */
  brandColor: string | null;
  /** Fallback tint from LoanM8's data palette (--data-N). */
  tint: DataHue;
};

export const LENDER_BRANDS: readonly LenderBrand[] = [
  { slug: "uwm", name: "UWM", monogram: "UWM", logoApproved: false, brandColor: null, tint: 1 },
  { slug: "rocket-pro", name: "Rocket Pro TPO", monogram: "RP", logoApproved: false, brandColor: null, tint: 4 },
  { slug: "kind", name: "Kind Lending", monogram: "KL", logoApproved: false, brandColor: null, tint: 3 },
  { slug: "the-loan-store", name: "The Loan Store", monogram: "LS", logoApproved: false, brandColor: null, tint: 2 },
  { slug: "prmg", name: "PRMG", monogram: "PR", logoApproved: false, brandColor: null, tint: 5 },
  { slug: "pennymac", name: "Pennymac TPO", monogram: "PM", logoApproved: false, brandColor: null, tint: 6 },
  { slug: "freedom", name: "Freedom Mortgage", monogram: "FM", logoApproved: false, brandColor: null, tint: 1 },
  { slug: "remn", name: "REMN Wholesale", monogram: "RW", logoApproved: false, brandColor: null, tint: 2 },
  { slug: "provident", name: "Provident Funding", monogram: "PF", logoApproved: false, brandColor: null, tint: 3 },
  { slug: "rise", name: "RISE TPO", monogram: "RT", logoApproved: false, brandColor: null, tint: 4 },
  { slug: "homexpress", name: "HomeXpress", monogram: "HX", logoApproved: false, brandColor: null, tint: 5 },
  { slug: "newrez", name: "Newrez Wholesale", monogram: "NR", logoApproved: false, brandColor: null, tint: 6 },
  { slug: "plaza", name: "Plaza Home Mortgage", monogram: "PH", logoApproved: false, brandColor: null, tint: 1 },
];

export function lenderBrand(slug: string): LenderBrand | undefined {
  return LENDER_BRANDS.find((l) => l.slug === slug);
}

/** The path LenderMark loads an approved logo from. */
export function lenderLogoPath(slug: string): string {
  return `/lenders/${slug}.svg`;
}

/** CSS color for a lender's tint: its confirmed brand color, else our data hue. */
export function lenderTint(l: LenderBrand): string {
  return l.brandColor && /^#[0-9a-f]{6}$/i.test(l.brandColor) ? l.brandColor : `var(--data-${l.tint})`;
}
