/**
 * lib/accounts/company.ts — which sponsoring company each account belongs
 * to (D22). Client data never crosses company lines (GLBA and Reg P; the
 * Safeguards Rule, 16 CFR 314.4(c)(1); research spec §8.3).
 *
 * A company is the sponsoring brokerage on a loan officer's licenses
 * (config/licensing.ts, by its NMLS number). Today every loan officer is
 * under one sponsor, so the owner can see every book. As soon as a second
 * sponsor appears in the licensing config, that stops on its own: the owner
 * sees only their own book plus counts for the others (Team page), and an
 * assistant can only work for a loan officer in their own company.
 */
import { ALL_MLOS, mloById } from "@/lib/config";

/** The sponsoring company (its NMLS number) of a loan officer record. */
export function companyOfMlo(mloId: string | null | undefined): string | null {
  const m = mloById(mloId ?? null);
  return m?.licenses[0]?.sponsor.idNumber ?? null;
}

let testCompanies: number | null = null;
export function setCompanyCountForTests(n: number | null) {
  testCompanies = n;
}

/** How many sponsoring companies have loan officers on this platform. */
export function companyCount(): number {
  if (testCompanies !== null) return testCompanies;
  return new Set(ALL_MLOS.flatMap((m) => m.licenses.map((l) => l.sponsor.idNumber))).size;
}

/** True while every loan officer is under one sponsor: the only time the owner may see every book. */
export const singleCompany = () => companyCount() <= 1;
