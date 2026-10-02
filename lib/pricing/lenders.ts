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
 * restrict consumer distribution (see docs/work/pricing-integration-findings.md §6, §8).
 */
import type { LenderRef } from "./types";

export type LenderRecord = LenderRef & {
  /** Public terms restrict consumer distribution of its pricing. */
  restrictsConsumerDisplay: boolean;
  /** Written permission to display (anonymized) is on file. */
  displayConsent: boolean;
};

export const LENDERS: readonly LenderRecord[] = [
  { key: "uwm", name: "UWM", manual: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "the-loan-store", name: "The Loan Store", manual: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "prmg", name: "PRMG", manual: true, restrictsConsumerDisplay: true, displayConsent: false },
  { key: "pennymac", name: "Pennymac TPO", manual: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "freedom", name: "Freedom Mortgage", manual: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "remn", name: "REMN Wholesale", manual: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "provident", name: "Provident Funding", manual: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "rise", name: "RISE TPO", manual: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "homexpress", name: "HomeXpress", manual: true, restrictsConsumerDisplay: true, displayConsent: false },
  { key: "newrez", name: "Newrez Wholesale", manual: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "kind", name: "Kind Lending", manual: true, restrictsConsumerDisplay: false, displayConsent: false },
  { key: "plaza", name: "Plaza Home Mortgage", manual: true, restrictsConsumerDisplay: true, displayConsent: false },
];

export function lenderByKey(key: string): LenderRecord | undefined {
  return LENDERS.find((l) => l.key === key);
}

/** May this lender's pricing appear (anonymized) in a published snapshot? */
export function publishable(key: string): boolean {
  const l = lenderByKey(key);
  if (!l) return false;
  return !l.restrictsConsumerDisplay || l.displayConsent;
}
