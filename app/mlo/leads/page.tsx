import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { contactStore, listAll } from "@/lib/contacts/store";
import { summarize } from "@/lib/contacts/service";
import { pipelineStore } from "@/lib/pipeline/store";
import { connectedSourceLabels, leadPageMode, type SectionKey } from "@/lib/leads/mode";
import { recentLeads } from "@/lib/leads/recent";
import { DEFAULT_PERIOD, isScorePeriod } from "@/lib/leads/scorecard";
import { scorecardFor } from "@/lib/leads/score-service";
import { teamStore } from "@/lib/agents/store";
import { syncLeadEvents } from "@/lib/leads/sync";
import { makeMonthlyDrafts, monthlyStore, pacificMonth } from "@/lib/leads/spend";
import { NOT_LEADS, sourceOptions } from "@/lib/leads/sources";
import { FlashBox, MloNav } from "../MloChrome";
import PageHead from "../PageHead";
import { AddSource, ExamplePlan, ExampleRecent, ExampleScorecard, MonthlyAmounts, RealPlan, RealRecent, RealScorecard } from "./LeadSections";
import { planStore } from "@/lib/leads/plan-store";
import { advancePlan, planView } from "@/lib/leads/plan-service";
import AskPanel from "./AskPanel";
import { SUBS } from "@/lib/content/cc-pages";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead sources", robots: { index: false, follow: false } };

/**
 * /mlo/leads — connect lead vendors and web forms; see new leads and whether their form gave you permission (D14).
 * D82: until the first real lead the page shows its whole layout with example numbers (lib/leads/examples.ts),
 * each example section labeled; each section switches to the loan officer's own data on its own (lib/leads/mode.ts).
 * D83: counts come from the lead-event log (every delivery, repeats too), brought up to date here first
 * (lib/leads/sync.ts); a monthly amount per source makes this month's draft expense (lib/leads/spend.ts).
 * D84: the real scorecard (lib/leads/scorecard.ts) for `?period=` (30d, 90d, year), with the target cost per loan
 * and the Business Manager's newest lead-source move above it (`?review=1` opens it).
 * D85: "Ask your Concierge" (AskPanel): answers from the lead-source pack (lib/leads/ask.ts, lib/concierge/desk.ts
 * `askLeadSources`), in general terms while the page shows examples; assistants don't get it (spend is private).
 * D86: the plan card is the saved plan once there is one (lib/leads/plan-service.ts), with the budget planner at
 * /mlo/leads/plan; Approve on the Business Manager's move updates that plan and adds steps to Today.
 */
export default async function Leads({ searchParams }: { searchParams: Promise<{ f?: string; period?: string; review?: string }> }) {
  const { f, period: rawPeriod, review } = await searchParams;
  const period = isScorePeriod(rawPeriod) ? rawPeriod : DEFAULT_PERIOD;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const h = await headers();
  const endpoint = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/api/leads/inbound`;
  // D87.2: the whole book, read 500 at a time (one read used to stop at 500 people, and a bigger book was
  // handed on as if it were complete).
  const [{ contacts }, keys] = me
    ? await Promise.all([listAll({ ownerUserId: me.id, kind: "contact" }), pipelineStore().keys(me.id).catch(() => [])])
    : [{ contacts: [] }, []];
  const assistant = me?.role === "assistant";
  const now = new Date();
  // D83: the lead-event log, brought up to date (the first time, the leads that came before it).
  const { events } = me ? await syncLeadEvents(me, { now, contacts }).catch(() => ({ events: [] })) : { events: [] };
  if (me && !assistant) await makeMonthlyDrafts(me, now).catch(() => 0);
  const monthly = me && !assistant ? await monthlyStore().list(me.id).catch(() => []) : [];
  // D86: the saved lead plan (own book; never for an assistant), its roadmap moved along first (steps and check-ins
  // that are due), so the plan card is real from the first save and the banner can show a check-in.
  if (me && !assistant) await advancePlan(me, now).catch(() => null);
  const saved = me && !assistant ? await planStore().get(me.id).catch(() => null) : null;
  const plan = saved && me && saved.ownerUserId === me.id ? planView(saved, now) : null;
  const mode = leadPageMode({ contacts, leadEvents: events.length, savedPlan: !!plan, assistant });
  const month = pacificMonth(now);
  // D87.2: Recent leads looks up only the people behind the newest events, by id (own book), so it never
  // depends on how much of the book was read.
  const recent = me ? await recentLeads(me.id, events).catch(() => []) : [];
  const consents = recent.length ? await contactStore().consentsFor(recent.map((r) => r.contact.id)) : [];
  // D84: the scorecard from the loan officer's own data (never for an assistant: no spend), and the Business
  // Manager's newest open lead-source move for the banner.
  const card = me && mode.scorecard === "real" ? await scorecardFor(me, period, now, { events, contacts }).catch(() => null) : null;
  const move = me && card ? (await teamStore().moves(me.id, { status: "open", limit: 500 }).catch(() => [])).filter((m) => m.key.startsWith("lead-source:")).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null : null;

  const sections: Record<SectionKey, () => React.ReactNode> = {
    add: () => (me ? <AddSource key="add" compact={mode.addCard === "compact"} endpoint={endpoint} owner={me.role === "owner"} connected={connectedSourceLabels(keys.map((k) => k.label), NOT_LEADS)} /> : null),
    ask: () => (mode.ask === "off" ? null : <AskPanel key="ask" period={period} example={mode.ask === "example"} />),
    scorecard: () => (mode.scorecard === "off" ? null : mode.scorecard === "example" ? <ExampleScorecard key="scorecard" /> : card ? <RealScorecard key="scorecard" card={card} move={move ? { id: move.id, title: move.title, why: move.why } : null} review={review === "1"} /> : null),
    plan: () => (mode.plan === "off" ? null : mode.plan === "real" && plan ? <RealPlan key="plan" view={plan} /> : <ExamplePlan key="plan" afterLeads={mode.hasRealLeads} />),
    monthly: () =>
      mode.monthly === "off" ? null : (
        <MonthlyAmounts
          key="monthly"
          month={new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
          rows={monthly.map((m) => ({ key: m.sourceKey, label: m.sourceLabel, cents: m.cents, madeThisMonth: m.lastMonth === month }))}
          options={sourceOptions(events, keys.map((k) => k.label), monthly.map((m) => m.sourceKey))}
        />
      ),
    recent: () =>
      mode.recent === "example" ? (
        <ExampleRecent key="recent" />
      ) : (
        <RealRecent
          key="recent"
          rows={recent.map(({ event: e, contact: c }) => {
            // Decision 1: Recent leads shows whether they can be contacted today (the current answer), not the delivery's wording.
            const s = summarize(consents.filter((x) => x.contactId === c.id));
            return {
              id: c.id,
              name: `${c.firstName} ${c.lastName}`.trim() || c.email || "",
              source: e.sourceLabel,
              at: new Date(e.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", ...(e.datedBy === "delivery" || e.datedBy === "import" ? { hour: "numeric", minute: "2-digit" } : { year: "numeric" }) }),
              ok: s.text.marketing.granted || s.call.marketing.granted,
              repeat: e.duplicate,
            };
          })}
        />
      ),
  };

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="leads" title="Lead sources" sub={SUBS.leads} />
        <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> first.</p></section>
        ) : (
          mode.order.map((k) => sections[k]())
        )}
      </div>
    </PageShell>
  );
}
