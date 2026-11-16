/**
 * lib/voice/sentences.ts — cuts a streaming reply into speakable pieces
 * (C18), so M8 starts talking after its first sentence instead of after
 * the whole reply. Pure; used by /api/m8-chat.
 *
 * A piece ends at ". ", "? ", "! " or a line break, once it is at least
 * MIN_CHARS long (FIRST_MIN_CHARS for the first, so speech starts sooner).
 * Common abbreviations ("e.g.", "Mr.") and decimals ("3.5%") never end one.
 */
const FIRST_MIN_CHARS = 20;
const MIN_CHARS = 60;
const ABBREV = /\b(?:e\.g|i\.e|etc|vs|approx|mr|mrs|ms|dr|st|no|inc|llc|u\.s)\.$/i;

export class SentenceSplitter {
  private buf = "";
  private count = 0;

  /** Adds streamed text; returns the pieces that are now complete. */
  push(text: string): string[] {
    this.buf += text;
    const out: string[] = [];
    for (;;) {
      const min = this.count === 0 ? FIRST_MIN_CHARS : MIN_CHARS;
      const cut = this.findCut(min);
      if (cut < 0) break;
      const piece = this.buf.slice(0, cut).trim();
      this.buf = this.buf.slice(cut);
      if (piece) {
        out.push(piece);
        this.count++;
      }
    }
    return out;
  }

  /** Whatever is left when the reply ends. */
  flush(): string | null {
    const rest = this.buf.trim();
    this.buf = "";
    return rest ? rest : null;
  }

  reset(): void {
    this.buf = "";
    this.count = 0;
  }

  private findCut(min: number): number {
    const re = /[.!?]["')\]*]*\s+|\n+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buf)) !== null) {
      const end = m.index + m[0].length;
      if (end < min) continue;
      if (m[0][0] === "." && ABBREV.test(this.buf.slice(0, m.index + 1))) continue;
      return end;
    }
    return -1;
  }
}
