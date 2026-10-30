import Link from "next/link";
import StateChip from "@/components/StateChip";
import Orb from "./Orb";
import { copy } from "@/lib/copy";
import { CONFIG, SPONSOR, STATES, stateDisplay, FOOTER_LEGAL } from "@/lib/config";
import FooterOfficerLines from "@/components/mlo/FooterOfficerLines";
import EqualHousingLogo from "@/components/legal/EqualHousingLogo";
import { originationLead, sponsorLicenseLines, tradeNameLine } from "@/lib/licensing";

/**
 * Footer — LOCKED compliance block, one line per licensed state.
 *
 * Contains, on every page:
 *   - wordmark + tagline + link columns
 *   - "licensed in" strip with each state's page link
 *   - NMLS numbers (entity; plus the matched MLO's name and NMLS #
 *     when MloContext has one — never a name without its number),
 *     sponsor sentences
 *   - per-state license lines (entity + MLO license, regulator)
 *   - Equal Housing Opportunity with an accessible text label
 *   - entity / trade-name disclaimer
 *   - the standard "not a commitment to lend" sentence
 *   - the AI disclosure
 *
 * L2 (owner 2026-10-29): the compliance block is the owner's four
 * paragraphs, every fact from lib/config.ts:
 *   1. trade name (exact sentence, nothing after it)
 *   2. originating company + NMLS Consumer Access + every state license
 *   3. loan officer(s), swapped by the visitor's matched state
 *   4. FOOTER_LEGAL (Equal Housing Opportunity, not an offer, …)
 * plus the Equal Housing Opportunity mark, /licensing and the Texas notice.
 */
export default function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <Orb size="mark" px={18} />
              <span className="font-display font-medium tracking-tight">
                Loan<span style={{ color: "var(--color-m8-green)" }}>M8</span>
              </span>
            </div>
            <p className="tagline mt-4 text-lg leading-tight" style={{ color: "var(--fg)" }}>
              {copy.brand.tagline}
            </p>
            <p className="mt-3 text-sm font-light max-w-xs" style={{ color: "var(--muted)" }}>
              {copy.footer.blurb}
            </p>
            <p className="mt-4 text-sm max-w-xs" style={{ color: "var(--fg-soft)" }}>
              <em className="accent-word" style={{ fontSize: "1.05rem", whiteSpace: "normal" }}>{copy.brand.aiLine}</em>
            </p>
          </div>

          {copy.footer.columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase mb-4" style={{ color: "var(--accent)" }}>
                {col.title}
              </div>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="footer-link">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Licensed-in strip */}
        <div className="mt-12 pt-8 border-t" style={{ borderColor: "var(--rule)" }}>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: "var(--muted)" }}>
            {copy.footer.licensedLabel}
          </div>
          <ul className="flex flex-wrap gap-2">
            {STATES.map((s) => (
              <li key={s.slug}>
                <StateChip state={s}>{stateDisplay(s)}</StateChip>
              </li>
            ))}
          </ul>
        </div>

        {/* Compliance block */}
        <div className="mt-10 grid gap-8 md:grid-cols-2 text-xs leading-relaxed font-light" style={{ color: "var(--muted)" }}>
          <div>
            <p className="mb-3">{tradeNameLine()}</p>
            <p className="mb-3">
              {originationLead()} (
              <a href={SPONSOR.nmlsUrl} target="_blank" rel="noopener noreferrer" className="footer-link underline">
                {copy.footer.nmlsConsumerAccess}
              </a>
              ). {sponsorLicenseLines().join(" · ")}.
            </p>
            <p className="mb-3">
              <FooterOfficerLines />
            </p>
            <p className="mb-3">{FOOTER_LEGAL}</p>
            <p>{copy.footer.aiNote}</p>
          </div>
          <div>
            <ul className="space-y-2">
              {STATES.map((s) => (
                <li key={s.slug}>
                  <span style={{ color: "var(--fg-soft)" }}>{stateDisplay(s)}:</span> entity license {s.entityLicense}; MLO license {s.mloLicense}; regulator {s.regulatorName}.
                </li>
              ))}
            </ul>
            <ul className="mt-4 space-y-1.5">
              <li>
                <Link href="/licensing" className="footer-link">
                  {copy.footer.licensingLink}
                </Link>
              </li>
              <li>
                <Link href="/licensing/texas" className="footer-link">
                  {copy.footer.texasNotice}
                </Link>
              </li>
              <li>
                <Link href="/disclosures" className="footer-link">
                  {copy.footer.disclosuresLink}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
            <EqualHousingLogo size={30} />
            <span>{copy.footer.equalHousing}</span>
          </div>
          <p className="font-mono text-[10px] tracking-[0.12em] uppercase" style={{ color: "var(--muted)" }}>
            © {new Date().getFullYear()} {CONFIG.entityLegalName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
