import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { CHANNEL_LABELS, KIND_LABELS, KINDS, type Kind } from "@/lib/templates/library";
import { allTemplates, myValues } from "@/lib/templates/service";
import { FlashBox, MloNav } from "../MloChrome";
import { AnswerThis, MakeOne, UseTemplate } from "./Client";
import { removeTemplateAction, saveTemplateAction } from "./actions";
import "../mlo.css";
import "./templates.css";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Templates", robots: { index: false, follow: false } };

/** /mlo/templates — open houses, agent outreach, follow-ups, objections, and M8's help (D38). */
export default async function Templates({ searchParams }: { searchParams: Promise<{ f?: string; k?: string }> }) {
  const { f, k } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const kind = (KINDS as readonly string[]).includes(k ?? "") ? (k as Kind) : null;
  const all = me ? await allTemplates(me) : [];
  const shown = kind ? all.filter((t) => t.kind === kind) : all;
  const mine = me ? myValues(me) : {};
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Templates</h1>
        <MloNav current="templates" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to use templates.</p></section>
        ) : (
          <>
            <section className="mlo-section" id="answer">
              <h2>Help me answer</h2>
              <p className="mlo-note">Paste what a client or agent said, an objection or a tough question, and M8 offers honest replies you can say or send. No rates, promises or pressure, ever.</p>
              <AnswerThis />
            </section>

            <section className="mlo-section" id="list">
              <h2>Templates ({shown.length})</h2>
              <nav className="cc-tabs-inline" aria-label="Kinds">
                <Link href="/mlo/templates#list" aria-current={kind ? undefined : "page"}>All</Link>
                {KINDS.map((x) => <Link key={x} href={`/mlo/templates?k=${x}#list`} aria-current={kind === x ? "page" : undefined}>{KIND_LABELS[x]}</Link>)}
              </nav>
              <ol className="tp-list">
                {shown.map((t) => (
                  <li key={t.id} className="cc-card">
                    <p className="cc-card__title">{t.title} · {CHANNEL_LABELS[t.channel]}{"mine" in t && t.mine ? " · yours" : "shared" in t && t.shared ? " · shared by your team" : ""}</p>
                    {t.objection ? <p className="tp-objection">“{t.objection}”</p> : null}
                    <p className="tp-body">{t.body}</p>
                    {t.why ? <p className="mlo-note">Why it works: {t.why}</p> : null}
                    {t.rules?.length ? <ul className="tp-rules">{t.rules.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
                    <UseTemplate t={t} mine={mine} />
                    {"mine" in t && t.mine ? <form action={removeTemplateAction.bind(null, t.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Delete</button></form> : null}
                  </li>
                ))}
              </ol>
            </section>

            <section className="mlo-section" id="make">
              <h2>Make your own</h2>
              <p className="mlo-note">Type one, or tell M8 what you need and edit its draft. Every template is checked before it&apos;s saved: no rates, payments, dollar amounts, promises or urgency. Put dates and addresses in fields so the template stays reusable.</p>
              <MakeOne save={saveTemplateAction.bind(null, null)} canShare={me.role === "owner" || me.role === "team_lead"} />
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
