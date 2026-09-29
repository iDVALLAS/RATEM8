import Link from "next/link";
import Orb from "./Orb";
import { copy } from "@/lib/copy";
import { CONFIG, STATES, stateDisplay, NOT_A_COMMITMENT, ALL_MLOS, isPlaceholder } from "@/lib/config";
import { groupBySponsor } from "@/lib/licensing";

/**
 * Footer — LOCKED compliance block, restructured for four states.
 *
 * Contains, on every page:
 *   - wordmark + tagline + link columns
 *   - "licensed in" strip with each state's page link
 *   - NMLS numbers (entity + each MLO), sponsor sentences
 *   - per-state license lines (entity + MLO license, regulator)
 *   - Equal Housing Lender with an accessible text label
 *   - entity / trade-name disclaimer
 *   - the standard "not a commitment to lend" sentence
 *   - the AI disclosure
 */
export default function Footer() {
  const sponsorGroups = groupBySponsor();
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
                <Link href={`/states/${s.slug}`} className="state-chip">
                  {stateDisplay(s)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Compliance block */}
        <div className="mt-10 grid gap-8 md:grid-cols-2 text-xs leading-relaxed font-light" style={{ color: "var(--muted)" }}>
          <div>
            <p className="mb-3">
              {CONFIG.entityTradeName} is a trade name of {CONFIG.entityLegalName}
              {isPlaceholder(CONFIG.entityNmls) ? "" : ` (NMLS #${CONFIG.entityNmls})`}.
              {ALL_MLOS.map((m) => (
                <span key={m.nmls}>
                  {" "}
                  {m.name}, {m.title}, NMLS #{m.nmls}.
                </span>
              ))}
            </p>
            <p className="mb-3">
              {sponsorGroups.map((g, i) => (
                <span key={`${g.sponsor.name}-${g.sponsor.idNumber}`}>
                  Loans in {g.states.map((s) => s.fullName).join(", ")} are originated through {g.sponsor.name} ({g.sponsor.idLabel} #{g.sponsor.idNumber}).
                  {i < sponsorGroups.length - 1 ? " " : ""}
                </span>
              ))}
            </p>
            <p className="mb-3">{NOT_A_COMMITMENT}</p>
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
            <p className="mt-4">
              <Link href="/disclosures" className="footer-link">
                Full licensing and disclosures
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M3 11 12 3l9 8" />
              <path d="M5 10v10h14V10" />
              <path d="M9 20v-6h6v6" />
              <path d="M8 13h8M8 15.5h8" strokeWidth="1.2" />
            </svg>
            <span>{copy.footer.equalHousing}</span>
            <span className="sr-only">Equal Housing Lender logo</span>
          </div>
          <p className="font-mono text-[10px] tracking-[0.12em] uppercase" style={{ color: "var(--muted)" }}>
            © {new Date().getFullYear()} {CONFIG.entityLegalName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
