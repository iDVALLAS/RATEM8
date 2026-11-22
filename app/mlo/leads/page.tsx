import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { contactStore } from "@/lib/contacts/store";
import { summarize } from "@/lib/contacts/service";
import { pipelineStore } from "@/lib/pipeline/store";
import { SYSTEMS } from "@/lib/connect/catalog";
import { connectedSourceLabels, isRealLead, leadPageMode, leadSourceLabel, recentLeads, sourceCounts, type SectionKey } from "@/lib/leads/mode";
import { FlashBox, MloNav } from "../MloChrome";
import PageHead from "../PageHead";
import { AddSource, AskBar, ExamplePlan, ExampleRecent, ExampleScorecard, RealRecent, RealScorecard } from "./LeadSections";
import { LEADS, SUBS } from "@/lib/content/cc-pages";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead sources", robots: { index: false, follow: false } };

/** Connection addresses that aren't lead sources (made on Connections for a loan system or a dialer). */
const NOT_LEADS = ["Loan system", "Dialer", ...SYSTEMS.filter((s) => s.brings === "loans").map((s) => s.name)];

/**
 * /mlo/leads — connect lead vendors and web forms; see new leads and whether their form gave you permission (D14).
 * D82: until the first real lead the page shows its whole layout with example numbers (lib/leads/examples.ts),
 * each example section labeled; each section switches to the loan officer's own data on its own (lib/leads/mode.ts).
 */
export default async function Leads({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const h = await headers();
  const endpoint = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/api/leads/inbound`;
  const [{ contacts }, keys] = me
    ? await Promise.all([contactStore().list({ ownerUserId: me.id, kind: "contact", limit: 2000 }), pipelineStore().keys(me.id).catch(() => [])])
    : [{ contacts: [] }, []];
  // D83 adds lead events and D86 saved plans; until then neither exists.
  const mode = leadPageMode({ contacts, leadEvents: 0, savedPlan: false, assistant: me?.role === "assistant" });
  const now = new Date();
  const recent = recentLeads(contacts);
  const counted = mode.scorecard === "real" ? contacts.filter(isRealLead) : [];
  const ids = [...new Set([...recent, ...counted].map((c) => c.id))];
  const consents = ids.length ? await contactStore().consentsFor(ids) : [];

  const sections: Record<SectionKey, () => React.ReactNode> = {
    add: () => (me ? <AddSource key="add" compact={mode.addCard === "compact"} endpoint={endpoint} owner={me.role === "owner"} connected={connectedSourceLabels(keys.map((k) => k.label), NOT_LEADS)} /> : null),
    ask: () => (mode.ask === "off" ? null : <AskBar key="ask" />),
    scorecard: () => (mode.scorecard === "off" ? null : mode.scorecard === "example" ? <ExampleScorecard key="scorecard" /> : <RealScorecard key="scorecard" rows={sourceCounts(counted, consents, now, LEADS.recent.vendorFile)} />),
    plan: () => (mode.plan === "off" ? null : <ExamplePlan key="plan" afterLeads={mode.hasRealLeads} />),
    recent: () =>
      mode.recent === "example" ? (
        <ExampleRecent key="recent" />
      ) : (
        <RealRecent
          key="recent"
          rows={recent.map((c) => {
            const s = summarize(consents.filter((e) => e.contactId === c.id));
            return {
              id: c.id,
              name: `${c.firstName} ${c.lastName}`.trim() || c.email || "",
              source: leadSourceLabel(c, LEADS.recent.vendorFile),
              at: new Date(c.createdAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
              ok: s.text.marketing.granted || s.call.marketing.granted,
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
