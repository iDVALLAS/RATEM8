import Reveal from "./Reveal";

/**
 * SlideHeadline — the big Fraunces slide headline.
 *
 * `lines` render one under the other. Non-accent words sit at
 * `--fg-soft`; the `accent` phrase (inside the key line) renders in M8
 * Green through Reveal. On dark chapters `dim` fades every line before
 * the key line to 55% so the key line reads brightest.
 *
 * Each line is a word-by-word Reveal (viewport-triggered, reduced-motion
 * aware). Screen readers get the full text once per line via Reveal's
 * own sr-only span. `runKey` remounts the lines so a Scene replay
 * replays the reveal.
 */
type SlideHeadlineProps = {
  lines: readonly string[];
  accent?: string;
  /** Index of the key line (default: the line containing `accent`, else the last). */
  keyLine?: number;
  dim?: boolean;
  underline?: boolean;
  as?: "h1" | "h2" | "h3";
  className?: string;
  id?: string;
  runKey?: string | number;
};

/** Split a title into lines at sentence boundaries, keeping the text verbatim. */
export function splitLines(title: string): string[] {
  const parts = title.match(/[^.?!]+[.?!]+["']?|[^.?!]+$/g);
  return parts ? parts.map((p) => p.trim()).filter(Boolean) : [title];
}

export default function SlideHeadline({ lines, accent, keyLine, dim = false, underline = false, as: Tag = "h2", className = "", id, runKey = 0 }: SlideHeadlineProps) {
  const found = accent ? lines.findIndex((l) => l.includes(accent)) : -1;
  const key = keyLine ?? (found >= 0 ? found : lines.length - 1);
  return (
    <Tag id={id} className={`tagline stage-headline ${dim ? "stage-headline--dim" : ""} ${className}`.trim()}>
      {lines.map((line, i) => (
        <Reveal
          key={`${runKey}-${i}`}
          as="span"
          text={line}
          accent={i === key ? accent : undefined}
          underline={i === key && underline}
          delay={i * 220}
          className={`stage-headline-line ${i === key ? "is-key" : ""}`.trim()}
        />
      ))}
    </Tag>
  );
}
