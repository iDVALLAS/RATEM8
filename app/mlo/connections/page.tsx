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
import { addHookAction, removeConnectionAction, removeHookAction, saveConnectionAction, testConnectionAction, testHookAction } from "./actions";
import { AUTODIALER_STATES, EVENTS, hookStore, ZAP_EVENTS } from "@/lib/zapier/service";
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
  const hooks = me ? await hookStore().list(me.id).catch(() => []) : [];
  const callUrl = `${origin}/api/zapier/call`;
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
        <section className="mlo-section" id="zapier">
          <h2>Zapier: your dialer and anything else</h2>
          <p className="mlo-note" style={{ maxWidth: 720 }}>Connect a power dialer (PhoneBurner, Kixie, Mojo and others), Slack, Google Sheets or any of Zapier&apos;s apps. In Zapier, start a Zap with &ldquo;Webhooks by Zapier: Catch Hook&rdquo;, copy its address, and add it here for what you want sent. Make, n8n and Pipedream hooks work too. Whatever you connect receives your clients&apos; names and numbers, so use apps you trust with client information.</p>
          {hooks.length ? (
            <ul className="loa-items loa-items--stack" style={{ margin: "10px 0" }}>
              {hooks.map((h) => (
                <li key={h.id}>
                  <span><span className="loa-tag">{EVENTS[h.event].label}</span>{h.label} · {h.host}{h.lastAt ? ` · last ${h.lastOk ? "delivered" : "failed"} ${h.lastAt.slice(0, 16).replace("T", " ")}` : ""}</span>
                  <span className="mlo-row-form">
                    <form action={testHookAction.bind(null, h.event)}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Send a test</button></form>
                    <form action={removeHookAction.bind(null, h.id)}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Remove</button></form>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {me ? (
            <form action={addHookAction} className="mlo-grid">
              <div className="mlo-row-form">
                <select name="event" className="mlo-select" aria-label="What to send">{ZAP_EVENTS.map((e) => <option key={e} value={e}>{EVENTS[e].label}</option>)}</select>
                <input name="label" className="mlo-input" placeholder="Name (e.g. PhoneBurner)" aria-label="Name" maxLength={60} />
              </div>
              <input name="url" type="url" className="mlo-input" placeholder="https://hooks.zapier.com/hooks/catch/…" aria-label="Hook address" required />
              <button type="submit" className="mlo-btn">Connect</button>
            </form>
          ) : null}
          <ul className="mlo-note" style={{ paddingLeft: 18, marginTop: 10, display: "grid", gap: 4 }}>
            {ZAP_EVENTS.map((e) => <li key={e}><strong>{EVENTS[e].label}:</strong> {EVENTS[e].when}</li>)}
          </ul>
          <h3 style={{ marginTop: 14 }}>Call results back from your dialer</h3>
          <p className="mlo-note">Add a second Zap: your dialer&apos;s &ldquo;call completed&rdquo; trigger, then &ldquo;Webhooks by Zapier&rdquo; POST to <code className="mlo-code">{callUrl}</code> with your key in the X-CC-Key header and the fields phone, result (the disposition) and notes. Each call is logged on the contact; &ldquo;do not call&rdquo; and &ldquo;wrong number&rdquo; turn calls off for them.</p>
          <p className="mlo-note"><strong>Dialers and the law:</strong> the list only has people your contact rules allow right now (permission, do-not-call, quiet hours, caps). People in {AUTODIALER_STATES.join(", ")} go to a dialer only with written permission to call (those states regulate automated dialing). Use a one-line power dialer: dialers that ring several numbers at once can drop calls, which federal rules limit (47 CFR 64.1200(a)(7)).</p>
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
