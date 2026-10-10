import { lenderBrand, lenderLogoPath, lenderTint, type LenderBrand } from "@/lib/lenders";

/**
 * LenderMark — a lender's mark (v23). Server component (lender names never
 * ship in browser JS; check:bundle).
 *
 * - `logoApproved: true` → the full-colour logo from
 *   public/lenders/{slug}.svg, inside a white/paper chip so a full-colour
 *   mark stays legible on the dark themes.
 * - otherwise → a monogram tile: the lender's initials on a square tinted
 *   with its brand colour (or, until that is confirmed, a data-palette hue).
 *
 * Decorative next to a visible lender name (the default); pass
 * `labelled` when the mark stands alone so it carries the name.
 */
type Props = {
  lender: LenderBrand | string;
  size?: "sm" | "md" | "lg";
  labelled?: boolean;
  className?: string;
};

export default function LenderMark({ lender, size = "md", labelled = false, className = "" }: Props) {
  const l = typeof lender === "string" ? lenderBrand(lender) : lender;
  if (!l) return null;
  const a11y = labelled ? { role: "img", "aria-label": l.name } : { "aria-hidden": true as const };
  if (l.logoApproved) {
    return (
      <span className={`lender-chip lender-chip--${size} ${className}`.trim()} {...a11y}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local SVG, fixed size */}
        <img src={lenderLogoPath(l.slug)} alt="" className="lender-chip__img" />
      </span>
    );
  }
  return (
    <span className={`lender-mono lender-mono--${size} ${className}`.trim()} style={{ "--lender-tint": lenderTint(l) } as React.CSSProperties} {...a11y}>
      {l.monogram}
    </span>
  );
}
