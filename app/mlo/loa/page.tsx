import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { AGENTS } from "@/lib/agents/team";
import { LENDER_BRANDS } from "@/lib/lenders";
import { pipelineStore } from "@/lib/pipeline/store";
import { loaStore } from "@/lib/loa/store";
import { autonomyOf, loaQueue, loaTasks, toLabel } from "@/lib/loa/service";
import { queuedFor, whenLong } from "@/lib/loa/autopilot";
import { canChangeSwitches } from "@/lib/loa/autonomy";
import { bookOf } from "@/lib/contacts/service";
import { loaAutoWords as aw, loaQueueWords as q, loaSwitches } from "@/lib/content/loa";
import AutonomyGrid from "./AutonomyGrid";
import { listenOn, voiceOn } from "@/lib/voice/google";
import { FlashBox } from "../MloChrome";
import LoaChat from "./LoaChat";
import { addOverlayAction, approveLoaDraft, notThisTimeAction, removeOverlayAction, sendSoonAction, sendWhenAction, stopQueuedAction } from "./actions";
import { addFormAction, removeFormAction } from "../pipeline/[id]/forms/actions";
import { FORM_KIND_LABELS, FORM_KINDS, OFFICIAL_FORMS } from "@/lib/forms/catalog";
import { libraryFor } from "@/lib/forms/service";
import "../mlo.css";
import "./loa.css";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Your LOA", robots: { index: false, follow: false } };

/** /mlo/loa — your Loan Officer Assistant: talk to it, see what needs you, and keep your lenders' overlays (D62). */
export default async function LoaPage({ searchParams }: { searchParams: Promise<{ f?: string; loan?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const a = AGENTS.loa;
  const shell = (body: React.ReactNode) => (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center · Your team</p>
        <h1 className="tagline text-4xl">Your Loan Officer Assistant</h1>
        <FlashBox flash={decodeFlash(sp.f)} />
        {body}
      </div>
    </PageShell>
  );
  if (!me) return shell(<section className="mlo-section"><p className="mlo-note">Sign in with your own account to work with your LOA.</p></section>);

  // D70: an assistant sees the book they work (and its switches, read-only).
  const owner = me.role === "assistant" ? (bookOf(me) ?? me.id) : me.id;
  // D71: anything due goes out after this page is sent (CcShell), so it never slows the page.
  const now = new Date();
  const [loans, overlays, tasks, library, queue, auto, queued] = await Promise.all([pipelineStore().list(owner).catch(() => []), loaStore().overlays(me.id).catch(() => []), loaTasks(me).catch(() => []), libraryFor(me).catch(() => []), loaQueue(me).catch(() => ({ drafts: [], proposals: [] })), autonomyOf(owner).catch(() => null), queuedFor(owner).catch(() => [])]);
  const todo = tasks.filter((t) => t.kind !== "draft");
  const open = loans.filter((l) => !l.closed && !l.dead);
  const lenders = [...new Set(overlays.map((o) => o.lender))];

  return shell(
    <>
      <section className="mlo-section loa-hero">
        <p className="loa-hero__role">{a.role}</p>
        <ul className="loa-does">{a.does.map((d) => <li key={d}>{d}</li>)}</ul>
        <p className="mlo-note">Drop documents on each loan&apos;s page (Pipeline, then the loan, then <em>Your LOA on this file</em>). It drafts; you approve anything that goes out. <a href="#autopilot">Choose how much it does on its own</a>. Guideline answers cite Fannie Mae or Freddie Mac; they&apos;re research help, not an underwriting decision.</p>
      </section>

      <section className="mlo-section" id="needs">
        <h2>{q.heading}</h2>
        <h3 className="loa-subhead" id="going">{aw.queuedHeading}</h3>
        <p className="mlo-note">{aw.queuedNote}</p>
        {queued.length ? (
          <ul className="loa-queue">
            {queued.map(({ loanId, borrower, draft: d }) => (
              <li key={d.id} className="loa-queue__item--auto">
                <div className="loa-queue__what">
                  <span><strong>{borrower}</strong>: {d.channel === "text" ? `Text to the ${toLabel(d.to)}` : d.subject}</span>
                  <span className="mlo-note">{q.to(toLabel(d.to))}{d.channel !== "text" && d.toEmail ? ` · ${d.toEmail}` : ""}</span>
                  <span className="loa-when">{whenLong(d, now)}</span>
                  <details className="loa-queue__body"><summary className="mlo-note">{q.read}</summary><pre>{d.body}</pre></details>
                </div>
                <div className="loa-queue__acts">
                  <form action={stopQueuedAction.bind(null, loanId, d.id, "queue")}><button type="submit" className="mlo-btn">{aw.stop}</button></form>
                  {d.when !== "soon" ? <form action={sendSoonAction.bind(null, loanId, d.id, "queue")}><button type="submit" className="mlo-btn mlo-btn--ghost">{aw.soon(auto?.undoMinutes ?? 15)}</button></form> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mlo-note">{aw.queuedEmpty}</p>}
        <h3 className="loa-subhead">{q.draftsHeading}</h3>
        {queue.drafts.length ? (
          <ul className="loa-queue">
            {queue.drafts.map(({ loanId, borrower, draft: d }) => (
              <li key={d.id}>
                <div className="loa-queue__what">
                  <span><strong>{borrower}</strong>: {d.subject}</span>
                  <span className="mlo-note">{q.to(toLabel(d.to))}{d.toEmail ? ` · ${d.toEmail}` : ` · ${q.noAddress}`}</span>
                  {d.autoReason ? <span className="mlo-note loa-why">{aw.asksBecause}: {d.autoReason}.</span> : null}
                  <details className="loa-queue__body"><summary className="mlo-note">{q.read}</summary><pre>{d.body}</pre></details>
                </div>
                <div className="loa-queue__acts">
                  <form action={approveLoaDraft.bind(null, loanId, d.id)}><button type="submit" className="mlo-btn">{q.approve}</button></form>
                  <Link href={`/mlo/pipeline/${encodeURIComponent(loanId)}#drafts`} className="mlo-btn mlo-btn--ghost">{q.edit}</Link>
                  <form action={notThisTimeAction.bind(null, loanId, d.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">{q.notThisTime}</button></form>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mlo-note">{q.empty}</p>}
        {queue.proposals.length ? (
          <>
            <h3 className="loa-subhead">{q.proposalsHeading}</h3>
            <p className="mlo-note">{q.proposalsNote}</p>
            <ul className="loa-tasks">
              {queue.proposals.map((p) => (
                <li key={p.id}><Link href="/mlo/concierge#drafts"><strong>{p.name}</strong>: {p.body.slice(0, 120)}{p.body.length > 120 ? "…" : ""}</Link></li>
              ))}
            </ul>
            <p style={{ margin: "8px 0 0" }}><Link href="/mlo/concierge#drafts" className="mlo-btn mlo-btn--ghost">{q.openDesk}</Link></p>
          </>
        ) : null}
        <h3 className="loa-subhead">{q.tasksHeading}</h3>
        {todo.length ? (
          <ul className="loa-tasks">
            {todo.slice(0, 25).map((t, i) => (
              <li key={i} className={t.urgent ? "is-urgent" : ""}>
                <Link href={t.href}><strong>{t.borrower}</strong>: {t.title}</Link>
                <span className="mlo-note">{t.why}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mlo-note">{open.length ? "Nothing needs you right now on your open loans." : "No open loans yet. They come in from your loan system on the Pipeline page."}</p>
        )}
      </section>

      <section className="mlo-section loa-autopilot" id="autopilot">
        <h2>{loaSwitches.heading}</h2>
        {auto ? <AutonomyGrid modes={auto.modes} canEdit={canChangeSwitches(me, owner)} /> : <p className="mlo-note">Couldn&apos;t load your switches. Try again in a moment.</p>}
        {auto ? (
          <div className="loa-sendwhen" id="sendwhen">
            <h3>{aw.whenHeading}</h3>
            <div className="loa-sendwhen__opts" role="group" aria-label={aw.whenHeading}>
              {(["morning", "soon"] as const).map((w) => (
                <form key={w} action={sendWhenAction.bind(null, w)}>
                  <button type="submit" className={`mlo-btn ${auto.sendWhen === w ? "" : "mlo-btn--ghost"}`} aria-pressed={auto.sendWhen === w} disabled={!canChangeSwitches(me, owner)}>{w === "morning" ? aw.whenMorning : aw.whenSoon(auto.undoMinutes)}</button>
                </form>
              ))}
            </div>
            <p className="mlo-note">{aw.whenNote}</p>
            {me.role === "owner" ? <p className="mlo-note loa-ownernote">{aw.ownerCallerNote}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="mlo-section" id="talk">
        <h2>Talk to your LOA</h2>
        <LoaChat loans={open.map((l) => ({ id: l.id, label: `${l.borrowerName} · ${l.milestone}` }))} lenders={lenders} defaultLoanId={sp.loan && open.some((l) => l.id === sp.loan) ? sp.loan : null} mic={listenOn("cc")} voice={voiceOn("cc")} />
      </section>

      <section className="mlo-section" id="overlays">
        <h2>Your lenders&apos; overlays</h2>
        <p className="mlo-note">Upload each lender&apos;s overlay sheet or program matrix once. Your LOA reads it into plain rules and checks them whenever you ask. Agency guidelines it looks up live from Fannie Mae and Freddie Mac.</p>
        {overlays.length ? (
          <ul className="loa-overlays">
            {overlays.map((o) => (
              <li key={o.id}>
                <span><strong>{o.lender}</strong> · {o.title} · {o.chars.toLocaleString("en-US")} characters · {o.createdAt.slice(0, 10)}</span>
                <details><summary className="mlo-note">See the rules</summary><pre className="loa-rules">{o.rules}</pre></details>
                <form action={removeOverlayAction.bind(null, o.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Remove</button></form>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={addOverlayAction} className="mlo-grid" style={{ marginTop: 12 }}>
          <div className="mlo-row-form">
            <label className="mlo-field" style={{ flex: 1, minWidth: 0 }}><span>Lender</span><input name="lender" className="mlo-input" list="loa-lenders" required maxLength={60} /></label>
            <label className="mlo-field" style={{ flex: 1, minWidth: 0 }}><span>What it is (optional)</span><input name="title" className="mlo-input" maxLength={100} placeholder="Conventional overlays, Nov 2026" /></label>
          </div>
          <datalist id="loa-lenders">{LENDER_BRANDS.map((l) => <option key={l.slug} value={l.name} />)}</datalist>
          <label className="mlo-field"><span>The overlay PDF (up to 5 MB)</span><input type="file" name="doc" accept="application/pdf" className="mlo-input" /></label>
          <label className="mlo-field"><span>…or paste its text</span><textarea name="text" rows={3} className="mlo-textarea" /></label>
          <button type="submit" className="mlo-btn">Read it in</button>
        </form>
      </section>

      <section className="mlo-section loa-forms" id="forms">
        <h2>Your forms library</h2>
        <p className="mlo-note" style={{ maxWidth: 720 }}>The blank forms you use on every file. Drop each in once; on any loan, your LOA fills the fillable ones from the file (Forms on the loan&apos;s page) and keeps the copy there. Forms from ARIVE: download them from the loan in ARIVE and drop them here. Disclosures stay in your loan system.</p>
        {library.length ? (
          <ul className="loa-items loa-items--stack" style={{ margin: "10px 0" }}>
            {library.map((x) => (
              <li key={x.id}>
                <span><span className="loa-tag">{FORM_KIND_LABELS[x.kind]}</span><a href={`/api/cc/forms/${encodeURIComponent(x.id)}`} target="_blank" rel="noopener">{x.name}</a> · {x.fields.length ? `${x.fields.length} fillable fields` : "not fillable"}</span>
                <form action={removeFormAction.bind(null, null, x.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Remove</button></form>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={addFormAction.bind(null, null)} className="mlo-grid">
          <div className="mlo-row-form">
            <select name="kind" className="mlo-select" aria-label="What kind of form">{FORM_KINDS.map((k) => <option key={k} value={k}>{FORM_KIND_LABELS[k]}</option>)}</select>
            <input name="name" className="mlo-input" placeholder="Name (optional)" aria-label="Name" maxLength={90} />
          </div>
          <input type="file" name="doc" accept="application/pdf" className="mlo-input" required aria-label="The blank form (PDF, up to 4 MB)" />
          <button type="submit" className="mlo-btn">Add to my library</button>
        </form>
        <h3 style={{ marginTop: 14 }}>Worth keeping here</h3>
        <ul className="mlo-note" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
          {OFFICIAL_FORMS.map((o) => <li key={o.name}>{o.name}: {o.where}</li>)}
        </ul>
        <p className="mlo-note">Blank forms only. A form that already has a Social Security number in it isn&apos;t kept: signed borrower documents stay in your loan system.</p>
      </section>
    </>,
  );
}
