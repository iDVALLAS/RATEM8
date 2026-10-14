import Link from "next/link";

/**
 * CTAButton — the site's button.
 *
 * Variants:
 *   primary   — filled M8 Green (one per view; the main ask)
 *   secondary — bordered, full weight
 *   outline   — dashed border + mono icon; the "row 2" buttons on the
 *               homepage. Visually distinct, never louder than primary.
 *   pill      — compact rounded pill for in-scene CTAs
 *
 * `sub` renders a one-line sub-label under the label.
 * `icon` is a short mono glyph string (e.g. "//", "LE", "M8").
 */
type CTAButtonProps = {
  href: string;
  variant?: "primary" | "secondary" | "outline" | "pill";
  children: React.ReactNode;
  ariaLabel?: string;
  sub?: string;
  icon?: string;
  disabled?: boolean;
  className?: string;
};

export default function CTAButton({ href, variant = "primary", children, ariaLabel, sub, icon, disabled = false, className = "" }: CTAButtonProps) {
  const base = `cta cta--${variant} ${disabled ? "cta--disabled" : ""} ${className}`;
  const inner = (
    <>
      {icon ? (
        <span aria-hidden="true" className="cta__icon">
          {icon}
        </span>
      ) : null}
      <span className="cta__text">
        <span className="cta__label">{children}</span>
        {sub ? <span className="cta__sub">{sub}</span> : null}
      </span>
      <span aria-hidden="true" className="cta__arrow">
        →
      </span>
    </>
  );

  if (disabled) {
    return (
      <span className={base} aria-disabled="true" role="link" aria-label={ariaLabel}>
        {inner}
      </span>
    );
  }

  const isExternal = href.startsWith("http");
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel} className={base}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} aria-label={ariaLabel} className={base}>
      {inner}
    </Link>
  );
}
