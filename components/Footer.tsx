import Link from "next/link";
import StateChip from "@/components/StateChip";
import Orb from "./Orb";
import { copy } from "@/lib/copy";
import { CONFIG, STATES, stateDisplay } from "@/lib/config";
import { licensing as lic } from "@/lib/content/licensing";
import EqualHousingLogo from "@/components/legal/EqualHousingLogo";

/**
 * Footer — LOCKED compliance block, one line per licensed state.
 *
 * Contains, on every page:
 *   - wordmark + tagline + link columns
 *   - "licensed in" strip with each state's page link
 *   - C2, the owner's licensing text, all from config/licensing.ts
 *     (lib/content/licensing.ts): the trade-name line; the originating
 *     company, its NMLS (with the Consumer Access link) and every state
 *     license; the loan officers with their NMLS numbers; and the Equal
 *     Housing Opportunity / not-a-commitment paragraph
 *   - the Equal Housing Opportunity logo
 *   - links to /licensing, the Texas Consumer Complaint Notice and
 *     /disclosures
 *   - the AI disclosure
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

        {/* Compliance block (C2): the owner's text, from config/licensing.ts. */}
        <div className="mt-10 grid gap-8 md:grid-cols-[2fr_1fr] text-xs leading-relaxed font-light" style={{ color: "var(--muted)" }}>
          <div className="footer-licensing">
            <p className="mb-3" style={{ color: "var(--fg-soft)" }}>
              {lic.tradeName}
            </p>
            <p className="mb-3">
              {lic.originatedBy} (
              <a href={CONFIG.sponsor.nmlsUrl} target="_blank" rel="noopener noreferrer" className="footer-link">
                {lic.consumerAccess}
              </a>
              ). {lic.licenses}
            </p>
            <p className="mb-3">{lic.loanOfficers}</p>
            <p>{lic.equalHousing}</p>
          </div>
          <div>
            <ul className="space-y-2">
              <li>
                <Link href="/licensing" className="footer-link">
                  {lic.links.licensing}
                </Link>
              </li>
              <li>
                <Link href="/licensing/texas" className="footer-link">
                  {lic.links.texas}
                </Link>
              </li>
              <li>
                <Link href="/disclosures" className="footer-link">
                  {lic.links.disclosures}
                </Link>
              </li>
            </ul>
            <p className="mt-4">{copy.footer.aiNote}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
            <EqualHousingLogo size={28} label={lic.equalHousingLogo} />
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
