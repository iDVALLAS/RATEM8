type OrbProps = {
  size?: "hero" | "ambient" | "mark";
  className?: string;
};

const sizeMap: Record<NonNullable<OrbProps["size"]>, number> = {
  hero: 220,
  ambient: 48,
  mark: 24,
};

export default function Orb({ size = "hero", className = "" }: OrbProps) {
  const px = sizeMap[size];
  return (
    <span
      aria-hidden="true"
      className={`orb ${className}`}
      style={{ width: px, height: px }}
    />
  );
}
