/**
 * TermField — V4 behavior restored.
 *
 * Loan-related words float in from varied positions around the orb
 * and converge into the orb body. Each term has its own starting
 * offset (--tx, --ty) and animation duration; all share the same
 * `drift-in` keyframe that ends at the orb's center.
 *
 * The field itself is sized to wrap only the orb area — it does
 * NOT cover the rest of the hero (the tagline and CTAs sit cleanly
 * below it with no overflowing terms).
 */

type Term = {
  text: string;
  /** Starting offset from orb center, in px. Terms drift toward (0,0). */
  x: number;
  y: number;
  /** seconds */
  dur: number;
  delay: number;
};

const TERMS: Term[] = [
  // Top arc
  { text: "30-year fixed", x: -360, y: -180, dur: 14, delay: 0 },
  { text: "cash-out", x: -110, y: -240, dur: 13, delay: 4.5 },
  { text: "HELOC", x: 130, y: -240, dur: 14, delay: 1.8 },
  { text: "jumbo", x: 280, y: -200, dur: 12, delay: 4 },
  { text: "FHA", x: 360, y: -130, dur: 12, delay: 1.5 },

  // Middle band (left + right of orb)
  { text: "5/1 ARM", x: -420, y: 20, dur: 14, delay: 3.5 },
  { text: "wholesale panel", x: -300, y: -50, dur: 11, delay: 5 },
  { text: "soft pull", x: 310, y: -20, dur: 13, delay: 2.2 },
  { text: "rate lock", x: 420, y: 30, dur: 12, delay: 0.8 },
  { text: "conventional", x: -340, y: 90, dur: 13, delay: 6 },
  { text: "APR vs. note rate", x: 340, y: 110, dur: 15, delay: 0.5 },

  // Bottom arc
  { text: "rate buy-down", x: -250, y: 200, dur: 13, delay: 3.2 },
  { text: "VA · 0% down", x: -90, y: 240, dur: 13, delay: 7 },
  { text: "all-in cost", x: 100, y: 240, dur: 13, delay: 2.7 },
  { text: "MIP", x: 270, y: 200, dur: 11, delay: 5.5 },
];

export default function TermField() {
  return (
    <div className="term-field" aria-hidden="true">
      {TERMS.map((t, i) => (
        <span
          key={i}
          className="term"
          style={
            {
              "--tx": `${t.x}px`,
              "--ty": `${t.y}px`,
              "--dur": `${t.dur}s`,
              animationDelay: `${t.delay}s`,
            } as React.CSSProperties
          }
        >
          {t.text}
        </span>
      ))}
    </div>
  );
}
