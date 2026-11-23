import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import ComingSoonHomePage from "./ComingSoonHomePage";
import { PilotChoices } from "./PilotMenu";
import { Nav } from "./Nav";
import { copy } from "@/lib/copy";

/** D90: the coming-soon page's two labeled buttons, the Pilot pop-up's choices, and no "MLO login" in the main nav. */
describe("D90 coming-soon entry buttons", () => {
  const page = renderToStaticMarkup(<ComingSoonHomePage />);

  it("shows TESTER ACCESS over the LoanM8 logo, going to the tester password page", () => {
    expect(copy.comingSoonHome.tester.href).toBe("/demo");
    const link = page.match(/<a[^>]*aria-label="Tester access: enter the tester password"[^>]*>([\s\S]*?)<\/a>/);
    expect(link).not.toBeNull();
    expect(link![0]).toContain('href="/demo"');
    expect(link![1]).toContain(">Tester access<");
    expect(link![1]).toContain('class="orb');
    expect(link![1]).toMatch(/Loan<span[^>]*>M8<\/span>/);
  });

  it("shows PILOT over the real MLO Command Center logo as a dialog button", () => {
    const btn = page.match(/<button[^>]*aria-label="Pilot: MLO Command Center for loan officers"[^>]*>([\s\S]*?)<\/button>/);
    expect(btn).not.toBeNull();
    expect(btn![0]).toContain('aria-haspopup="dialog"');
    expect(btn![0]).toContain('aria-expanded="false"');
    expect(btn![1]).toContain(">Pilot<");
    expect(btn![1]).toContain("/brand/mlo-command-center-lime-480.webp");
    expect(btn![1]).toContain("/brand/mlo-command-center-green-480.webp");
  });

  it("no longer has the old login button or text link in the header (the footer's link stays)", () => {
    const header = page.match(/<header[\s\S]*?<\/header>/)![0];
    expect(header).not.toContain("Loan officer login");
    expect(header).not.toContain("nav-login");
    expect(header).not.toContain('href="/sign-in"');
    expect(header).not.toContain("→");
    expect(page).toMatch(/<footer[\s\S]*href="\/sign-in"[^>]*>Loan officer login</);
  });

  it("the pop-up offers sign up and sign in, each with its line", () => {
    const pop = renderToStaticMarkup(<PilotChoices />);
    expect(pop).toMatch(/<a[^>]*href="\/sign-up"[^>]*>[\s\S]*New here\? Sign up[\s\S]*For licensed loan officers\. We check your NMLS record\.[\s\S]*?<\/a>/);
    expect(pop).toMatch(/<a[^>]*href="\/sign-in"[^>]*>[\s\S]*Welcome back — Sign in[\s\S]*We email you a 6-digit code\.[\s\S]*?<\/a>/);
  });

  it("the main nav has no separate MLO login button; Partner › Sign in stays", () => {
    const nav = renderToStaticMarkup(<Nav />);
    expect(nav).not.toContain("MLO login");
    expect(nav).not.toContain("nav-login");
    expect(nav).not.toContain('href="/sign-in"');
    expect("mloLogin" in copy.nav).toBe(false);
    const partner = copy.nav.partner.items.find((i) => "signIn" in i && i.signIn);
    expect(partner && "signIn" in partner ? partner.signIn?.href : undefined).toBe("/mlo");
  });
});
