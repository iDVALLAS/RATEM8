// D91: the Concierge team tiles on /sign-in and /sign-up fit their words at every width. The browser audit
// (scripts/qa/text-fit.mjs) checks the pixels; these keep the rules that make them fit from going away.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CC_LOA_TILE } from "@/lib/content/command-center";
import { NOW_STEP, stepLabelClass } from "./auth-steps";

const css = readFileSync(join(process.cwd(), "app/mlo/cc-shell.css"), "utf8");
const rule = (sel: string) => {
  const i = css.indexOf(`\n${sel} {`);
  expect(i, `no rule for ${sel}`).toBeGreaterThan(-1);
  return css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
};

describe("Concierge team tiles (D91)", () => {
  it("the step labels keep a gap between them and never wrap inside a word", () => {
    expect(rule(".cc-auth__steplabels")).toMatch(/column-gap:\s*[1-9]\d*px/);
    expect(rule(".cc-auth__steplabels b")).toMatch(/white-space:\s*nowrap/);
  });

  it("a narrow tile shows the first, the current and the last step only", () => {
    const n = CC_LOA_TILE.steps.length;
    const classes = CC_LOA_TILE.steps.map((_, i) => stepLabelClass(i, n));
    expect(classes[0]).toBe("");
    expect(classes[n - 1]).toBe("");
    expect(classes[NOW_STEP]).toBe("now");
    expect(classes.filter((c) => c === "mid")).toHaveLength(n - 3);
    expect(css).toMatch(/@container ccloa \(max-width: \d+px\) \{ \.cc-auth__steplabels b\.mid \{ display: none; \} \}/);
  });

  it("the tiles follow the card's width: one column by default, 2 and 4 across only by container size", () => {
    expect(rule(".cc-auth__team")).toMatch(/container:\s*ccteam \/ inline-size/);
    expect(rule(".cc-auth__agents")).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(css).toMatch(/@container ccteam \(min-width: \d+px\) \{\n {2}\.cc-auth__agents \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    expect(css).toMatch(/@container ccteam \(min-width: \d+px\) \{\n {2}\.cc-auth__agents \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);
    // No screen-width rule sets the team to 4 or 2 columns any more (the card's width decides).
    expect(css).not.toMatch(/@media[^{]*\{[^}]*\.cc-auth__agents \{ grid-template-columns/);
  });

  it("the sign-up pitch keeps a minimum width beside the form", () => {
    expect(rule(".cc-auth__grid--wide")).toMatch(/grid-template-columns:\s*minmax\(18rem, 0\.8fr\)/);
  });
});

describe("a trailing arrow keeps its gap (D91)", () => {
  it("ArrowText's trailing arrow has a margin, since an inline-block drops its own leading space", () => {
    const tsx = readFileSync(join(process.cwd(), "components/ui/ArrowText.tsx"), "utf8");
    const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(tsx).toContain('className="cta-arrow cta-arrow--trail"');
    expect(globals).toMatch(/\.cta-arrow--trail \{ margin-left: 0\.3em; \}/);
  });
});
