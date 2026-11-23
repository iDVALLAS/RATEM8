import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// D89.2: the build-time fix for the rare React #418 on Command Center pages
// (scripts/react-replay-fix.cjs, wired in next.config.ts).
const require = createRequire(import.meta.url);
const { patchReplay } = require("../scripts/react-replay-fix.cjs") as { patchReplay: (s: string) => string };
const reactDom = (build: "production" | "development") => require.resolve(`next/dist/compiled/react-dom/cjs/react-dom-client.${build}.js`);

describe("D89.2 React hydration replay fix", () => {
  for (const build of ["production", "development"] as const) {
    it(`adds the upstream lines once to the bundled React (${build})`, () => {
      const src = readFileSync(reactDom(build), "utf8");
      const out = patchReplay(src);
      expect(out).not.toBe(src);
      // Exactly the upstream fix: back to the element before it's claimed again.
      expect(out.match(/nextHydratableInstance = fiber\.stateNode/g)).toHaveLength(1);
      expect(out).toMatch(/case 5:\s*resetHooksOnUnwind\((\w+)\);\s*var fiber = \1;\s*fiber === hydrationParentFiber &&\s*\(isHydrating\s*\? \(popToNextHostParent\(fiber\),\s*5 === fiber\.tag &&\s*null != fiber\.stateNode &&\s*\(nextHydratableInstance = fiber\.stateNode\)\)\s*: \(popToNextHostParent\(fiber\), \(isHydrating = !0\)\)\);\s*default:\s*unwindInterruptedWork\(current, \1\)/);
      // Nothing else changes.
      expect(out.replace(/\s*var fiber = \w+;\s*fiber === hydrationParentFiber &&[\s\S]*?\(isHydrating = !0\)\)\);/, "")).toBe(src);
      // Still valid JavaScript, and a second pass leaves it alone.
      expect(() => new Function(out)).not.toThrow();
      expect(patchReplay(out)).toBe(out);
    });
  }

  it("fails the build when React's replay step has changed shape", () => {
    expect(() => patchReplay("function replay() { switch (x) { default: work(); } }")).toThrow(/expected the host-component replay step once/);
    const src = readFileSync(reactDom("production"), "utf8");
    const twice = src.replace(/(function replaySuspendedUnitOfWork)/, "function extra(next) { switch (next.tag) { case 5: resetHooksOnUnwind(next); default: unwindInterruptedWork(current, next); } }\n$1");
    expect(() => patchReplay(twice)).toThrow(/found it 2 times/);
  });

  it("is wired into the webpack build for react-dom-client only", async () => {
    const { default: config } = await import("../next.config");
    const rules: { test: RegExp; use: { loader: string }[] }[] = [];
    config("phase-test").webpack?.({ module: { rules } }, {} as never);
    expect(rules).toHaveLength(1);
    const [rule] = rules;
    expect(rule.use[0].loader).toMatch(/scripts[\\/]react-replay-fix\.cjs$/);
    expect(rule.test.test(reactDom("production"))).toBe(true);
    expect(rule.test.test(reactDom("development"))).toBe(true);
    expect(rule.test.test(require.resolve("next/dist/compiled/react-dom/cjs/react-dom-server.node.production.js"))).toBe(false);
    expect(rule.test.test("/app/node_modules/react-dom/cjs/react-dom-client.production.js")).toBe(false);
  });
});
