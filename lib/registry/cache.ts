/**
 * lib/registry/cache.ts — loads approved sign-ups as loan officer records
 * (D45). SERVER-ONLY. Every signed-in request (lib/accounts/auth.ts
 * userForSession) and every route that runs without a session (the morning
 * run, Twilio, lead and loan intake, client pages) calls ensureRegistry()
 * first. Until it has loaded once, lib/accounts/company.ts assumes more
 * than one sponsoring company (fail closed).
 */
import { setExtraMlos, type Mlo, type MloLicense } from "@/lib/config";
import { signUpStore, type SignUp } from "./store";

const TTL_MS = 60_000;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

/** The NMLS Consumer Access page for an individual (for a person to check, never fetched by us). */
export const nmlsRecordUrl = (nmls: string) => `https://www.nmlsconsumeraccess.org/EntityDetails.aspx/INDIVIDUAL/${encodeURIComponent(nmls)}`;

/** An approved sign-up as a loan officer record. */
export function toMlo(s: SignUp): Mlo {
  const sponsor = { name: s.sponsorName, idLabel: "NMLS", idNumber: s.sponsorNmls };
  const since = (s.decidedAt ?? s.createdAt).slice(0, 10);
  return {
    id: s.mloId ?? `mlo-s${s.id.slice(2, 12)}`,
    name: s.name,
    firstName: s.name.split(/\s+/)[0] ?? s.name,
    nmls: s.nmls,
    title: "Loan officer",
    bioShort: "",
    nmlsConsumerAccessUrl: nmlsRecordUrl(s.nmls),
    photo: "[PHOTO]",
    calendly: s.calendly,
    phone: s.phone || undefined,
    applicationUrl: s.applicationUrl || "[APPLICATION URL]",
    // The type lists the public site's states; Command Center works in every state.
    licenses: s.licenses.map((l) => ({ state: l.state, license: l.license || `NMLS ID ${s.nmls}`, sponsor, sponsorSince: since }) as unknown as MloLicense),
    brand: s.sponsorName,
    sponsorAddress: s.sponsorAddress,
    source: "signup",
  };
}

export async function refreshRegistry(): Promise<void> {
  const approved = await signUpStore().list("approved");
  setExtraMlos(approved.map(toMlo));
  loadedAt = Date.now();
}

/** Loads (or refreshes, after a minute) the signed-up loan officers. Never throws. */
export async function ensureRegistry(now = Date.now()): Promise<void> {
  if (loadedAt && now - loadedAt < TTL_MS) return;
  inflight ??= refreshRegistry()
    .catch(() => {
      // Keep the last good list; company.ts stays fail-closed if none has loaded.
    })
    .finally(() => {
      inflight = null;
    });
  await inflight;
}

export function resetRegistryForTests(): void {
  loadedAt = 0;
  inflight = null;
}
