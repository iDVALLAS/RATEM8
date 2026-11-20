import Link from "next/link";

/**
 * The MLO Command logo (owner's artwork, 2026-11-20), shared by the app bar
 * and the sign-in pages. Three layers:
 *  1. An orb behind the crosshair ring that breathes (scale and glow only).
 *  2. The owner's logo, unchanged except that its "Powered by LoanM8" line
 *     was lifted out (public/brand/mlo-command-mark*.webp; the untouched
 *     original is mlo-command-logo.png).
 *  3. "Powered by LoanM8" as vector text in the lettering the owner picked
 *     from the earlier mockup (muted mono "POWERED BY", "Loan" in the text
 *     color, M8 in M8 Green), a couple of points larger.
 */
export default function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="cc-brand" aria-label={label}>
      <span className="cc-logo" aria-hidden="true">
        <svg className="cc-logo__orb" viewBox="0 0 1600 680" focusable="false">
          <defs>
            <radialGradient id="ccLogoHalo" cx="800" cy="296" r="430" gradientUnits="userSpaceOnUse">
              <stop offset="0.7" style={{ stopColor: "var(--cc-logo-halo)", stopOpacity: 0.6 }} />
              <stop offset="1" style={{ stopColor: "var(--cc-logo-halo)", stopOpacity: 0 }} />
            </radialGradient>
            <linearGradient id="ccLogoFill" x1="0" y1="-34" x2="0" y2="626" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: "var(--cc-logo-hi)" }} />
              <stop offset="0.55" style={{ stopColor: "var(--cc-logo-mid)" }} />
              <stop offset="1" style={{ stopColor: "var(--cc-logo-lo)" }} />
            </linearGradient>
          </defs>
          <g className="cc-logo__pulse">
            <circle className="cc-logo__halo" cx="800" cy="296" r="430" fill="url(#ccLogoHalo)" />
            <circle cx="800" cy="296" r="330" fill="url(#ccLogoFill)" />
          </g>
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cc-logo__mark" src="/brand/mlo-command-mark-320.webp" srcSet="/brand/mlo-command-mark-320.webp 320w, /brand/mlo-command-mark-640.webp 640w" sizes="(min-width: 521px) 151px, 125px" width={1600} height={680} alt="" decoding="async" />
        <svg className="cc-logo__powered" viewBox="0 0 1600 680" focusable="false">
          <text x="1588" y="662" textAnchor="end">
            <tspan className="cc-logo__pb">POWERED BY</tspan>
            <tspan className="cc-logo__lm" dx="26">Loan</tspan>
            <tspan className="cc-logo__m8">M8</tspan>
          </text>
        </svg>
      </span>
    </Link>
  );
}
