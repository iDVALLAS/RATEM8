import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { cleanBudget, PLAN_RULES } from "@/lib/leads/plan";
import { advancePlan, plannerFor, planView } from "@/lib/leads/plan-service";
import { planStore } from "@/lib/leads/plan-store";
import { SUBS } from "@/lib/content/cc-pages";
import { LEAD_PLAN } from "@/lib/content/lead-plan";
import { FlashBox, MloNav } from "../../MloChrome";
import PageHead from "../../PageHead";
import { BudgetPicker, Catalog, Roadmap, SavedPlan, SaveBar, Split } from "./PlanParts";
import "../../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead budget plan", robots: { index: false, follow: false } };

/**
 * /mlo/leads/plan — D86: the budget planner and 90-day roadmap (Option C). `?budget=` is the monthly budget on
 * screen (a preset, your own amount, or the saved plan's); the split, the estimates and the Business Finder's
 * suggestions come from the loan officer's own scorecard (lib/leads/plan-service.ts). Saving stores the plan and adds
 * its first steps to Today; nothing here spends money, signs up for a vendor or contacts anyone. Assistants see no
 * spend, so they get a line and no planner. Linked from the plan card on Lead sources (not a menu entry).
 */
export default async function LeadPlan({ searchParams }: { searchParams: Promise<{ f?: string; budget?: string }> }) {
  const { f, budget: raw } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const tenant = listTenants()[0];
  const now = new Date();
  const head = <PageHead k="leads" eyebrow={<Link href="/mlo/leads">{LEAD_PLAN.back}</Link>} title={LEAD_PLAN.title} sub={SUBS.leadPlan} />;
  if (!me || me.role === "assistant") {
    return (
      <PageShell>
        <div className="mlo-wrap">
          {head}
          <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
          <section className="mlo-section">
            <p className="mlo-note">{me ? LEAD_PLAN.assistant : <><Link href="/sign-in">Sign in with your email</Link> first.</>}</p>
          </section>
        </div>
      </PageShell>
    );
  }
  // The roadmap's next steps and the Business Manager's check-in, when they're due (no new cron).
  await advancePlan(me, now).catch(() => null);
  // The budget on screen: the one picked, else the saved plan's, else the middle preset.
  const saved = await planStore().get(me.id).catch(() => null);
  const dollars = cleanBudget(raw) ?? (saved && saved.ownerUserId === me.id ? Math.round(saved.budgetCents / 100) : PLAN_RULES.defaultDollars);
  const p = await plannerFor(me, dollars * 100, now);
  const noSources = !p.alloc.lines.some((l) => l.kind === "fund" || l.kind === "test") && !p.alloc.leftOut.length;
  return (
    <PageShell>
      <div className="mlo-wrap">
        {head}
        <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn />
        <FlashBox flash={decodeFlash(f)} />
        {p.plan ? <SavedPlan view={planView(p.plan, now)} history={p.plan.history} /> : null}
        <BudgetPicker dollars={dollars} targetCents={p.targetCents} />
        <Split alloc={p.alloc} estimate={p.estimate} suggestions={p.suggestions} noSources={noSources} />
        <Roadmap targetCents={p.targetCents} />
        <Catalog suggestions={p.suggestions} />
        <SaveBar dollars={dollars} />
      </div>
    </PageShell>
  );
}
