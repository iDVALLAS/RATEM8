/**
 * lib/pricing/lenders.ts — the wholesale lenders the operator works with.
 *
 * SERVER-ONLY DATA. Real lender names never reach a public surface: every
 * public run is re-lettered (anonymize.ts). Import this only from server
 * components, server actions, route handlers and tests.
 *
 * `manual: true` marks lenders whose pricing is entered by a person (the
 * manual provider). With the manual path every lender is manual.
 * Consent flags record written display permission; a lender without
 * `displayConsent` is excluded from published snapshots when its terms
 * restrict consumer distribution or have not been reviewed yet (see
 * docs/work/pricing-integration-findings.md §6, §8).
 * `products` keeps HELOC-only programs out of first-mortgage pricing.
 */
import type { LenderRef } from "./types";

export type LenderProduct = "first_mortgage" | "heloc";

export type LenderRecord = LenderRef & {
  /** What this lender can price. Every current pricing scenario is a first mortgage. */
  products: readonly LenderProduct[];
  /** Its public terms have been reviewed (docs/work/pricing-integration-findings.md). */
  termsReviewed: boolean;
  /** Public terms restrict consumer distribution of its pricing. */
  restrictsConsumerDisplay: boolean;
  /** Written permission to display (anonymized) is on file. */
  displayConsent: boolean;
  /**
   * HELOC-only automated programs (owner, 2026-10-11): one credit bureau
   * (not necessarily the same bureau from program to program) and income
   * through a Plaid bank connection.
   */
  heloc?: { automated: true; creditPull: string; income: string };
};

const HELOC_PROGRAM = {
  automated: true,
  creditPull: "One credit bureau; which bureau varies by program",
  income: "Plaid bank connection",
} as const;

/**
 * The operator's panel (v27, owner 2026-10-11): these 14 lenders, the same
 * set as the logos in lib/lenders.ts. Provident Funding, HomeXpress and
 * Plaza Home Mortgage were removed. Rocket Pro TPO, Nations Direct and the
 * three HELOC programs were not in the 2026-10-01 terms review, so they
 * stay unpublishable until reviewed or until written consent is recorded.
 */
export const LENDERS: readonly LenderRecord[] = [
  { key: "uwm", name: "UWM", manual: true, products: ["first_mortgage"], termsReviewed: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "rocket-pro", name: "Rocket Pro TPO", manual: true, products: ["first_mortgage"], termsReviewed: false, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "kind", name: "Kind Lending", manual: true, products: ["first_mortgage"], termsReviewed: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "the-loan-store", name: "The Loan Store", manual: true, products: ["first_mortgage"], termsReviewed: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "prmg", name: "PRMG", manual: true, products: ["first_mortgage"], termsReviewed: true, restrictsConsumerDisplay: true, displayConsent: false },
  { key: "pennymac", name: "Pennymac TPO", manual: true, products: ["first_mortgage"], termsReviewed: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "freedom", name: "Freedom Mortgage", manual: true, products: ["first_mortgage"], termsReviewed: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "remn", name: "REMN Wholesale", manual: true, products: ["first_mortgage"], termsReviewed: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "rise", name: "RISE TPO", manual: true, products: ["first_mortgage"], termsReviewed: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "newrez", name: "Newrez Wholesale", manual: true, products: ["first_mortgage"], termsReviewed: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "nations-direct", name: "Nations Direct Mortgage", manual: true, products: ["first_mortgage"], termsReviewed: false, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "aven", name: "Aven", manual: true, products: ["heloc"], heloc: HELOC_PROGRAM, termsReviewed: false, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "helix", name: "HELIX", manual: true, products: ["heloc"], heloc: HELOC_PROGRAM, termsReviewed: false, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "nftydoor", name: "NFTYDoor", manual: true, products: ["heloc"], heloc: HELOC_PROGRAM, termsReviewed: false, restrictsConsumerDisplay: false, displayConsent: false },
];

export function lenderByKey(key: string): LenderRecord | undefined {
  return LENDERS.find((l) => l.key === key);
}

/**
 * May this lender's pricing appear (anonymized) in a published snapshot?
 * Written consent always allows it; otherwise its terms must have been
 * reviewed and found not to restrict consumer display.
 */
export function publishable(key: string): boolean {
  const l = lenderByKey(key);
  if (!l) return false;
  return l.displayConsent || (l.termsReviewed && !l.restrictsConsumerDisplay);
}

/** Does this lender price that product? */
export function offers(key: string, product: LenderProduct): boolean {
  return !!lenderByKey(key)?.products.includes(product);
}

/** Panel lenders that price a product (e.g. first mortgages for every current scenario). */
export function lendersFor(product: LenderProduct): readonly LenderRecord[] {
  return LENDERS.filter((l) => l.products.includes(product));
}
