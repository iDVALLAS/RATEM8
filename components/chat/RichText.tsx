import { Fragment, type ReactNode } from "react";

/**
 * RichText — M8's replies with the little formatting the model uses (C6).
 *
 * Handles **bold**, "- " / "* " bullet lists, "1. " numbered lists, "#"
 * headings (shown as bold lines) and paragraphs. Everything is rendered as
 * React text nodes, never HTML, so a reply can't inject markup. While a
 * reply streams, an unclosed "**" is hidden instead of shown raw.
 */

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*(\d{1,2})[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*\n]+?\*\*)/g);
  parts.forEach((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) out.push(<strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>);
    else if (p) out.push(<Fragment key={`${key}-${i}`}>{p.replace(/\*\*/g, "")}</Fragment>);
  });
  return out;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[]; start: number } | { kind: "h"; text: string };

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks.at(-1);
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    if (HEADING.test(line)) {
      blocks.push({ kind: "h", text: line.replace(HEADING, "") });
      continue;
    }
    const num = NUMBERED.exec(line);
    if (num) {
      if (last?.kind === "ol") last.items.push(line.replace(NUMBERED, ""));
      else blocks.push({ kind: "ol", items: [line.replace(NUMBERED, "")], start: Number(num[1]) });
      continue;
    }
    if (BULLET.test(line)) {
      if (last?.kind === "ul") last.items.push(line.replace(BULLET, ""));
      else blocks.push({ kind: "ul", items: [line.replace(BULLET, "")] });
      continue;
    }
    if (last?.kind === "p" && last.lines.length > 0) last.lines.push(line);
    else blocks.push({ kind: "p", lines: [line] });
  }
  return blocks.filter((b) => !(b.kind === "p" && b.lines.length === 0));
}

export default function RichText({ text }: { text: string }) {
  return (
    <div className="m8-rich">
      {parseBlocks(text).map((b, i) => {
        const k = `b${i}`;
        if (b.kind === "h") return <p key={k}><strong>{inline(b.text, k)}</strong></p>;
        if (b.kind === "ul" || b.kind === "ol") {
          const items = b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>);
          return b.kind === "ol" ? <ol key={k} start={b.start}>{items}</ol> : <ul key={k}>{items}</ul>;
        }
        return (
          <p key={k}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(l, `${k}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
