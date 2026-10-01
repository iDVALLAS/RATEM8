"use client";

import { createContext, useContext } from "react";
import { NO_MLO, fillMlo, nameableMlo, type MloContextValue } from "@/lib/mlo-match";
import type { Mlo } from "@/lib/config";

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
 * Footer line: "Name, Title, NMLS #…" for the matched MLO, nothing
 * otherwise. Keeps the rule "whenever an individual is named on a page,
 * their NMLS number is on the same page" true on every page.
 */
export function MloFooterLine() {
  const mlo = useNamedMlo();
  if (!mlo) return null;
  return (
    <>
      {" "}
      {mlo.name}, {mlo.title}, NMLS #{mlo.nmls}.
    </>
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
export function MloLicenseItem({ nmlsLabel, generic, lookupLabel, lookupHref }: { nmlsLabel: string; generic: string; lookupLabel: string; lookupHref: string }) {
  const mlo = useNamedMlo();
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
