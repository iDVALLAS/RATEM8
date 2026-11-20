import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { AGENTS } from "@/lib/agents/team";
import { LENDER_BRANDS } from "@/lib/lenders";
import { pipelineStore } from "@/lib/pipeline/store";
import { loaStore } from "@/lib/loa/store";
import { loaTasks } from "@/lib/loa/service";
import { listenOn, voiceOn } from "@/lib/voice/google";
import { FlashBox } from "../MloChrome";
import LoaChat from "./LoaChat";
import { addOverlayAction, removeOverlayAction } from "./actions";
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

  const [loans, overlays, tasks] = await Promise.all([pipelineStore().list(me.id).catch(() => []), loaStore().overlays(me.id).catch(() => []), loaTasks(me).catch(() => [])]);
  const open = loans.filter((l) => !l.closed && !l.dead);
  const lenders = [...new Set(overlays.map((o) => o.lender))];

  return shell(
    <>
      <section className="mlo-section loa-hero">
        <p className="loa-hero__role">{a.role}</p>
        <ul className="loa-does">{a.does.map((d) => <li key={d}>{d}</li>)}</ul>
        <p className="mlo-note">Drop documents on each loan&apos;s page (Pipeline, then the loan, then <em>Your LOA on this file</em>). It drafts; you approve anything that goes out. Guideline answers cite Fannie Mae or Freddie Mac; they&apos;re research help, not an underwriting decision.</p>
      </section>

      <section className="mlo-section" id="needs">
        <h2>Needs you</h2>
        {tasks.length ? (
          <ul className="loa-tasks">
            {tasks.slice(0, 25).map((t, i) => (
              <li key={i} className={t.urgent ? "is-urgent" : ""}>
                <Link href={`/mlo/pipeline/${encodeURIComponent(t.loanId)}#loa`}><strong>{t.borrower}</strong>: {t.title}</Link>
                <span className="mlo-note">{t.why}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mlo-note">{open.length ? "Nothing needs you right now on your open loans." : "No open loans yet. They come in from your loan system on the Pipeline page."}</p>
        )}
      </section>

      <section className="mlo-section" id="talk">
        <h2>Talk to your LOA</h2>
        <LoaChat loans={open.map((l) => ({ id: l.id, label: `${l.borrowerName} · ${l.milestone}` }))} lenders={lenders} defaultLoanId={sp.loan && open.some((l) => l.id === sp.loan) ? sp.loan : null} mic={listenOn()} voice={voiceOn()} />
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
                <form action={removeOverlayAction.bind(null, o.id)}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Remove</button></form>
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
    </>,
  );
}
