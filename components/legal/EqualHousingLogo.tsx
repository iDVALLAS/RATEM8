/**
 * EqualHousingLogo — the Equal Housing Opportunity mark (L2): the house
 * with an equals sign. The words "Equal Housing Opportunity" sit beside it
 * as real text (legible at any size, read by screen readers), so the SVG
 * itself is decorative. Drawn in currentColor for Night, Dim and Paper.
 */
export default function EqualHousingLogo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={(size * 82) / 100} viewBox="0 0 100 82" aria-hidden="true" fill="currentColor">
      <path d="M50 4 4 38h10v40h72V38h10L50 4Zm0 11 28 21v34H22V36l28-21Z" />
      <rect x="32" y="44" width="36" height="8" />
      <rect x="32" y="58" width="36" height="8" />
    </svg>
  );
}
