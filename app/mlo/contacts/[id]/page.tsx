import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { CHANNELS, contactStore, EVIDENCE, PURPOSES } from "@/lib/contacts/store";
import { canSee, summarize } from "@/lib/contacts/service";
import { decisionsFor } from "@/lib/send-gate/for-contact";
import { RELATIONSHIP_LABELS } from "@/lib/contacts/mapping";
import { formatPhone } from "@/lib/contacts/normalize";
import { usStateName } from "@/lib/us-states";
import { FlashBox, MloNav } from "../../MloChrome";
import { consentAction, deleteContactAction } from "../actions";
import "../../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact", robots: { index: false, follow: false } };

const CHANNEL_LABELS = { call: "Calls from you", ai_call: "Calls from M8 (AI voice)", text: "Texts", email: "Email" } as const;
const PURPOSE_LABELS = { service: "About their loan or account", marketing: "Offers and check-ins" } as const;
const EVIDENCE_LABELS = { written: "Signed or written permission", recorded_call: "Said yes on a recorded call", web_form: "Web form or M8 chat checkbox", text_reply: "Texted back yes", attested: "Your word (from an import)", revoked: "Said no / stop" } as const;

const PROVENANCE_LABELS = { personal: "Your own relationship", own_closings: "Your own closed loan", prior_employer: "A previous employer's system", agent_partner: "Agent you work with", unknown: "Not sure" } as const;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }) : "");
const money = (n: number | null | undefined) => (n === null || n === undefined ? "" : `$${Math.round(n).toLocaleString("en-US")}`);

/** /mlo/contacts/[id] — one person: details, and permission by channel and purpose (D2). */
export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string }> }) {
  const [{ id }, { f }] = await Promise.all([params, searchParams]);
  const v = await requireViewer();
  if (!v.user) notFound();
  const store = contactStore();
  const c = await store.get(id);
  if (!c || !canSee(v.user, c)) notFound();
  const log = await store.consents(c.id);
  const s = summarize(log);
  const gate = decisionsFor(v.user, c, s);
  const tenant = listTenants()[0];

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow"><Link href={c.kind === "agent" ? "/mlo/contacts?kind=agent" : "/mlo/contacts"}>← {c.kind === "agent" ? "Agents" : "Contacts"}</Link></p>
        <h1 className="tagline text-4xl">{`${c.firstName} ${c.lastName}`.trim() || c.email}</h1>
        <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn />
        <FlashBox flash={decodeFlash(f)} />

        <section className="mlo-section">
          <h2>Details</h2>
          <table className="mlo-table">
            <tbody>
              <tr><th scope="row">Phone</th><td>{formatPhone(c.phone)}{c.phone2 ? ` · ${formatPhone(c.phone2)}` : ""}</td></tr>
              <tr><th scope="row">Email</th><td>{c.email ?? ""}</td></tr>
              <tr><th scope="row">Where</th><td>{[c.street, c.city, usStateName(c.state) ?? c.state, c.zip].filter(Boolean).join(", ")}</td></tr>
              <tr><th scope="row">Relationship</th><td>{RELATIONSHIP_LABELS[c.relationship]}</td></tr>
              {c.tags.length ? <tr><th scope="row">Tags</th><td>{c.tags.join(", ")}</td></tr> : null}
              {c.loan ? <tr><th scope="row">Their loan</th><td>{[c.loan.closedOn ? `closed ${c.loan.closedOn}` : "", money(c.loan.amount), c.loan.noteRate ? `${c.loan.noteRate}% note rate` : ""].filter(Boolean).join(" · ")}</td></tr> : null}
              {c.agent ? (
                <tr>
                  <th scope="row">Production</th>
                  <td>{[c.agent.brokerage, c.agent.units !== null ? `${c.agent.units} units` : "", c.agent.volume !== null ? `${money(c.agent.volume)} volume` : "", c.agent.buyerUnits !== null ? `${c.agent.buyerUnits} buyer-side` : "", c.agent.listingUnits !== null ? `${c.agent.listingUnits} listings` : "", c.agent.topLender ? `usually works with ${c.agent.topLender}` : ""].filter(Boolean).join(" · ")}</td>
                </tr>
              ) : null}
              {c.notes ? <tr><th scope="row">Notes</th><td style={{ whiteSpace: "pre-wrap" }}>{c.notes}</td></tr> : null}
              <tr><th scope="row">Added</th><td>{fmt(c.createdAt)} · {c.source}</td></tr>
              <tr><th scope="row">Where it came from</th><td>{PROVENANCE_LABELS[c.provenance]}{c.locked ? " · on hold until you release your prior-employer lists" : ""}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="mlo-section">
          <h2>What you can do right now</h2>
          <p className="mlo-note">Every text, call and email goes through these checks. When one says no, it says why.</p>
          <table className="mlo-table mlo-table--plain">
            <tbody>
              {CHANNELS.map((ch) =>
                PURPOSES.map((p) => {
                  const d = gate[ch][p];
                  return (
                    <tr key={`g-${ch}-${p}`}>
                      <th scope="row">{CHANNEL_LABELS[ch]}<br /><span className="mlo-note">{PURPOSE_LABELS[p]}</span></th>
                      <td>
                        <span className={`mlo-pill ${d.allowed ? "" : "mlo-pill--off"}`}>{d.allowed ? "Yes" : "Not now"}</span>{" "}
                        <span className="mlo-note">{d.allowed ? d.basis : d.reasons[0]}{d.recordingNotice ? " Say the call is recorded first." : ""}</span>
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </section>

        <section className="mlo-section">
          <h2>Permission to contact</h2>
          <p className="mlo-note">You can always call people you know yourself. M8 only texts or calls with permission on file, and AI calls and offers need proof, not just your word. A “stop” on calls or texts turns off every phone channel at once.</p>
          <table className="mlo-table mlo-table--plain">
            <tbody>
              {CHANNELS.map((ch) =>
                PURPOSES.map((p) => {
                  const x = s[ch][p];
                  return (
                    <tr key={`${ch}-${p}`}>
                      <th scope="row">{CHANNEL_LABELS[ch]}<br /><span className="mlo-note">{PURPOSE_LABELS[p]}</span></th>
                      <td>
                        {x.evidence ? (
                          <span className={`mlo-pill ${x.granted ? "" : "mlo-pill--off"}`}>{x.granted ? EVIDENCE_LABELS[x.evidence] : "Said no / stop"}</span>
                        ) : (
                          <span className="mlo-pill mlo-pill--off">Nothing on file</span>
                        )}
                        {x.at ? <span className="mlo-note"> {fmt(x.at)}</span> : null}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
          <form action={consentAction} className="mlo-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="contactId" value={c.id} />
            <div className="mlo-row-form">
              <select name="granted" className="mlo-select" aria-label="Yes or no" defaultValue="yes">
                <option value="yes">They said yes to</option>
                <option value="no">They said no / stop to</option>
              </select>
              <select name="channel" className="mlo-select" aria-label="Channel">{CHANNELS.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}</select>
              <select name="purpose" className="mlo-select" aria-label="Purpose">{PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}</select>
              <select name="evidence" className="mlo-select" aria-label="How they told you">{EVIDENCE.filter((e) => e !== "revoked" && e !== "attested").map((e) => <option key={e} value={e}>{EVIDENCE_LABELS[e]}</option>)}</select>
            </div>
            <label className="mlo-field">
              <span>Where&apos;s the proof? (the form, the call recording, the message, the date)</span>
              <input name="proof" className="mlo-input" maxLength={500} />
            </label>
            <button type="submit" className="mlo-btn">Record it</button>
          </form>
          {log.length ? (
            <details style={{ marginTop: 12 }}>
              <summary className="mlo-note">History ({log.length})</summary>
              <table className="mlo-table">
                <tbody>
                  {[...log].reverse().map((e, i) => (
                    <tr key={i}>
                      <th scope="row">{fmt(e.at)}</th>
                      <td>{e.granted ? "Yes" : "No"} · {CHANNEL_LABELS[e.channel]} · {PURPOSE_LABELS[e.purpose]}</td>
                      <td>{EVIDENCE_LABELS[e.evidence]} · {e.proof} · {e.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </section>

        {v.user.role !== "assistant" ? (
          <form action={deleteContactAction} className="mlo-section">
            <input type="hidden" name="contactId" value={c.id} />
            <p className="mlo-note">Deleting removes this person and their permission history from Command Center. It doesn&apos;t touch loan files in your loan system.</p>
            <button type="submit" className="mlo-btn mlo-btn--ghost">Delete contact</button>
          </form>
        ) : null}
      </div>
    </PageShell>
  );
}
