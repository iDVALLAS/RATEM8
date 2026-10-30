"use client";

import { SPONSOR, type Sponsor } from "@/lib/config";
import { copy } from "@/lib/copy";
import { useMloContext } from "@/components/mlo/MloContext";

/**
 * SponsorLockup — "powered by {sponsor} · NMLS #{id}" (v35, owner's option B).
 *
 * Texas (7 TAC, team names): the sponsoring company's name and NMLS ID go
 * with the LoanM8 name, in substantially equivalent prominence, joined by a
 * linking phrase, never shaded or shrunk. One site serves every state, so it
 * shows everywhere. Every fact comes from SPONSOR in lib/config.ts: a sponsor
 * change (owner 2026-10-30: likely Barrett soon) is one edit there.
 *
 * Owner 2026-10-30: it follows the visitor's location and loan officer
 * (the beacon, including "Not right? Change"): the matched MLO's license in
 * that state names the sponsor. No match yet → the default SPONSOR.
 *
 * - "stack": beside the wordmark, two lines behind a divider (header, md+).
 * - "line":  one full-width line, with the wordmark (header on phones, the
 *            coming-soon page).
 */
export default function SponsorLockup({ variant, className = "" }: { variant: "stack" | "line"; className?: string }) {
  const ctx = useMloContext();
  const sp: Sponsor = (ctx.mlo && ctx.license?.sponsor) || SPONSOR;
  const name = sp.dba ?? sp.name;
  const id = sp.nmls ? `NMLS #${sp.nmls}` : `${sp.idLabel} #${sp.idNumber}`;
  const by = copy.sponsorLockup.poweredBy;
  if (variant === "stack") {
    return (
      <span className={`sponsor-lockup sponsor-lockup--stack ${className}`.trim()}>
        <span>
          <span className="sponsor-lockup__by">{by}</span> <b>{name}</b>
        </span>
        <span>{id}</span>
      </span>
    );
  }
  return (
    <p className={`sponsor-lockup sponsor-lockup--line ${className}`.trim()}>
      <span className="sponsor-lockup__brand">
        Loan<span style={{ color: "var(--color-m8-green)" }}>M8</span>
      </span>{" "}
      <span className="sponsor-lockup__by">{by}</span> <b>{name}</b> · {id}
    </p>
  );
}
