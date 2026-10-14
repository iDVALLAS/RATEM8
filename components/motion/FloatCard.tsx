import "./stage.css";

/**
 * FloatCard — a floating UI card: sunken surface, 16px radius, 1px rule,
 * deep soft shadow, slight lift on hover (none under reduced motion).
 *
 * `StageVisual` is the rounded "image block" it floats over: a gradient
 * plus the orb, never a photo (fair-housing rule). Both are decorative
 * in the step lists; callers mark them aria-hidden there.
 */
type FloatCardProps = {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "article";
};

export default function FloatCard({ children, className = "", as: Tag = "div" }: FloatCardProps) {
  return <Tag className={`float-card ${className}`.trim()}>{children}</Tag>;
}

type StageVisualProps = {
  /** The orb (or anything) shown inside the gradient block. */
  block: React.ReactNode;
  /** The floating card's contents. */
  children: React.ReactNode;
  className?: string;
};

export function StageVisual({ block, children, className = "" }: StageVisualProps) {
  return (
    <div className={`stage-visual ${className}`.trim()}>
      <div className="stage-image">{block}</div>
      <FloatCard>{children}</FloatCard>
    </div>
  );
}
