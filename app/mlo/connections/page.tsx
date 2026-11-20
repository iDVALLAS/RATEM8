import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { requestOrigin } from "@/lib/mail/origin";
import { KIND_LABELS, ROUTE_LABELS, SYSTEMS } from "@/lib/connect/catalog";
import { connectionStore } from "@/lib/connect/service";
import { FlashBox } from "../MloChrome";
import { removeConnectionAction, saveConnectionAction, testConnectionAction } from "./actions";
import "../mlo.css";
import "../loa/loa.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connections", robots: { index: false, follow: false } };

/** /mlo/connections — your loan system, application portal and CRM, and how each connects (D63). */
export default async function Connections({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const origin = requestOrigin(await headers());
  const loansUrl = `${origin}/api/pipeline/inbound`;
  const leadsUrl = `${origin}/api/leads/inbound`;
  const saved = me ? await connectionStore().list(me.id).catch(() => []) : [];
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Connections</h1>
        <FlashBox flash={decodeFlash(sp.f)} />
        <section className="mlo-section">
          <p className="mlo-note" style={{ maxWidth: 720 }}>Bring your loans and your people in from the systems you already use. Each one below says the route that works today, from what the vendor offers. Loans land on Pipeline (and feed each loan&apos;s journey and your LOA); people land in Contacts and Leads.</p>
          <dl className="loa-kv" style={{ marginTop: 10 }}>
            <dt>Your loan address</dt><dd><code className="mlo-code">{loansUrl}</code></dd>
            <dt>Your lead address</dt><dd><code className="mlo-code">{leadsUrl}?source=…</code></dd>
            <dt>Your key</dt><dd>Send it as the <code>X-CC-Key</code> header. Make or replace it on <Link href="/mlo/pipeline">Pipeline</Link>.</dd>
          </dl>
        </section>
        {SYSTEMS.map((s) => {
          const c = saved.find((x) => x.system === s.key);
          return (
            <section key={s.key} id={s.key} className="mlo-section">
              <h2>{s.name} <span className="mlo-note" style={{ fontWeight: 400 }}>· {KIND_LABELS[s.kind]} · brings {s.brings === "loans" ? "loans" : "people"}</span></h2>
              <p style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 8px" }}>{s.routes.map((r) => <span key={r} className="mlo-pill">{ROUTE_LABELS[r]}</span>)}</p>
              <ol className="mlo-note" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>{s.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
              {s.note ? <p className="mlo-note">{s.note}</p> : null}
              <p className="mlo-note">Use {s.brings === "loans" ? <>your loan address{s.key !== "other" ? <> with <code>?source={s.key}</code></> : null}</> : <>your lead address with <code>?source={s.key}</code></>}{s.routes.includes("import") ? <>, or <Link href="/mlo/contacts/import">Import</Link></> : null}.</p>
              {s.credentials && me ? (
                <form action={saveConnectionAction.bind(null, s.key)} className="mlo-grid" style={{ marginTop: 10 }}>
                  <p className="mlo-note"><strong>API access</strong>{c ? ` · ${c.status === "tested" ? "signed in" : c.status === "failed" ? "the last test failed" : "saved"}${c.note ? `: ${c.note}` : ""}` : " · not saved"}</p>
                  {s.credentials.map((f) => (
                    <label key={f.key} className="mlo-field">
                      <span>{f.label}{f.hint ? <span className="mlo-note"> · {f.hint}</span> : null}</span>
                      <input name={f.key} type={f.secret ? "password" : "text"} className="mlo-input" autoComplete="off" defaultValue={f.secret ? "" : c?.fields[f.key] ?? ""} placeholder={f.secret && c?.fields[f.key] ? "Saved (leave blank to keep)" : ""} />
                    </label>
                  ))}
                  <div className="mlo-row-form">
                    <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Save</button>
                    {s.key === "encompass" && c ? <button type="submit" formAction={testConnectionAction.bind(null, s.key)} className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Test</button> : null}
                    {c ? <button type="submit" formAction={removeConnectionAction.bind(null, s.key)} className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} formNoValidate>Remove</button> : null}
                  </div>
                </form>
              ) : null}
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
