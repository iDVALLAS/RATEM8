import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { contactStore } from "@/lib/contacts/store";
import { videoStore } from "@/lib/videos/store";
import { DEFAULT_NOTE, NOTE_MAX, prefixFor, transcribeOn, videosOn } from "@/lib/videos/service";
import { emailReadyFor } from "@/lib/messaging/email";
import { twilioConfig } from "@/lib/messaging/twilio";
import { FlashBox } from "../MloChrome";
import Recorder, { CheckAgain } from "./Recorder";
import { deleteVideoAction, renameVideoAction, sendVideoAction } from "./actions";
import "../mlo.css";
import "./videos.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Video messages", robots: { index: false, follow: false } };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "");
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** /mlo/videos — record short videos, check what they say, send each person their own link (D55). */
export default async function VideosPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const shell = (body: React.ReactNode) => (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Video messages</h1>
        <FlashBox flash={decodeFlash(sp.f)} />
        {body}
      </div>
    </PageShell>
  );
  if (!me) return shell(<section className="mlo-section"><p className="mlo-note">Sign in with your own account to make video messages.</p></section>);
  if (!videosOn())
    return shell(
      <section className="mlo-section">
        <h2>Turn on video messages</h2>
        <p className="mlo-note">Videos are stored in Vercel Blob. The owner turns it on once: in Vercel, open the project, then Storage, then Create, then Blob, and connect it to this project. Vercel adds BLOB_READ_WRITE_TOKEN (Sensitive) for you. Then redeploy.</p>
      </section>,
    );

  const [videos, sends, people, mail] = await Promise.all([videoStore().videosFor(me.id, 50), videoStore().sendsFor(me.id, 200), contactStore().list({ ownerUserId: me.id, limit: 500 }), emailReadyFor(me)]);
  const ready = videos.filter((x) => x.status === "ok");
  const byVideo = new Map<string, typeof sends>();
  for (const s of sends) byVideo.set(s.videoId, [...(byVideo.get(s.videoId) ?? []), s]);
  const contacts = people.contacts.filter((c) => c.phone || c.email).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  const checkReady = transcribeOn();

  return shell(
    <>
      <p className="mlo-note" style={{ maxWidth: 680 }}>A short video says more than a text. Record one here, or upload one from your phone. Before it can be sent, what you say is checked by the same rules as every text and email, and turned into captions. Each person gets their own link, so you see who watched.</p>

      <section className="mlo-section" id="new">
        <h2>New video</h2>
        {!checkReady ? <p className="mlo-note">The word check needs Google Speech-to-Text: the owner turns on the Speech-to-Text API for the Google Cloud key M8&apos;s voice uses (GOOGLE_CLOUD_API_KEY).</p> : null}
        <Recorder folder={prefixFor(me.id)} checkReady={checkReady} />
      </section>

      {ready.length ? (
        <section className="mlo-section" id="send">
          <h2>Send a video</h2>
          <form action={sendVideoAction} className="mlo-grid">
            <input type="hidden" name="back" value="videos" />
            <label className="mlo-field">
              <span>Video</span>
              <select name="videoId" className="mlo-select" required>
                {ready.map((x) => <option key={x.id} value={x.id}>{x.title} ({clock(x.durationSec)})</option>)}
              </select>
            </label>
            <label className="mlo-field">
              <span>To</span>
              <select name="contactId" className="mlo-select" required defaultValue="">
                <option value="" disabled>Pick a person</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{`${c.firstName} ${c.lastName}`.trim() || c.email}</option>)}
              </select>
            </label>
            <label className="mlo-field">
              <span>Note with the link ({"{first}"} is their first name)</span>
              <textarea name="note" rows={2} maxLength={NOTE_MAX} className="mlo-textarea" defaultValue={DEFAULT_NOTE} required />
            </label>
            <div className="mlo-row-form">
              <select name="channel" className="mlo-select" aria-label="How to send it" defaultValue={twilioConfig() ? "text" : "email"}>
                <option value="text" disabled={!twilioConfig()}>By text</option>
                <option value="email" disabled={!mail.ready}>By email</option>
              </select>
              <select name="purpose" className="mlo-select" aria-label="What it's about" defaultValue="service">
                <option value="service">About their loan or account</option>
                <option value="marketing">An offer or check-in</option>
              </select>
              <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Send</button>
            </div>
            <p className="mlo-note">It goes through your contact rules like any text or email: permission, quiet hours, caps and STOP. You can also send from a contact&apos;s page.</p>
          </form>
        </section>
      ) : null}

      <section className="mlo-section" id="library">
        <h2>Your videos</h2>
        {videos.length ? (
          <ul className="vid-list">
            {videos.map((x) => {
              const to = byVideo.get(x.id) ?? [];
              const watched = to.filter((s) => s.views > 0).length;
              return (
                <li key={x.id} className="vid-item">
                  <video className="vid-thumb" src={x.url} poster={x.posterUrl ?? undefined} preload="none" controls playsInline aria-label={x.title} />
                  <div className="vid-body">
                    <form action={renameVideoAction.bind(null, x.id)} className="mlo-row-form">
                      <input name="title" className="mlo-input vid-title" defaultValue={x.title} maxLength={80} aria-label="Name" />
                      <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Rename</button>
                    </form>
                    <p className="mlo-note">
                      {clock(x.durationSec)} · added {when(x.createdAt)} ·{" "}
                      {x.status === "ok" ? <strong className="vid-ok">Ready to send</strong> : x.status === "held" ? <strong className="vid-held">Held by the word check</strong> : <strong>Word check not finished</strong>}
                    </p>
                    {x.status === "held" ? <p className="mlo-note">{x.reason} It can&apos;t be sent; record it again without that part.</p> : null}
                    {x.status === "ok" && x.reason ? <p className="mlo-note">{x.reason}</p> : null}
                    {x.status === "checking" ? <div className="mlo-row-form"><CheckAgain id={x.id} url={x.url} /></div> : null}
                    {x.transcript ? <details><summary className="mlo-note">What it says (also its captions)</summary><p className="mlo-note" style={{ whiteSpace: "pre-wrap" }}>{x.transcript}</p></details> : null}
                    {to.length ? (
                      <details>
                        <summary className="mlo-note">Sent to {to.length} {to.length === 1 ? "person" : "people"} · {watched} watched</summary>
                        <ul className="vid-sends">
                          {to.map((s) => <li key={s.token}><Link href={`/mlo/contacts/${encodeURIComponent(s.contactId)}`}>{s.contactName}</Link> · {s.channel} {when(s.at)} · {s.views ? `watched ${s.views === 1 ? "once" : `${s.views} times`}, last ${when(s.lastViewedAt)}` : "not watched yet"}</li>)}
                        </ul>
                      </details>
                    ) : null}
                    <form action={deleteVideoAction.bind(null, x.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Delete</button></form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mlo-note">No videos yet. Ideas: congratulations at closing, a welcome to a new lead, a thank-you to an agent, a check-in on a home anniversary.</p>
        )}
      </section>
    </>,
  );
}
