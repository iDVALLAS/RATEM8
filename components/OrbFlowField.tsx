/**
 * Mortgage-vocabulary terms that drift toward the orb's center,
 * fade, and disappear into it — giving the orb an "all-knowing,
 * ingesting" feel. Pure CSS animation, no JS at runtime.
 *
 * Each term gets a starting offset (relative to orb center),
 * a duration, and a delay so the field reads as continuous flow
 * rather than a synchronized loop.
 */

type Term = {
  text: string;
  /** starting offset in px from orb center */
  x: number;
  y: number;
  /** seconds */
  dur: number;
  delay: number;
};

const TERMS: Term[] = [
  { text: "30-year fixed", x: -380, y: -140, dur: 14, delay: 0 },
  { text: "FHA", x: 380, y: -100, dur: 12, delay: 1.5 },
  { text: "VA · 0% down", x: -340, y: 120, dur: 13, delay: 3 },
  { text: "APR vs. note rate", x: 360, y: 80, dur: 15, delay: 0.5 },
  { text: "LTV", x: -210, y: -210, dur: 11, delay: 2 },
  { text: "Jumbo", x: 230, y: -220, dur: 12, delay: 4 },
  { text: "DTI", x: -170, y: 230, dur: 10, delay: 1 },
  { text: "PITI", x: 200, y: 240, dur: 13, delay: 2.5 },
  { text: "5/1 ARM", x: -420, y: 30, dur: 14, delay: 3.5 },
  { text: "rate lock", x: 420, y: -40, dur: 12, delay: 0.8 },
  { text: "wholesale panel", x: -300, y: -70, dur: 11, delay: 5 },
  { text: "soft pull", x: 320, y: 0, dur: 13, delay: 2.2 },
  { text: "cash-out", x: -110, y: -260, dur: 12, delay: 4.5 },
  { text: "HELOC", x: 130, y: -260, dur: 14, delay: 1.8 },
  { text: "rate buy-down", x: -250, y: 200, dur: 13, delay: 3.2 },
  { text: "all-in cost", x: 290, y: 190, dur: 15, delay: 6 },
  { text: "conventional", x: -460, y: -30, dur: 16, delay: 7 },
  { text: "MIP", x: 460, y: 50, dur: 11, delay: 5.5 },
];

export default function OrbFlowField() {
  return (
    <div className="orb-field" aria-hidden="true">
      {TERMS.map((t) => (
        <span
          key={t.text}
          className="orb-term"
          style={
            {
              "--tx": `${t.x}px`,
              "--ty": `${t.y}px`,
              "--dur": `${t.dur}s`,
              "--delay": `${t.delay}s`,
            } as React.CSSProperties
          }
        >
          {t.text}
        </span>
      ))}
    </div>
  );
}
