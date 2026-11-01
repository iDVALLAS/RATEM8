/**
 * The Equal Housing Opportunity mark (C2): a house with the equal sign,
 * drawn inline in currentColor so it follows every theme. Decorative; the
 * visible "Equal Housing Opportunity" text beside it carries the meaning,
 * and the label is for screen readers that announce images.
 */
export default function EqualHousingLogo({ size = 28, label }: { size?: number; label: string }) {
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 32 32" fill="currentColor">
      <path d="M16 3 2 13.5h3.5V29h21V13.5H30L16 3Zm7.5 23h-15V12.4L16 6.8l7.5 5.6V26Z" />
      <rect x="11" y="14" width="10" height="2.6" />
      <rect x="11" y="19" width="10" height="2.6" />
    </svg>
  );
}
