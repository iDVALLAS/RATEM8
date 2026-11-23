import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExamplePlan, RealPlan } from "./LeadSections";
import type { PlanView } from "@/lib/leads/plan-service";
import { LEADS } from "@/lib/content/cc-pages";

/** D86: the plan card on Lead sources once a plan is saved (kept beside the page: only app/mlo/leads/ imports its files). */

const view: PlanView = {
  budgetCents: 150_000,
  day: 1,
  of: 90,
  done: false,
  next: "Dec 22",
  lines: [
    { key: "past-clients-sphere", label: "Past clients & sphere", kind: "sphere", cents: 15_000 },
    { key: "web-form", label: "Your web form", kind: "fund", cents: 90_000 },
    { key: "reserve", label: "Not assigned yet", kind: "reserve", cents: 45_000 },
  ],
};

describe("the plan card (D86)", () => {
  it("real once saved: budget, day X of 90, the split bar with the same split in words, the next check-in, the planner", () => {
    const html = renderToStaticMarkup(createElement(RealPlan, { view }));
    expect(html).toContain('data-example="false"');
    expect(html).not.toContain("cc-ex");
    expect(html).toContain("$1,500 a month · day 1 of 90");
    expect(html).toContain("Past clients &amp; sphere $150 · Your web form $900 · Not assigned yet $450 · Next check-in Dec 22");
    expect(html).toMatch(/<div class="cc-plan__bar" aria-hidden="true">/);
    expect((html.match(/class="cc-plan__seg cc-plan__seg--\d"/g) ?? []).length).toBe(3);
    expect(html).toContain('href="/mlo/leads/plan"');
    expect(html).not.toMatch(/disabled/);
    const done = renderToStaticMarkup(createElement(RealPlan, { view: { ...view, day: 90, done: true, next: null } }));
    expect(done).toContain(LEADS.plan.done("$1,500", 90));
    expect(done).not.toContain("Next check-in");
  });
  it("the example card's button now opens the real planner (a link; it saves nothing)", () => {
    const ex = renderToStaticMarkup(createElement(ExamplePlan, { afterLeads: true }));
    expect(ex).toContain('data-example="true"');
    expect(ex).toContain('href="/mlo/leads/plan"');
    expect(ex).not.toMatch(/<form|<button/);
    expect(ex).toContain(LEADS.plan.exampleNote);
  });
});
