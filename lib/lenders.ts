/**
 * lib/lenders.ts — lender BRAND registry for <LenderMark /> (v23).
 *
 * Separate from lib/pricing/lenders.ts (the panel and its consent flags),
 * keyed by the same slugs: the same 14 lenders (v27).
 *
 * Rules:
 *  - `logoApproved` is the owner's call per lender (v26: approved for every
 *    lender whose logo the owner supplied, except Kind's cropped file).
 *    Without it, or without a file, LenderMark draws a monogram tile.
 *  - Logo files are supplied by the owner (public/lenders/, `logoFile`).
 *    Nothing here was downloaded, scraped, or redrawn; files were only
 *    cropped to their artwork. A test fails the build if an approved
 *    lender has no file.
 *  - `brandColor` is measured from the lender's own logo file (its
 *    dominant colour); null tints with our data palette (`tint`).
 *  - Fallback if a lender objects: set CONFIG.demo.namedLenders = false and
 *    the demo reverts to "Lender 1 / 2 / 3" with numbered tiles.
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
  /** The owner-supplied file in public/lenders/ (null until supplied). */
  logoFile: string | null;
  /** The lender's own colour (v26: the dominant colour of its supplied logo). */
  brandColor: string | null;
  /** Fallback tint from LoanM8's data palette (--data-N). */
  tint: DataHue;
};

export const LENDER_BRANDS: readonly LenderBrand[] = [
  // v26: logos supplied by the owner (Lender_Logos.zip, 2026-10-11), cropped
  // to their artwork and re-encoded as PNG; never redrawn. brandColor is the
  // logo's own dominant colour, measured from the supplied file.
  { slug: "uwm", name: "UWM", monogram: "UWM", logoApproved: true, logoFile: "uwm.png", brandColor: "#005F9F", tint: 1 },
  // The supplied file is the "Rocket Mortgage" logo; the demo names Rocket Pro TPO.
  { slug: "rocket-pro", name: "Rocket Pro TPO", monogram: "RP", logoApproved: true, logoFile: "rocket-pro.png", brandColor: "#C8202F", tint: 4 },
  // The supplied Kind file is cropped ("ind Lendir"), so Kind stays a monogram until a complete file arrives.
  { slug: "kind", name: "Kind Lending", monogram: "KL", logoApproved: false, logoFile: null, brandColor: "#004B87", tint: 3 },
  { slug: "the-loan-store", name: "The Loan Store", monogram: "LS", logoApproved: true, logoFile: "the-loan-store.png", brandColor: "#103C60", tint: 2 },
  { slug: "prmg", name: "PRMG", monogram: "PR", logoApproved: true, logoFile: "prmg.png", brandColor: "#003DA6", tint: 5 },
  { slug: "pennymac", name: "Pennymac TPO", monogram: "PM", logoApproved: true, logoFile: "pennymac.png", brandColor: "#F2C400", tint: 6 },
  { slug: "freedom", name: "Freedom Mortgage", monogram: "FM", logoApproved: true, logoFile: "freedom.png", brandColor: "#9F8731", tint: 1 },
  { slug: "remn", name: "REMN Wholesale", monogram: "RW", logoApproved: true, logoFile: "remn.png", brandColor: "#00467F", tint: 2 },
  // The supplied file reads "RiseUp Lending".
  { slug: "rise", name: "RISE TPO", monogram: "RT", logoApproved: true, logoFile: "rise.png", brandColor: "#023B45", tint: 4 },
  { slug: "newrez", name: "Newrez Wholesale", monogram: "NR", logoApproved: true, logoFile: "newrez.png", brandColor: "#022F3D", tint: 6 },
  // v26: new in the owner's logo set (names as printed on the logos); on the
  // panel since v27. Aven, HELIX and NFTYDoor are HELOC-only programs.
  { slug: "aven", name: "Aven", monogram: "AV", logoApproved: true, logoFile: "aven.png", brandColor: null, tint: 2 },
  { slug: "helix", name: "HELIX", monogram: "HL", logoApproved: true, logoFile: "helix.png", brandColor: "#00A3F4", tint: 1 },
  { slug: "nations-direct", name: "Nations Direct Mortgage", monogram: "ND", logoApproved: true, logoFile: "nations-direct.png", brandColor: "#BF2232", tint: 4 },
  { slug: "nftydoor", name: "NFTYDoor", monogram: "NF", logoApproved: true, logoFile: "nftydoor.png", brandColor: "#0069C4", tint: 3 },
];

export function lenderBrand(slug: string): LenderBrand | undefined {
  return LENDER_BRANDS.find((l) => l.slug === slug);
}

/** The path LenderMark loads an approved logo from (null when there is no file). */
export function lenderLogoPath(l: Pick<LenderBrand, "logoFile">): string | null {
  return l.logoFile && /^[a-z0-9-]+\.(png|svg|webp)$/.test(l.logoFile) ? `/lenders/${l.logoFile}` : null;
}

/** CSS color for a lender's tint: its confirmed brand color, else our data hue. */
export function lenderTint(l: LenderBrand): string {
  return l.brandColor && /^#[0-9a-f]{6}$/i.test(l.brandColor) ? l.brandColor : `var(--data-${l.tint})`;
}
