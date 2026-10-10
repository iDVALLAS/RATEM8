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

  it("an approved logo must have its file in public/lenders (the owner supplies it)", () => {
    for (const l of LENDER_BRANDS.filter((x) => x.logoApproved)) {
      expect(existsSync(join(process.cwd(), "public", lenderLogoPath(l.slug))), `${l.slug}: approved but no logo file`).toBe(true);
    }
  });

  it("renders a monogram tile, not a logo, while logoApproved is false", () => {
    const html = renderToStaticMarkup(createElement(LenderMark, { lender: "uwm" }));
    expect(html).toContain("lender-mono");
    expect(html).not.toContain("<img");
    const approved = renderToStaticMarkup(createElement(LenderMark, { lender: { ...lenderBrand("uwm")!, logoApproved: true }, labelled: true }));
    expect(approved).toContain('src="/lenders/uwm.svg"');
    expect(approved).toContain("lender-chip");
    expect(approved).toContain('aria-label="UWM"');
  });

  it("tints with a confirmed brand colour only; otherwise our data hue", () => {
    expect(lenderTint({ ...lenderBrand("kind")!, brandColor: null })).toBe("var(--data-3)");
    expect(lenderTint({ ...lenderBrand("kind")!, brandColor: "#123456" })).toBe("#123456");
    expect(lenderTint({ ...lenderBrand("kind")!, brandColor: "red" })).toBe("var(--data-3)");
  });
});
