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
import { ccAllMlos, extraMlosLoaded, mloById, type Mlo } from "@/lib/config";
import { SPONSOR } from "@/config/licensing";
import { databaseUrl } from "@/lib/m8/server";

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
  const n = new Set(ccAllMlos().flatMap((m) => m.licenses.map((l) => l.sponsor.idNumber))).size;
  // D45 fail-closed: until this server has loaded the signed-up loan officers,
  // assume another company may exist, so the owner never sees a book they shouldn't.
  return databaseUrl() && !extraMlosLoaded() ? Math.max(n, 2) : n;
}

/** True while every loan officer is under one sponsor: the only time the owner may see every book. */
export const singleCompany = () => companyCount() <= 1;

/**
 * D45: the company a loan officer's messages name. Loan officers in the
 * licensing file are with the sponsor there; signed-up loan officers name
 * their own sponsoring company, so Command Center works for any brokerage.
 */
export function companyDetails(m: Mlo | undefined): { name: string; short: string; nmls: string; address: string; names: string[] } {
  if (m?.source === "signup") {
    const sp = m.licenses[0]?.sponsor;
    const name = sp?.name ?? "";
    return { name, short: name, nmls: sp?.idNumber ?? "", address: m.sponsorAddress ?? "", names: [name] };
  }
  return { name: `${SPONSOR.legalName} dba ${SPONSOR.dba}`, short: SPONSOR.dba, nmls: SPONSOR.nmls, address: SPONSOR.address, names: [SPONSOR.legalName, SPONSOR.dba, "LoanM8"] };
}
