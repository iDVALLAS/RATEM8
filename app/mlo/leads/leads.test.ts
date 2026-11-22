import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INFO_TIP, LEADS } from "@/lib/content/cc-pages";
import InfoTip from "../InfoTip";
import PermissionTip from "./PermissionTip";

/** D81: Lead sources copy cleanup and the permission "i". */
describe("Lead sources copy (D81)", () => {
  it("drops the duplicate sentence from how it works, and the old consent paragraph", () => {
    expect(LEADS.how).not.toMatch(/duplicate/i);
    expect(LEADS.how).not.toMatch(/merged|doubled/i);
    expect(LEADS.how).toMatch(/at the top of Today\.$/);
    expect("consent" in LEADS).toBe(false);
    expect(LEADS.permissionLine).toBe("Permission is saved with every lead.");
  });

  it("has the owner's pop-up words", () => {
    expect(LEADS.tip.title).toBe("When a lead counts as permission");
    expect(LEADS.tip.named).toBe("Your vendor’s consent wording is saved with every lead. It counts as permission to text or call only when it names you or your company.");
    expect(`${LEADS.tip.partners} ${LEADS.status.none}.`).toBe("Many forms name only “partners.” Those leads show No permission yet.");
    expect(LEADS.tip.askIntro).toBe("Ask your vendor to send three things with every lead:");
    expect(LEADS.tip.ask).toEqual(["Their consent wording", "When the person agreed", "The web page where they agreed"]);
    expect(LEADS.tip.copy).toBe("Copy a note for your vendor");
    expect(LEADS.tip.copied).toMatch(/^Copied/);
  });

  it("the vendor note is short, polite and names the three fields", () => {
    const n = LEADS.tip.vendorNote;
    for (const f of ["consent_text", "consent_timestamp", "page_url"]) expect(n).toContain(f);
    expect(n).toMatch(/please/i);
    expect(n).toMatch(/thank you/i);
    expect(n.length).toBeLessThan(320);
    // Nothing from the loan officer's book or identity goes in it.
    expect(n).not.toMatch(/NMLS|\d{4,}|@/);
  });

  it("names each row's i after its lead, with a plain fallback", () => {
    expect(LEADS.rowTipLabel("Eve Ng")).toBe("Why no permission yet for Eve Ng");
    expect(LEADS.rowTipLabel("")).toBe("Why no permission yet");
  });
});

describe("InfoTip (D81)", () => {
  it("is a real button with a name and a closed state, and renders no pop-up until opened", () => {
    const html = renderToStaticMarkup(createElement(InfoTip, { label: "When a lead counts as permission", title: "When a lead counts as permission" } as ComponentProps<typeof InfoTip>, "Body"));
    expect(html).toMatch(/^<button type="button" class="cc-tip-btn"/);
    expect(html).toContain('aria-label="When a lead counts as permission"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('<span aria-hidden="true" class="cc-tip-btn__dot">i</span>');
    expect(html).not.toContain("Body");
    expect(html).not.toContain('role="dialog"');
  });

  it("takes the warn tone and small size, and the permission tip uses the row's own name", () => {
    const html = renderToStaticMarkup(createElement(PermissionTip, { label: LEADS.rowTipLabel("Eve Ng"), tone: "warn", size: "sm" }));
    expect(html).toContain('class="cc-tip-btn cc-tip-btn--warn cc-tip-btn--sm"');
    expect(html).toContain('aria-label="Why no permission yet for Eve Ng"');
    expect(renderToStaticMarkup(createElement(PermissionTip))).toContain(`aria-label="${LEADS.tip.label}"`);
  });

  it("keeps its own words in cc-pages, a 44px tap target, and every theme's colors", () => {
    expect(INFO_TIP.close).toBe("Close");
    const src = readFileSync(join(process.cwd(), "app/mlo/InfoTip.tsx"), "utf8");
    expect(src).toContain('className="cc-dsheet cc-tip"');
    expect(src).not.toMatch(/aria-label="[^{]/); // no typed-in names
    const css = readFileSync(join(process.cwd(), "app/mlo/cc-shell.css"), "utf8");
    const rule = css.slice(css.indexOf("\n.cc-tip-btn {"), css.indexOf("}", css.indexOf("\n.cc-tip-btn {")));
    expect(rule).toMatch(/width: 44px; height: 44px;/);
    expect(css).toMatch(/\.cc-tip__x \{[^}]*width: 44px; height: 44px;/);
    // Tokens only (the palette is .cc-dsheet's), no raw colors in the tip's rules.
    const block = css.slice(css.indexOf("/* ─── D81"));
    expect(block.replace(/rgba\(0, 0, 0, 0\.45\)/, "")).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it("the page shows the line and the i, and an i beside every No permission yet", () => {
    const page = readFileSync(join(process.cwd(), "app/mlo/leads/page.tsx"), "utf8");
    expect(page).toContain("{LEADS.permissionLine}");
    expect(page).not.toContain("LEADS.consent");
    expect(page).toMatch(/\{LEADS\.status\.none\}<\/span>\s*<PermissionTip label=\{LEADS\.rowTipLabel\(name\)\}/);
  });
});
