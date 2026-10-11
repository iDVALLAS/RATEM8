import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LENDER_BRANDS, lenderBrand, lenderLogoPath, lenderTint } from "./lenders";
import { LENDERS } from "./pricing/lenders";
import LenderMark from "@/components/LenderMark";

describe("lender brands / LenderMark (v23)", () => {
  it("covers every pricing lender and the original demo's lenders", () => {
    for (const l of LENDERS) expect(lenderBrand(l.key), l.key).toBeDefined();
    for (const slug of ["uwm", "rocket-pro", "kind"]) expect(lenderBrand(slug)).toBeDefined();
  });

  it("an approved logo must have its owner-supplied file in public/lenders", () => {
    for (const l of LENDER_BRANDS.filter((x) => x.logoApproved)) {
      const path = lenderLogoPath(l);
      expect(path, `${l.slug}: approved but no logoFile`).not.toBeNull();
      expect(existsSync(join(process.cwd(), "public", path!)), `${l.slug}: approved but ${path} is missing`).toBe(true);
    }
  });

  it("monograms are unique, and Kind (cropped file) stays a monogram", () => {
    const m = LENDER_BRANDS.map((l) => l.monogram);
    expect(new Set(m).size).toBe(m.length);
    expect(lenderBrand("kind")!.logoApproved).toBe(false);
  });

  it("renders a monogram tile unless the logo is approved and supplied", () => {
    const html = renderToStaticMarkup(createElement(LenderMark, { lender: "kind" }));
    expect(html).toContain("lender-mono");
    expect(html).not.toContain("<img");
    const unapproved = renderToStaticMarkup(createElement(LenderMark, { lender: { ...lenderBrand("uwm")!, logoApproved: false } }));
    expect(unapproved).not.toContain("<img");
    const approved = renderToStaticMarkup(createElement(LenderMark, { lender: "uwm", labelled: true }));
    expect(approved).toContain('src="/lenders/uwm.png"');
    expect(approved).toContain("lender-chip");
    expect(approved).toContain('aria-label="UWM"');
  });

  it("tints with a confirmed brand colour only; otherwise our data hue", () => {
    expect(lenderTint({ ...lenderBrand("kind")!, brandColor: null })).toBe("var(--data-3)");
    expect(lenderTint({ ...lenderBrand("kind")!, brandColor: "#123456" })).toBe("#123456");
    expect(lenderTint({ ...lenderBrand("kind")!, brandColor: "red" })).toBe("var(--data-3)");
  });
});
