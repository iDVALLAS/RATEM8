import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { hasApplicationUrl, mloById } from "@/lib/config";
import { STEPS } from "@/lib/journey/steps";
import { RECIPES } from "@/lib/automations/recipes";
import { CONCIERGE_TEMPLATES } from "@/lib/concierge/agent";
import { docRequestBody } from "@/lib/journey/docs";
import { checkDraft } from "@/lib/concierge/guard";
import { signature } from "@/lib/messaging/service";
import { segmentInfo, toGsm } from "@/lib/messaging/segments";
import { MloNav } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "What clients see", robots: { index: false, follow: false } };

type Row = { where: string; purpose: "service" | "marketing"; text: string };

/** /mlo/messages — every message Command Center can draft, exactly as a client would get it (D25). */
export default async function Messages() {
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const first = me?.name.split(/\s+/)[0] ?? "";
  const mlo = mloById(me?.mloId ?? null);
  const portal = mlo && hasApplicationUrl(mlo) ? mlo.applicationUrl.trim() : null;
  const sig = me ? signature(me) : "LoanM8. Reply STOP to opt out.";
  const rows: Row[] = [
    ...STEPS.filter((s) => s.message).map((s) => ({ where: `Loan Journey, step ${s.key}: ${s.title}`, purpose: "service" as const, text: s.message!({ first: "Ann", me: first, portal }) })),
    ...RECIPES.filter((r) => r.body).map((r) => ({ where: `Automations: ${r.label}`, purpose: r.purpose, text: r.body!({ first: r.to === "agent" ? "Al" : "Ann", me: first, client: "Ann" }) })),
    ...(portal ? [{ where: "Document request (Loan Journey)", purpose: "service" as const, text: docRequestBody("Ann", 3, "initial", portal, first) }] : []),
    { where: "Concierge, no AI: answering a reply", purpose: "service", text: CONCIERGE_TEMPLATES.reply("Ann") },
    { where: "Concierge, no AI: home anniversary", purpose: "marketing", text: CONCIERGE_TEMPLATES.anniversary("Ann") },
    { where: "Concierge, no AI: check-in", purpose: "marketing", text: CONCIERGE_TEMPLATES.check_in("Ann") },
  ];
  const sent = (r: Row) => toGsm(r.purpose === "marketing" ? `${r.text}\n\n${sig}` : r.text);

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">What clients see</h1>
        <MloNav current="home" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <section className="mlo-section">
          <h2>Every message Command Center can draft</h2>
          <p className="mlo-note">
            Exactly as a client would get it (with “Ann” standing in for their name). Offers and check-ins, and the first text to anyone, end with your sign-off: “{sig}”. Every one waits for your approval, passes the same checks as the Concierge&apos;s drafts, and goes through your contact rules when you send it. AI-written drafts and your Tell-your-Concierge requests are checked the same way; see them on your <Link href="/mlo/concierge#drafts">desk</Link>.
          </p>
          {!portal ? <p className="mlo-note">Your secure portal link isn&apos;t set, so messages that would carry it say you&apos;ll send it, and document requests can&apos;t be drafted yet.</p> : null}
        </section>
        <section className="mlo-section">
          <ol className="cc-today">
            {rows.map((r, i) => {
              const text = sent(r);
              const seg = segmentInfo(text);
              const ok = checkDraft(r.text, { names: ["Ann", "Al", first] });
              return (
                <li key={i} className="cc-card">
                  <p className="cc-card__title">{r.where}</p>
                  <p style={{ whiteSpace: "pre-wrap", color: "var(--fg)", lineHeight: 1.5, margin: "6px 0" }}>{text}</p>
                  <p className="mlo-note">{r.purpose === "service" ? "About their loan" : "Offer or check-in"} · {seg.segments} segment{seg.segments === 1 ? "" : "s"} ({seg.units} characters, {seg.encoding}) · {ok.ok ? "passes the checks" : `held back: ${ok.reason}`}</p>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </PageShell>
  );
}
