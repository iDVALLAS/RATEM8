import { copy } from "@/lib/copy";

/**
 * TrustLine — the one trust line used site-wide (v18, Item 7):
 * "This is not a credit pull · No lead selling · No trigger leads · Free · No spam".
 * Non-breaking spaces inside each phrase, so it wraps only at the dots.
 */
export default function TrustLine({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <p className={className} style={style}>
      {copy.hero.trustLine.map((item, i) => (
        <span key={item}>
          {i > 0 ? " · " : null}
          {item.replace(/ /g, " ")}
        </span>
      ))}
    </p>
  );
}
