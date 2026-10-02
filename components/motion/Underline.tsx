/**
 * Underline — a hand-drawn SVG stroke that draws itself under an
 * accent word. Decorative: aria-hidden. Uses stroke-dashoffset with a
 * CSS transition; reduced motion renders it fully drawn.
 */
type UnderlineProps = {
  active: boolean;
  delay?: number;
  className?: string;
};

export default function Underline({ active, delay = 0, className = "" }: UnderlineProps) {
  return (
    <svg
      aria-hidden="true"
      className={`hand-underline ${active ? "hand-underline--on" : ""} ${className}`}
      viewBox="0 0 200 14"
      preserveAspectRatio="none"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <path
        d="M3 9 C 40 3, 70 12, 100 7 S 160 3, 197 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        pathLength="1"
      />
    </svg>
  );
}
