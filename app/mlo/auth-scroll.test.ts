// D91.1: the sign-in and sign-up pages open at the top, even when you arrive from the bottom of a longer page.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("D91.1 auth pages open at the top", () => {
  it("the shared sign-in/sign-up frame mounts the scroll-to-top piece", () => {
    const shell = read("app/mlo/CcAuthShell.tsx");
    expect(shell).toMatch(/import AuthScrollTop from "\.\/AuthScrollTop"/);
    expect(shell).toMatch(/<AuthScrollTop \/>/);
  });

  it("scrolls to the top on each new page, but leaves a #link's spot alone", () => {
    const src = read("app/mlo/AuthScrollTop.tsx");
    expect(src).toMatch(/^"use client";/);
    expect(src).toMatch(/usePathname\(\)/);
    expect(src).toMatch(/if \(!window\.location\.hash\) window\.scrollTo\(0, 0\)/);
    expect(src).toMatch(/\}, \[path\]\);/);
  });
});
