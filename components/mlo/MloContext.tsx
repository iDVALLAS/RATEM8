"use client";

import { createContext, useContext } from "react";
import { NO_MLO, fillMlo, nameableMlo, type MloContextValue } from "@/lib/mlo-match";
import { hasBooking, type Mlo } from "@/lib/config";
import { copy } from "@/lib/copy";
import CTAButton from "@/components/CTAButton";

/**
 * MloContext — which loan officer (if any) this visitor is matched to
 * (v14, Edit 6b). Minimal on purpose: `{ mlo, source }` with
 * `source: "none"` for everyone until Patch B (state routing and the
 * location beacon) fills it. The naming rule lives in lib/mlo-match.ts.
 *
 * Server components render <MloText generic=… named=…/> with plain
 * strings from lib/copy.ts; this file swaps in the name only when the
 * rule allows it.
 */
const MloContext = createContext<MloContextValue>(NO_MLO);

export function MloProvider({ value = NO_MLO, children }: { value?: MloContextValue; children: React.ReactNode }) {
  return <MloContext.Provider value={value}>{children}</MloContext.Provider>;
}

export function useMloContext(): MloContextValue {
  return useContext(MloContext);
}

/** The MLO the page may name right now, or null. */
export function useNamedMlo(): Mlo | null {
  return nameableMlo(useContext(MloContext));
}

/**
 * Generic copy by default; `named` (a template with {first} / {name})
 * once the visitor is matched. Without `named`, always generic.
 */
export function MloText({ generic, named }: { generic: string; named?: string }) {
  const mlo = useNamedMlo();
  return <>{mlo && named ? fillMlo(named, mlo) : generic}</>;
}

/**
 * Footer line for the matched MLO: name, title, NMLS number, the state
 * license number and the sponsoring entity, all from ONE context value so
 * a page can never mix two MLOs. Nothing when no one is named. Keeps
 * "whenever an individual is named on a page, their NMLS number is on
 * the same page" true on every page.
 */
export function MloFooterLine() {
  const ctx = useContext(MloContext);
  const mlo = nameableMlo(ctx);
  if (!mlo) return null;
  const l = ctx.license;
  if (!l) {
    return (
      <>
        {" "}
        {mlo.name}, {mlo.title}, NMLS #{mlo.nmls}.
      </>
    );
  }
  return (
    <>
      {" "}
      {copy.routing.footerLine
        .replace("{name}", mlo.name)
        .replace("{title}", mlo.title)
        .replace("{nmls}", mlo.nmls)
        .replace("{state}", ctx.stateName ?? l.state)
        .replace("{license}", l.license)
        .replace("{sponsor}", l.sponsor.name)
        .replace("{sponsorLabel}", l.sponsor.idLabel)
        .replace("{sponsorId}", l.sponsor.idNumber)}
    </>
  );
}

/**
 * Borrower booking button (v15): the matched MLO's own booking link when
 * routing has a match; "coming soon" if theirs isn't set; an honest
 * "no licensed loan officer in X yet" in an unlicensed state; otherwise
 * the site-wide link the server passed in.
 */
export function MloBookingButton({
  fallbackUrl,
  variant,
  sub,
  ariaLabel,
  children,
}: {
  fallbackUrl: string;
  variant: "primary" | "secondary" | "outline" | "pill";
  sub?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(MloContext);
  const mlo = ctx.status === "matched" ? ctx.mlo : null;
  if (ctx.status === "unlicensed") {
    return (
      <CTAButton href="#" variant={variant} sub={copy.routing.unlicensedBooking.replace("{state}", ctx.stateName ?? "")} ariaLabel={ariaLabel} disabled>
        {children}
      </CTAButton>
    );
  }
  const url = mlo ? mlo.calendly : fallbackUrl;
  return hasBooking(url) ? (
    <CTAButton href={url} variant={variant} sub={sub} ariaLabel={ariaLabel}>
      {children}
    </CTAButton>
  ) : (
    <CTAButton href="#" variant={variant} sub={sub ?? "Booking link coming soon"} ariaLabel={ariaLabel} disabled>
      {children}
    </CTAButton>
  );
}

/** True when a name is showing (for server-rendered siblings that must stay generic otherwise). */
export function MloNamedOnly({ children }: { children: React.ReactNode }) {
  return useNamedMlo() ? <>{children}</> : null;
}

/**
 * State page "Loan originators" row: the matched MLO with NMLS number
 * and lookup link, or a generic line plus the public lookup.
 */
export function MloLicenseItem({
  stateCode,
  nmlsLabel,
  generic,
  lookupLabel,
  lookupHref,
}: {
  /** The page's state: a matched MLO shows only if licensed here (never another state's MLO). */
  stateCode: string;
  nmlsLabel: string;
  generic: string;
  lookupLabel: string;
  lookupHref: string;
}) {
  const named = useNamedMlo();
  const mlo = named && named.licenses.some((l) => l.state === stateCode) ? named : null;
  if (!mlo) {
    return (
      <li>
        {generic}{" "}
        <a href={lookupHref} target="_blank" rel="noopener noreferrer">
          {lookupLabel}
        </a>
      </li>
    );
  }
  const verifiable = /^https?:\/\//.test(mlo.nmlsConsumerAccessUrl);
  return (
    <li>
      {verifiable ? (
        <a href={mlo.nmlsConsumerAccessUrl} target="_blank" rel="noopener noreferrer">
          {mlo.name}
        </a>
      ) : (
        mlo.name
      )}{" "}
      <span>
        {nmlsLabel} #{mlo.nmls}
      </span>
    </li>
  );
}
