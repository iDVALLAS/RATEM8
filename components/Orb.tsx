/**
 * Orb — the brand character. LOCKED visuals.
 *
 * Never changes color. Never changes shape. Always breathes.
 * Sizes: hero 220px, ambient 48px, mark 24px.
 *
 * `state` changes ONLY animation speed, scale amplitude, and halo
 * intensity (see `.orb--listening/thinking/speaking` in globals.css).
 * Hue and shape are untouched in every state.
 */

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

type OrbProps = {
  size?: "hero" | "ambient" | "mark";
  state?: OrbState;
  className?: string;
  /** Override pixel size for special placements (footer 18px, etc.). */
  px?: number;
  style?: React.CSSProperties;
};

const sizeMap: Record<NonNullable<OrbProps["size"]>, number> = {
  hero: 220,
  ambient: 48,
  mark: 24,
};

export default function Orb({ size = "hero", state = "idle", className = "", px, style }: OrbProps) {
  const dim = px ?? sizeMap[size];
  const stateClass = state === "idle" ? "" : `orb--${state}`;
  return (
    <span
      aria-hidden="true"
      data-orb-state={state}
      className={`orb ${stateClass} ${className}`.trim()}
      style={{ width: dim, height: dim, ...style }}
    />
  );
}
