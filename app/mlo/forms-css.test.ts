// D72: buttons and forms line up because the shared rules say so, not because each page patches
// its own buttons. These guard the shared rules and keep the per-page patches from coming back.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "app/mlo");
function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(n) ? [p] : [];
  });
}
const css = readFileSync(join(ROOT, "mlo.css"), "utf8");
/** The declarations of the first rule whose selector list is exactly `sel`. */
const rule = (src: string, sel: string) => {
  const i = src.indexOf(`\n${sel} {`);
  expect(i, `no rule for ${sel}`).toBeGreaterThan(-1);
  return src.slice(src.indexOf("{", i) + 1, src.indexOf("}", i));
};

describe("Command Center forms (D72)", () => {
  it("no page patches a button's top margin inline", () => {
    const hits = files(ROOT, /\.tsx$/).flatMap((f) =>
      readFileSync(f, "utf8").split("\n").flatMap((l, i) => (/marginTop:\s*0(?![.\d])/.test(l) ? [`${f.slice(ROOT.length + 1)}:${i + 1}`] : [])),
    );
    expect(hits).toEqual([]);
  });

  it("a button has no margin of its own and one control height", () => {
    const btn = rule(css, ".mlo-btn");
    expect(btn).toMatch(/margin-top: 0;/);
    expect(btn).toMatch(/min-height: 44px;/);
    expect(btn).toMatch(/max-width: 100%;/);
    expect(rule(css, ".mlo-field input, .mlo-field select, .mlo-field textarea")).toMatch(/min-height: 44px;/);
  });

  it("only the layout gives a button space above it", () => {
    const offenders = files(ROOT, /\.css$/).flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return [...src.matchAll(/([^{}]*\.mlo-btn[^{}]*)\{([^}]*)\}/g)]
        .filter(([, sel, body]) => [...body.matchAll(/margin-top:\s*([^;}]+)/g)].some((m) => m[1].trim() !== "0") && !/^\s*\.mlo-section:not\(\.mlo-grid\):not\(\.mlo-row-form\) > \.mlo-btn|^\s*\.cc-card > \.mlo-btn/.test(sel.split("\n").pop() ?? ""))
        .map(([, sel]) => `${f.slice(ROOT.length + 1)}: ${sel.trim().split("\n").pop()}`);
    });
    expect(offenders).toEqual([]);
  });

  it("grids and fields never push past the screen", () => {
    expect(rule(css, ".mlo-grid")).toMatch(/grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.mlo-grid--2 \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    expect(rule(css, ".mlo-input, .mlo-select")).toMatch(/max-width: 100%;[^}]*min-width: 0;/);
  });
});
