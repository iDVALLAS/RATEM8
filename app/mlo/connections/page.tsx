import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { requestOrigin } from "@/lib/mail/origin";
import { KIND_LABELS, ROUTE_LABELS, SYSTEMS, type System } from "@/lib/connect/catalog";
import { connectionStore, type Connection } from "@/lib/connect/service";
import { pipelineStore } from "@/lib/pipeline/store";
import { contactStore } from "@/lib/contacts/store";
import { CONNECTIONS, SUBS } from "@/lib/content/cc-pages";
import { FlashBox } from "../MloChrome";
import PageHead from "../PageHead";
import { TechSteps } from "../NotOnYet";
import KeyMaker from "../pipeline/KeyMaker";
import { deleteKeyAction } from "../pipeline/actions";
import HashPick from "./HashPick";
import { addHookAction, removeConnectionAction, removeHookAction, saveConnectionAction, testConnectionAction, testHookAction } from "./actions";
import { AUTODIALER_STATES, EVENTS, hookStore, ZAP_EVENTS } from "@/lib/zapier/service";
import "../mlo.css";
import "../loa/loa.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connections", robots: { index: false, follow: false } };

type State = { label: string; on: boolean };

/**
 * /mlo/connections — your loan system, application portal and CRM, and how
 * each connects (D63). D76: it opens with "Which loan system do you use?";
 * picking one shows that system's three steps, and the rest fold under
 * "Other systems". Each card's header says whether it's connected.
 */
export default async function Connections({ searchParams }: { searchParams: Promise<{ f?: string; sys?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const owner = me?.role === "owner";
  const origin = requestOrigin(await headers());
  const loansUrl = `${origin}/api/pipeline/inbound`;
  const leadsUrl = `${origin}/api/leads/inbound`;
  const [saved, hooks, keys, loans, people] = me
    ? await Promise.all([
        connectionStore().list(me.id).catch(() => [] as Connection[]),
        hookStore().list(me.id).catch(() => []),
        pipelineStore().keys(me.id).catch(() => []),
        pipelineStore().list(me.id).catch(() => []),
        contactStore().list({ ownerUserId: me.id, kind: "contact", limit: 2000 }).then((x) => x.contacts).catch(() => []),
      ])
    : [[], [], [], [], []];
  const callUrl = `${origin}/api/zapier/call`;
  const loanSystems = SYSTEMS.filter((s) => s.kind === "los");
  const picked = SYSTEMS.find((s) => s.key === sp.sys) ?? null;

  const stateOf = (s: System): State => {
    const c = saved.find((x) => x.system === s.key);
    if (c) return { label: c.status === "tested" ? CONNECTIONS.signedIn : c.status === "failed" ? CONNECTIONS.failed : CONNECTIONS.saved, on: c.status !== "failed" };
    const n = s.brings === "loans" ? loans.filter((l) => l.source.toLowerCase() === s.key).length : people.filter((p) => p.source === `lead:${s.key}`).length;
    if (n) return { label: `${CONNECTIONS.connected} (${n})`, on: true };
    if (keys.some((k) => k.label.trim().toLowerCase() === s.name.toLowerCase())) return { label: CONNECTIONS.keyMade, on: false };
    return { label: CONNECTIONS.notConnected, on: false };
  };

  const card = (s: System) => {
    const c = saved.find((x) => x.system === s.key);
    const st = stateOf(s);
    const endpoint = `${s.brings === "loans" ? loansUrl : leadsUrl}?source=${s.key}`;
    const inSoFar = s.brings === "loans" ? loans.filter((l) => l.source.toLowerCase() === s.key).length : people.filter((p) => p.source === `lead:${s.key}`).length;
    return (
      <>
        <ol className="cc-steps3">
          <li>
            <h3>{CONNECTIONS.stepKey}</h3>
            <p className="mlo-note">{CONNECTIONS.stepKeyHelp}</p>
            {me ? <KeyMaker endpoint={endpoint} defaultLabel={s.name} owner={owner} /> : null}
          </li>
          <li>
            <h3>{CONNECTIONS.stepSetup(s.name.replace(/ \(.*\)$/, ""))}</h3>
            <ol className="mlo-note cc-steps3__list">{s.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
            {s.note ? <p className="mlo-note">{s.note}</p> : null}
            {s.routes.includes("import") ? <p className="mlo-note">Or <Link href="/mlo/contacts/import">Import</Link> a file.</p> : null}
            {s.credentials && me ? (
              <form action={saveConnectionAction.bind(null, s.key)} className="mlo-grid" style={{ marginTop: 10 }}>
                <p className="mlo-note"><strong>Sign-in details from {s.name.replace(/ \(.*\)$/, "")}</strong>{c ? ` · ${c.status === "tested" ? "signed in" : c.status === "failed" ? "the last test failed" : "saved"}${c.note ? `: ${c.note}` : ""}` : " · not saved"}</p>
                {s.credentials.map((f) => (
                  <label key={f.key} className="mlo-field">
                    <span>{f.label}{f.hint ? <span className="mlo-note"> · {f.hint}</span> : null}</span>
                    <input name={f.key} type={f.secret ? "password" : "text"} className="mlo-input" autoComplete="off" defaultValue={f.secret ? "" : c?.fields[f.key] ?? ""} placeholder={f.secret && c?.fields[f.key] ? "Saved (leave blank to keep)" : ""} />
                  </label>
                ))}
                <div className="mlo-row-form">
                  <button type="submit" className="mlo-btn">Save</button>
                  {s.key === "encompass" && c ? <button type="submit" formAction={testConnectionAction.bind(null, s.key)} className="mlo-btn mlo-btn--ghost">Test</button> : null}
                  {c ? <button type="submit" formAction={removeConnectionAction.bind(null, s.key)} className="mlo-btn mlo-btn--ghost" formNoValidate>Remove</button> : null}
                </div>
              </form>
            ) : null}
          </li>
          <li>
            <h3>{CONNECTIONS.stepCheck}</h3>
            <p className="mlo-note">
              <span className={`cc-state ${st.on ? "is-on" : ""}`}>{st.label}</span>{" "}
              {s.brings === "loans"
                ? inSoFar ? <>See them on <Link href="/mlo/pipeline">Pipeline</Link>.</> : <>Once {s.name.replace(/ \(.*\)$/, "")} sends its first update, the loan shows on <Link href="/mlo/pipeline">Pipeline</Link> and this says so.</>
                : inSoFar ? <>See them in <Link href="/mlo/leads">Leads</Link>.</> : <>Once the first person comes in, they show in <Link href="/mlo/leads">Leads</Link> and this says so.</>}
            </p>
          </li>
        </ol>
      </>
    );
  };

  const head = (s: System, tag: "h2" | "span" = "h2") => {
    const st = stateOf(s);
    const Tag = tag;
    return (
      <span className="cc-syshead">
        <Tag className="cc-syshead__name">{s.name}</Tag>
        <span className="mlo-note">{KIND_LABELS[s.kind]} · {s.brings === "loans" ? CONNECTIONS.loans : CONNECTIONS.people} · {s.routes.map((r) => ROUTE_LABELS[r]).join(", ")}</span>
        <span className={`cc-state ${st.on ? "is-on" : ""}`}>{st.label}</span>
      </span>
    );
  };

  const others = SYSTEMS.filter((s) => s.key !== picked?.key);

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead
          k="connections"
          title="Connections"
          sub={SUBS.connections}
          how={<p className="mlo-note">Each system below says the route that works today, from what the vendor offers. Loans land on Pipeline (and feed each loan&apos;s journey and your LOA); people land in Contacts and Leads. Each system gets its own connection address, so you can turn one off without touching the rest.</p>}
        />
        <FlashBox flash={decodeFlash(sp.f)} />
        <HashPick keys={SYSTEMS.map((s) => s.key)} picked={picked?.key ?? null} />

        <section className="mlo-section" aria-labelledby="pick-h">
          <h2 id="pick-h">{CONNECTIONS.ask}</h2>
          <div className="cc-pick">
            {loanSystems.map((s) => (
              <Link key={s.key} href={`/mlo/connections?sys=${s.key}#${s.key}`} className={`mlo-btn ${picked?.key === s.key ? "" : "mlo-btn--ghost"}`} aria-current={picked?.key === s.key ? "true" : undefined}>{s.key === "other" ? "Something else" : s.name}</Link>
            ))}
          </div>
        </section>

        {picked ? (
          <section className="mlo-section cc-sys" id={picked.key} aria-label={picked.name}>
            {head(picked)}
            {card(picked)}
          </section>
        ) : null}

        <details className="mlo-section cc-fold" id="others">
          <summary className="cc-sechead"><h2>{CONNECTIONS.other}</h2><span className="cc-fold__arrow" aria-hidden="true" /></summary>
          {others.map((s) => (
            <details key={s.key} id={s.key} className="cc-sys cc-sys--fold">
              <summary>{head(s, "span")}</summary>
              {card(s)}
            </details>
          ))}
        </details>

        <section className="mlo-section" id="zapier">
          <h2>Zapier: your dialer and anything else</h2>
          <p className="mlo-note" style={{ maxWidth: 720 }}>Connect a power dialer (PhoneBurner, Kixie, Mojo and others), Slack, Google Sheets or any of Zapier&apos;s apps. In Zapier, start a Zap with &ldquo;Webhooks by Zapier: Catch Hook&rdquo;, copy its address, and add it here for what you want sent. Make, n8n and Pipedream work too. Whatever you connect receives your clients&apos; names and numbers, so use apps you trust with client information.</p>
          {hooks.length ? (
            <ul className="loa-items loa-items--stack" style={{ margin: "10px 0" }}>
              {hooks.map((h) => (
                <li key={h.id}>
                  <span><span className="loa-tag">{EVENTS[h.event].label}</span>{h.label} · {h.host}{h.lastAt ? ` · last ${h.lastOk ? "delivered" : "failed"} ${h.lastAt.slice(0, 16).replace("T", " ")}` : ""}</span>
                  <span className="mlo-row-form">
                    <form action={testHookAction.bind(null, h.event)}><button type="submit" className="mlo-btn mlo-btn--ghost">Send a test</button></form>
                    <form action={removeHookAction.bind(null, h.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Remove</button></form>
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
              <input name="url" type="url" className="mlo-input" placeholder="https://hooks.zapier.com/hooks/catch/…" aria-label="Zap address" required />
              <button type="submit" className="mlo-btn">Connect</button>
            </form>
          ) : null}
          <ul className="mlo-note" style={{ paddingLeft: 18, marginTop: 10, display: "grid", gap: 4 }}>
            {ZAP_EVENTS.map((e) => <li key={e}><strong>{EVENTS[e].label}:</strong> {EVENTS[e].when}</li>)}
          </ul>
          <h3 style={{ marginTop: 14 }}>Call results back from your dialer</h3>
          <p className="mlo-note">Make a connection address for your dialer below (name it after the dialer), then add a second Zap: your dialer&apos;s &ldquo;call completed&rdquo; trigger, then &ldquo;Webhooks by Zapier&rdquo; (POST) to that address, with the fields phone, result (the disposition) and notes. Each call is logged on the contact; &ldquo;do not call&rdquo; and &ldquo;wrong number&rdquo; turn calls off for them.</p>
          {me ? <KeyMaker endpoint={callUrl} defaultLabel="Dialer" owner={owner} /> : null}
          <p className="mlo-note"><strong>Dialers and the law:</strong> the list only has people your contact rules allow right now (permission, do-not-call, quiet hours, caps). People in {AUTODIALER_STATES.join(", ")} go to a dialer only with written permission to call (those states regulate automated dialing). Use a one-line power dialer: dialers that ring several numbers at once can drop calls, which federal rules limit (47 CFR 64.1200(a)(7)).</p>
        </section>

        <section className="mlo-section" id="keys">
          <h2>{CONNECTIONS.keys}</h2>
          {keys.length === 0 ? <p className="mlo-note">{CONNECTIONS.keysNone}</p> : (
            <ul className="loa-items loa-items--stack">
              {keys.map((k) => (
                <li key={k.hash}>
                  <span><strong>{k.label}</strong> <span className="mlo-note">· made {new Date(k.createdAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}</span></span>
                  <form action={deleteKeyAction}><input type="hidden" name="hash" value={k.hash} /><button type="submit" className="mlo-btn mlo-btn--ghost">Turn off</button></form>
                </li>
              ))}
            </ul>
          )}
          <TechSteps owner={owner}>
            <p className="mlo-note">Loans: <code className="mlo-code">{loansUrl}</code> · People: <code className="mlo-code">{leadsUrl}</code> · Dialer results: <code className="mlo-code">{callUrl}</code>. Each takes the key as <code>?key=</code> or in the <code>X-CC-Key</code> header, and <code>?source=</code> names the system.</p>
          </TechSteps>
        </section>
      </div>
    </PageShell>
  );
}
