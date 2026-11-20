import Link from "next/link";

/**
 * The MLO Command logo (owner's artwork, 2026-11-20), shared by the app bar
 * and the sign-in pages. Two layers: the orb, drawn here so it can breathe
 * (scale and glow only, a 3s breath), and the badge image on
 * top (public/brand/mlo-command-badge*.webp; only the black around the
 * outside was removed). "Powered by LoanM8" is live text (M8 in M8 Green).
 */
export default function Brand({ href, label, powered = true }: { href: string; label: string; powered?: boolean }) {
  return (
    <Link href={href} className="cc-brand" aria-label={label}>
      <span className="cc-logo" aria-hidden="true">
        <svg className="cc-logo__orb" viewBox="0 0 830 410" focusable="false">
          <defs>
            <radialGradient id="ccLogoHalo" cx="413" cy="203" r="250" gradientUnits="userSpaceOnUse">
              <stop offset="0.62" style={{ stopColor: "var(--cc-logo-halo)", stopOpacity: 0.7 }} />
              <stop offset="1" style={{ stopColor: "var(--cc-logo-halo)", stopOpacity: 0 }} />
            </radialGradient>
            <linearGradient id="ccLogoFill" x1="0" y1="20" x2="0" y2="386" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: "var(--cc-logo-hi)" }} />
              <stop offset="0.55" style={{ stopColor: "var(--cc-logo-mid)" }} />
              <stop offset="1" style={{ stopColor: "var(--cc-logo-lo)" }} />
            </linearGradient>
          </defs>
          <g className="cc-logo__pulse">
            <circle className="cc-logo__halo" cx="413" cy="203" r="250" fill="url(#ccLogoHalo)" />
            <circle cx="413" cy="203" r="183" fill="url(#ccLogoFill)" />
          </g>
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cc-logo__badge" src="/brand/mlo-command-badge-360.webp" srcSet="/brand/mlo-command-badge-360.webp 360w, /brand/mlo-command-badge.webp 830w" sizes="(min-width: 768px) 140px, 112px" width={830} height={410} alt="" decoding="async" />
      </span>
      {powered ? <span className="cc-brand__powered" aria-hidden="true">Powered by <span className="cc-brand__lm">Loan<span className="cc-m8">M8</span></span></span> : null}
    </Link>
  );
}
