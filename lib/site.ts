/**
 * lib/site.ts — the route registry.
 *
 * One list drives the sitemap, llms.txt, breadcrumbs, and the nav's
 * secondary links. If a route exists, it is here.
 */

import { CONFIG, STATES } from "./config";

export type SiteRoute = {
  path: string;
  title: string;
  /** One-line description for llms.txt / sitemap consumers. */
  description: string;
  /** Sitemap change frequency hint. */
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
  /** Include in llms.txt. */
  llms?: boolean;
  /** Markdown mirror route, if any. */
  markdown?: string;
};

export const ROUTES: SiteRoute[] = [
  { path: "/", title: "LoanM8 — Loan intelligence. Free for the people.", description: "AI-powered mortgage rate shopping. Every loan closed by one licensed loan officer. No lead-selling, no trigger leads, no spam.", changeFrequency: "weekly", priority: 1, llms: true },
  { path: "/second-look", title: "Second Look", description: "Drop a Loan Estimate you already have. M8 explains every line in plain English. Sample demo live; real upload feature-flagged.", changeFrequency: "monthly", priority: 0.9, llms: true },
  { path: "/join", title: "For licensed MLOs", description: "Recruiting page for licensed Mortgage Loan Originators in WA, AZ, CA, and TX. No earnings claims; details on the intro call.", changeFrequency: "monthly", priority: 0.7, llms: true },
  { path: "/agents", title: "For real estate agents", description: "How LoanM8 works with agents. No money, gifts, or marketing dollars flow between LoanM8 and agents.", changeFrequency: "monthly", priority: 0.8, llms: true },
  { path: "/calculators", title: "Calculators", description: "Four deterministic mortgage calculators. User-entered rates only; LoanM8 displays no rates.", changeFrequency: "monthly", priority: 0.9, llms: true, markdown: "/calculators/methodology.md" },
  { path: "/calculators/points-breakeven", title: "Points break-even calculator", description: "Monthly savings and break-even month from paying discount points.", changeFrequency: "monthly", priority: 0.8, llms: true },
  { path: "/calculators/refinance-breakeven", title: "Refinance break-even calculator", description: "Months until refinance closing costs earn back, plus total interest delta.", changeFrequency: "monthly", priority: 0.8, llms: true },
  { path: "/calculators/rent-vs-buy", title: "Rent vs. buy calculator", description: "Net cost of renting vs. owning over your horizon with a visible assumptions panel.", changeFrequency: "monthly", priority: 0.8, llms: true },
  { path: "/calculators/affordability", title: "Affordability calculator", description: "Indicative payment and price range from income, debts, down payment, and your entered rate.", changeFrequency: "monthly", priority: 0.8, llms: true },
  { path: "/principles", title: "The eight principles", description: "The eight rules every LoanM8 loan is closed against, verbatim and versioned.", changeFrequency: "yearly", priority: 0.8, llms: true, markdown: "/principles.md" },
  { path: "/loan-estimate", title: "Loan Estimate guide", description: "An annotated, plain-English guide to every section of the standard Loan Estimate form (fictional numbers).", changeFrequency: "monthly", priority: 0.8, llms: true },
  { path: "/sample-brief", title: "Sample Rate Strategy Brief", description: "What the written brief a borrower keeps looks like. Clearly labeled sample with fictional figures.", changeFrequency: "monthly", priority: 0.7, llms: true },
  { path: "/chat", title: "M8 Chat", description: "The M8 chat interface. AI disclosure and recording consent first. Scripted demo until live chat passes compliance review.", changeFrequency: "monthly", priority: 0.7, llms: true },
  { path: "/ai", title: "For AI assistants", description: "Plain-language answers to what LoanM8 is and is not, where it is licensed, what M8 can and cannot do, and how to hand a borrower off.", changeFrequency: "monthly", priority: 0.9, llms: true, markdown: "/ai.md" },
  { path: "/disclosures", title: "Licenses & disclosures", description: "NMLS, per-state licenses, Equal Housing Lender, AI disclosure, regulator links.", changeFrequency: "monthly", priority: 0.6, llms: true },
  { path: "/privacy", title: "Privacy", description: "What LoanM8 collects, uses, shares (never sold), and how to export or delete it.", changeFrequency: "monthly", priority: 0.5, llms: true },
  { path: "/terms", title: "Terms", description: "Terms of use.", changeFrequency: "yearly", priority: 0.3 },
  ...STATES.map((s) => ({
    path: `/states/${s.slug}`,
    title: `${s.name} — LoanM8`,
    description: `LoanM8 in ${s.name} (serving ${s.serviceArea}): license line, regulator link, local context, calculators.`,
    changeFrequency: "monthly" as const,
    priority: 0.7,
    llms: true,
  })),
];

export function absoluteUrl(path: string): string {
  return `${CONFIG.siteUrl.replace(/\/$/, "")}${path}`;
}

export function routeFor(path: string): SiteRoute | undefined {
  return ROUTES.find((r) => r.path === path);
}
