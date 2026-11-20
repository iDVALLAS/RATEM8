import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { companyDetails, companyOfMlo } from "@/lib/accounts/company";
import { mloById } from "@/lib/config";
import { contactStore } from "@/lib/contacts/store";
import { voicemailStore } from "@/lib/voicemail/store";
import { callerFor, MAX_BATCH, optOutLine, voicemailOn } from "@/lib/voicemail/service";
import { transcribeOn } from "@/lib/videos/transcribe";
import { FlashBox } from "../MloChrome";
import VoicemailRecorder from "./Recorder";
import { deleteVoicemailAction, dropAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Voicemail drops", robots: { index: false, follow: false } };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "");
const STATUS: Record<string, string> = { queued: "calling", left: "voicemail left", answered: "they answered and heard it", "no-answer": "no answer, no voicemail", busy: "busy", failed: "didn't go through", canceled: "canceled" };

/** /mlo/voicemail — record a voicemail once, leave it for people through your contact rules (D57). */
export default async function VoicemailPage({ searchParams }: { searchParams: Promise<{ f?: string; c?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const shell = (body: React.ReactNode) => (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Voicemail drops</h1>
        <FlashBox flash={decodeFlash(sp.f)} />
        {body}
      </div>
    </PageShell>
  );
  if (!me) return shell(<section className="mlo-section"><p className="mlo-note">Sign in with your own account to leave voicemails.</p></section>);
  if (!voicemailOn()) return shell(<section className="mlo-section"><h2>Not on yet</h2><p className="mlo-note">Voicemail drops need Twilio (the platform&apos;s keys) and a Vercel Blob store for the recordings (the same one video messages use). The owner sets both up from the launch checklist.</p></section>);

  const m = mloById(me.mloId);
  const co = companyDetails(m);
  const [mine, drops, people, caller] = await Promise.all([voicemailStore().voicemailsFor(me.id), voicemailStore().dropsFor(me.id, 50), contactStore().list({ ownerUserId: me.id, kind: "contact", limit: 500 }), callerFor(companyOfMlo(me.mloId))]);
  const withPhone = people.contacts.filter((c) => c.phone).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  const titleOf = new Map(mine.map((x) => [x.id, x.title]));
  const picked = new Set((sp.c ?? "").split(",").filter(Boolean));

  return shell(
    <>
      <p className="mlo-note" style={{ maxWidth: 700 }}>Record a short voicemail once and leave it for one person or many. Command Center calls each number, waits for the voicemail beep, and plays your message. If they pick up, they hear it too, and can press 9 to stop. Each call goes through your contact rules as a recorded-voice call: permission with proof for loan updates, written permission for offers, the do-not-call lists, quiet hours and caps.</p>

      <section className="mlo-section">
        <h2>What every voicemail says around yours</h2>
        <ol className="mlo-note" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>“This is a recorded message from {m?.name ?? "you"} with {co.short || co.name}.”</li>
          <li>For an offer: how to stop (“press 9”, or on a voicemail, the toll-free opt-out line{optOutLine() ? "" : ", which the owner hasn't set yet, so offers can't go by voicemail"}).</li>
          <li>Your recording.</li>
          <li>“To reach {m?.firstName ?? "you"}, call {m?.phone ?? "your number"}.” For loan updates, also how to stop.</li>
        </ol>
        <p className="mlo-note">Calls come from {caller ? caller.from : "your company's number, once texting for your company is set up"}. Calls back to that number can press 9 to stop, or are put through to the loan officer who last called them.</p>
      </section>

      <section className="mlo-section" id="new">
        <h2>New voicemail</h2>
        {!transcribeOn() ? <p className="mlo-note">The word check needs the Google key with Speech-to-Text on.</p> : null}
        <VoicemailRecorder ready={transcribeOn()} />
      </section>

      <section className="mlo-section" id="library">
        <h2>Your voicemails</h2>
        {mine.length ? (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 14 }}>
            {mine.map((x) => (
              <li key={x.id} style={{ borderTop: "1px solid var(--rule)", paddingTop: 12, display: "grid", gap: 6 }}>
                <strong>{x.title}</strong>
                <audio src={x.url} controls preload="none" aria-label={x.title} />
                <details><summary className="mlo-note">What it says ({Math.round(x.seconds)} seconds)</summary><p className="mlo-note">{x.transcript}</p></details>
                <form action={deleteVoicemailAction.bind(null, x.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Delete</button></form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mlo-note">None yet. Ideas: &ldquo;your appraisal came in, call me&rdquo;, &ldquo;congratulations, you&apos;re clear to close&rdquo;, a happy home anniversary.</p>
        )}
      </section>

      {mine.length ? (
        <section className="mlo-section" id="leave">
          <h2>Leave a voicemail</h2>
          <form action={dropAction} className="mlo-grid">
            <div className="mlo-row-form">
              <select name="voicemailId" className="mlo-select" aria-label="Which voicemail" required>{mine.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
              <select name="purpose" className="mlo-select" aria-label="What it's about" defaultValue="service">
                <option value="service">About their loan or account</option>
                <option value="marketing" disabled={!optOutLine()}>An offer or check-in</option>
              </select>
            </div>
            <fieldset className="mlo-field" style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--rule)", borderRadius: 10, padding: 10 }}>
              <legend className="mlo-note">For (up to {MAX_BATCH} at a time)</legend>
              {withPhone.length ? withPhone.map((c) => (
                <label key={c.id} className="mlo-check" style={{ padding: "4px 0" }}><input type="checkbox" name="contactIds" value={c.id} defaultChecked={picked.has(c.id)} /> {`${c.firstName} ${c.lastName}`.trim()}</label>
              )) : <p className="mlo-note">No contacts with a phone number yet.</p>}
            </fieldset>
            <button type="submit" className="mlo-btn">Leave voicemail</button>
            <p className="mlo-note">People your contact rules don&apos;t allow right now are skipped, with the reason. Nothing is left outside their calling hours.</p>
          </form>
        </section>
      ) : null}

      <section className="mlo-section" id="recent">
        <h2>Recent drops</h2>
        {drops.length ? (
          <ul className="mlo-note" style={{ paddingLeft: 18 }}>
            {drops.map((d) => <li key={d.id}><Link href={`/mlo/contacts/${encodeURIComponent(d.contactId)}`}>{d.contactName}</Link> · {titleOf.get(d.voicemailId) ?? "deleted voicemail"} · {when(d.at)} · {STATUS[d.status] ?? d.status}{d.optedOut ? " · pressed 9 to stop" : ""}</li>)}
          </ul>
        ) : (
          <p className="mlo-note">None yet.</p>
        )}
      </section>
    </>,
  );
}
