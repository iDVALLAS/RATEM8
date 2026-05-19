/**
 * TermField — mortgage vocabulary that drifts toward the orb's
 * gravitational center from each of four corners. Used as a
 * full-section background in the hero.
 *
 * Animation, color, and mask all live in `.term-field` and
 * `.term` rules in `app/globals.css` (set by patch v5). This
 * component only emits a staggered list of terms — pure data,
 * no client state, server-renderable.
 */

type Term = {
  text: string;
  dir: "tl" | "tr" | "bl" | "br";
  /** seconds */
  delay: number;
  dur: number;
  /** Render as a "number" (slightly larger, paper color) for visual variety */
  num?: boolean;
};

const TERMS: Term[] = [
  // Top-left stream
  { text: "30-year fixed", dir: "tl", delay: 0, dur: 14 },
  { text: "6.25%", dir: "tl", delay: 3.5, dur: 13, num: true },
  { text: "FHA", dir: "tl", delay: 7, dur: 12 },
  { text: "DTI 32", dir: "tl", delay: 10.5, dur: 13 },

  // Top-right stream
  { text: "VA · 0% down", dir: "tr", delay: 1, dur: 13 },
  { text: "LTV 78%", dir: "tr", delay: 4.5, dur: 14, num: true },
  { text: "rate lock", dir: "tr", delay: 8, dur: 12 },
  { text: "5/1 ARM", dir: "tr", delay: 11.5, dur: 13 },

  // Bottom-left stream
  { text: "jumbo", dir: "bl", delay: 0.5, dur: 14 },
  { text: "$420K", dir: "bl", delay: 4, dur: 12, num: true },
  { text: "rate buy-down", dir: "bl", delay: 7.5, dur: 13 },
  { text: "all-in cost", dir: "bl", delay: 11, dur: 13 },

  // Bottom-right stream
  { text: "HELOC", dir: "br", delay: 1.5, dur: 13 },
  { text: "PITI", dir: "br", delay: 5, dur: 14 },
  { text: "soft pull", dir: "br", delay: 8.5, dur: 12 },
  { text: "APR 6.41", dir: "br", delay: 12, dur: 13, num: true },
];

export default function TermField() {
  return (
    <div className="term-field" aria-hidden="true">
      {TERMS.map((t, i) => (
        <span
          key={i}
          className={t.num ? "term term--num" : "term"}
          style={{
            top: "50%",
            left: "50%",
            animation: `drift-${t.dir} ${t.dur}s ease-in-out infinite`,
            animationDelay: `${t.delay}s`,
          }}
        >
          {t.text}
        </span>
      ))}
    </div>
  );
}
