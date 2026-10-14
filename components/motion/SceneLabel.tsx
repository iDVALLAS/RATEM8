/**
 * SceneLabel — the mono corner label that makes animated sections feel
 * like a system: `// 01 — drop`, with an optional running counter.
 *
 * Purely presentational. Text is real content (it is read by screen
 * readers as a heading-adjacent label), not decoration.
 */
type SceneLabelProps = {
  label: string;
  /** e.g. "01 / 05" */
  counter?: string;
  /** Right-corner slot (replay button, sample badge). */
  right?: React.ReactNode;
  className?: string;
};

export default function SceneLabel({ label, counter, right, className = "" }: SceneLabelProps) {
  return (
    <div className={`scene-label ${className}`}>
      <span className="scene-label__text">{label}</span>
      <span className="scene-label__right">
        {counter ? <span className="scene-label__counter">{counter}</span> : null}
        {right}
      </span>
    </div>
  );
}
