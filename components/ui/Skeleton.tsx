/**
 * Skeleton — placeholder bars for a data surface that is still loading
 * (v24). No spinners anywhere: a soft shimmer that stops under reduced
 * motion. Decorative; the region it sits in says what is loading.
 */
export function SkeletonBlock({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" className={`skeleton ${className}`.trim()} style={style} />;
}

export function SkeletonCard({ lines = 4, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`skeleton-card ${className}`.trim()}>
      <SkeletonBlock style={{ width: "38%", height: 10 }} />
      <SkeletonBlock style={{ width: "62%", height: 28, marginTop: 14 }} />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} style={{ width: `${88 - i * 9}%`, height: 10, marginTop: 12 }} />
      ))}
    </div>
  );
}

/** A loading region with a visible label and skeleton cards. */
export default function SkeletonSurface({ label, cards = 3 }: { label: string; cards?: number }) {
  return (
    <div role="status" aria-live="polite" className="skeleton-surface">
      <p className="mono-label skeleton-surface__label">{label}</p>
      <div className="skeleton-surface__grid">
        {Array.from({ length: cards }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
