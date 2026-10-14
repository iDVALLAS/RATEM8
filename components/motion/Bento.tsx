/**
 * Bento — dashed-to-filled grid.
 *
 * Every slot renders as a dashed outline first. When `filled` becomes
 * true for a slot (driven by a scene step), the real content fades in
 * and the border goes solid. Sequence delays are handled by the parent
 * via `step` comparisons, so no timers live here.
 *
 * Reduced motion: parent passes all slots as filled from the start.
 */
type BentoSlotProps = {
  filled: boolean;
  label?: string;
  children: React.ReactNode;
  className?: string;
  /** Tailwind grid classes for span. */
  span?: string;
};

export function BentoSlot({ filled, label, children, className = "", span = "" }: BentoSlotProps) {
  return (
    <div className={`bento-slot ${filled ? "bento-slot--filled" : ""} ${span} ${className}`}>
      {label ? <div className="bento-slot__label">{label}</div> : null}
      <div className="bento-slot__body">{children}</div>
    </div>
  );
}

type BentoProps = {
  children: React.ReactNode;
  className?: string;
  cols?: 1 | 2 | 3;
};

export default function Bento({ children, className = "", cols = 2 }: BentoProps) {
  const colClass = cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : "";
  return <div className={`bento grid gap-3 sm:gap-4 ${colClass} ${className}`}>{children}</div>;
}
