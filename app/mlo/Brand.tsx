import Link from "next/link";

/**
 * The MLO Command Center logo (owner's artwork, 2026-11-20), shared by the
 * app bar and the sign-in pages. Its accents follow the theme: the
 * fluorescent lime on dark and dim (the same hue as the dark theme's
 * highlight), the artwork's own green on light. Only the greens were
 * recolored; the white lettering is the artwork's. A soft glow behind it
 * breathes in the theme's highlight color (opacity only; still under
 * reduced motion).
 * Files: public/brand/mlo-command-center.png (original) and
 * mlo-command-center-lime.png, with web copies in -green/-lime-480/960.webp.
 * D90: `CcLogo` is the logo alone, so the public coming-soon page's Pilot
 * button shows the same artwork (its sizes come from globals.css there).
 */
export function CcLogo({ sizes = "(min-width: 521px) 210px, 170px" }: { sizes?: string }) {
  return (
    <span className="cc-logo" aria-hidden="true">
      <span className="cc-logo__glow" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cc-logo__img cc-logo__img--lime" src="/brand/mlo-command-center-lime-480.webp" srcSet="/brand/mlo-command-center-lime-480.webp 480w, /brand/mlo-command-center-lime-960.webp 960w" sizes={sizes} width={2155} height={498} alt="" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cc-logo__img cc-logo__img--green" src="/brand/mlo-command-center-green-480.webp" srcSet="/brand/mlo-command-center-green-480.webp 480w, /brand/mlo-command-center-green-960.webp 960w" sizes={sizes} width={2155} height={498} alt="" decoding="async" />
    </span>
  );
}

export default function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="cc-brand" aria-label={label}>
      <CcLogo />
    </Link>
  );
}
