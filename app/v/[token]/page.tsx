import type { Metadata } from "next";
import EqualHousingLogo from "@/components/legal/EqualHousingLogo";
import { ensureRegistry } from "@/lib/registry/cache";
import { watchView } from "@/lib/videos/service";
import Player from "./Player";
import "./watch.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "A video for you", robots: { index: false, follow: false }, referrer: "no-referrer" };

const digits = (p: string) => p.replace(/[^\d+]/g, "");

/**
 * /v/[token] — one person's video message (D55). A clean page: the video
 * with captions, ways to reach the loan officer, and the licensing lines
 * (loan officer and company with NMLS numbers, Equal Housing Opportunity).
 */
export default async function WatchPage({ params }: { params: Promise<{ token: string }> }) {
  await ensureRegistry();
  const { token } = await params;
  const v = await watchView(token);

  if (v.state !== "ok") {
    return (
      <div className="vw">
        <main className="vw-main" id="main">
          <h1 className="vw-title">{v.state === "gone" ? "This video is no longer available" : "This link isn't working"}</h1>
          <p className="vw-note">{v.state === "gone" ? `${v.mloName} has taken it down. You can still reach them directly.` : "It may have been typed wrong or taken down. Ask the person who sent it for a new link."}</p>
        </main>
      </div>
    );
  }

  const m = v.mlo;
  const initials = m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="vw">
      <main className="vw-main" id="main">
        <div className="vw-from">
          {m.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.photo} alt="" width={48} height={48} />
          ) : (
            <span className="vw-initials" aria-hidden>{initials}</span>
          )}
          <div>
            <p className="vw-eyebrow">{v.firstName ? `For ${v.firstName}` : "A video for you"}</p>
            <p className="vw-name">From {m.name}{m.nmls ? `, NMLS #${m.nmls}` : ""}</p>
          </div>
        </div>
        <h1 className="vw-title">{v.title}</h1>
        <Player token={v.token} src={v.url} type={v.contentType} poster={v.posterUrl} captions={v.hasCaptions} title={v.title} />
        <div className="vw-actions">
          {m.phone ? <a className="vw-btn vw-btn--primary" href={`sms:${digits(m.phone)}`}>Text {m.first}</a> : null}
          {m.phone ? <a className="vw-btn" href={`tel:${digits(m.phone)}`}>Call {m.first}</a> : null}
          {m.booking ? <a className="vw-btn" href={m.booking} target="_blank" rel="noopener noreferrer">Pick a time to talk</a> : null}
          {m.email ? <a className="vw-btn" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${v.title}`)}`}>Email {m.first}</a> : null}
        </div>
        {v.transcript ? (
          <details className="vw-words">
            <summary>Read what {m.first} says</summary>
            <p>{v.transcript}</p>
          </details>
        ) : null}
      </main>
      <footer className="vw-foot">
        <div className="vw-foot__in">
          <p>
            {m.name}{m.nmls ? `, NMLS #${m.nmls}` : ""}. {v.company.name}{v.company.nmls ? `, NMLS #${v.company.nmls}` : ""}{v.company.address ? `, ${v.company.address}` : ""}.{" "}
            Licensing: <a href="https://www.nmlsconsumeraccess.org" target="_blank" rel="noopener noreferrer">NMLS Consumer Access</a>.
          </p>
          <p className="vw-eho"><EqualHousingLogo size={20} label="Equal Housing Opportunity logo" /> Equal Housing Opportunity</p>
          <p>This video was made for you and isn&apos;t an offer to lend or a commitment. To stop texts, reply STOP to any text. <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
        </div>
      </footer>
    </div>
  );
}
