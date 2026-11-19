import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { consentWording, loadClient } from "@/lib/clientpage/service";
import { maskPhone } from "@/lib/clientpage/link";
import { loansForClient } from "@/lib/clientpage/loan";
import "./my.css";
import { forgetNoteAction, optInAction, stopAction } from "./actions";
import "../../mlo/mlo.css";
import { ensureRegistry } from "@/lib/registry/cache";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your page", robots: { index: false, follow: false } };

const how = (e: string | null) => ({ written: "signed", web_form: "online", text_reply: "by text", recorded_call: "on a recorded call", attested: "your loan officer's record", revoked: "you said stop" })[e ?? ""] ?? "";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "long", day: "numeric", year: "numeric" }) : "");

/** /my/[token] — a client's own page: who has their information, permission, stop, and what was noted (D26). */
export default async function ClientPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ m?: string; ok?: string }> }) {
  await ensureRegistry(); // D45: signed-up loan officers' records
  const [{ token }, { m, ok }] = await Promise.all([params, searchParams]);
  const v = await loadClient(token);
  if (!v) {
    return (
      <PageShell>
        <div className="mlo-wrap">
          <h1 className="tagline text-4xl">This link isn&apos;t working</h1>
          <section className="mlo-section"><p className="mlo-note">It may have been replaced with a new one. Ask your loan officer for a new link. To stop texts at any time, reply STOP to any text.</p></section>
        </div>
      </PageShell>
    );
  }
  const c = v.contact;
  const loans = await loansForClient(c.id, c.ownerUserId, v.mlo);
  const masked = maskPhone(c.phone);
  const row = (label: string, p: (typeof v.consent)["text"]) => {
    const say = (x: (typeof p)["service"]) => (x.evidence === "revoked" ? "You said stop" : x.granted ? `Yes (${how(x.evidence)}, ${day(x.at)})` : "No");
    return <tr key={label}><th scope="row">{label}</th><td>{say(p.service)}</td><td>{say(p.marketing)}</td></tr>;
  };
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">Your page</p>
        <h1 className="tagline text-4xl">{c.firstName ? `Hi, ${c.firstName}` : "Hi"}</h1>
        {m ? <div className={`mlo-flash ${ok === "1" ? "mlo-flash--ok" : "mlo-flash--err"}`} role={ok === "1" ? "status" : "alert"}><p>{m}</p></div> : null}

        {loans.map((l) => (
          <section key={l.id} className="mlo-section">
            <h2>Where&apos;s my loan?{l.purpose ? ` (${l.purpose.toLowerCase()})` : ""}</h2>
            <ol className="my-phases">
              {l.phases.map((p) => <li key={p.phase} className={`my-phase my-phase--${p.state}`}><span aria-hidden>{p.state === "done" ? "✓" : ""}</span>{p.label}<span className="sr-only">{p.state === "done" ? " (done)" : p.state === "now" ? " (now)" : " (next)"}</span></li>)}
            </ol>
            <p style={{ color: "var(--fg)", marginTop: 8 }}>{l.now}</p>
            {l.waiting.length || l.documents.length ? (
              <>
                <h3 className="my-sub">Waiting on you</h3>
                <ul className="my-list">
                  {l.waiting.map((w, i) => <li key={i}>{w}</li>)}
                  {l.documents.length ? <li>Upload {l.documents.length === 1 ? "this item" : `these ${l.documents.length} items`}{l.portal ? <> in <a href={l.portal} target="_blank" rel="noopener noreferrer">your secure portal</a></> : " in your secure portal"}: {l.documents.join("; ")}.</li> : null}
                </ul>
              </>
            ) : null}
            <p className="mlo-note" style={{ marginTop: 8 }}>Questions? Reply to any text from your loan officer{v.mlo?.phone ? `, or call ${v.mlo.phone}` : ""}. Timing depends on the lender, the appraisal and title, so your loan officer will confirm dates with you.</p>
          </section>
        ))}

        <section className="mlo-section">
          <h2>Who has your information</h2>
          <p className="mlo-note">
            {v.mlo ? `${v.mlo.name}, NMLS #${v.mlo.nmls}, your loan officer` : "Your loan officer"}{v.company ? ` at ${v.company}` : ""}. Your information is kept for your loan officer and isn&apos;t sold. Phone on file: {masked}.
          </p>
        </section>

        <section className="mlo-section">
          <h2>How you&apos;ve said they may contact you</h2>
          <table className="mlo-table">
            <thead><tr><th></th><th>About your loan</th><th>Check-ins and offers</th></tr></thead>
            <tbody>
              {row("Texts", v.consent.text)}
              {row("Calls", v.consent.call)}
              {row("Calls from an AI assistant", v.consent.ai_call)}
              {row("Email", v.consent.email)}
            </tbody>
          </table>
          <div className="mlo-row-form" style={{ marginTop: 10 }}>
            <form action={stopAction.bind(null, token, "phone")}><button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Stop texts and calls</button></form>
            <form action={stopAction.bind(null, token, "email")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Stop email</button></form>
          </div>
          <p className="mlo-note">Stopping works right away. You can also reply STOP to any text.</p>
        </section>

        {c.phone && !v.phoneStopped ? (
          <section className="mlo-section">
            <h2>Texts from your loan officer</h2>
            <form action={optInAction.bind(null, token)} className="mlo-grid">
              <label className="mlo-check"><input type="checkbox" name="service" defaultChecked={v.consent.text.service.granted} /> <span>Updates about my loan</span></label>
              <label className="mlo-check"><input type="checkbox" name="marketing" defaultChecked={v.consent.text.marketing.granted} /> <span>Occasional check-ins and offers</span></label>
              <label className="mlo-check"><input type="checkbox" name="agree" /> <span>{consentWording(v, masked)}</span></label>
              <div><button type="submit" className="mlo-btn">Save</button></div>
            </form>
          </section>
        ) : null}

        <section className="mlo-section">
          <h2>What was noted from what you said</h2>
          {v.notes.length === 0 ? <p className="mlo-note">Nothing. Your loan officer&apos;s assistant only notes plans you mention (like a remodel or a move), in your words, and only after your loan officer keeps them.</p> : (
            <table className="mlo-table mlo-table--plain">
              <tbody>
                {v.notes.map((n) => (
                  <tr key={n.id}>
                    <th scope="row">{n.fact}<br /><span className="mlo-note">From: “{n.quote}”{n.expiresAt ? ` · deleted on its own ${day(n.expiresAt)}` : ""}</span></th>
                    <td><form action={forgetNoteAction.bind(null, token, n.id)}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Delete</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </PageShell>
  );
}
