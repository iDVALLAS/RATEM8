import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { CHANNELS, contactStore, EVIDENCE, PURPOSES } from "@/lib/contacts/store";
import { canSee, summarize } from "@/lib/contacts/service";
import { gateFor, MAX_TEXT } from "@/lib/messaging/service";
import { touchStore } from "@/lib/messaging/store";
import { twilioConfig } from "@/lib/messaging/twilio";
import { conciergeStore } from "@/lib/concierge/store";
import { forgetAction, keepAction } from "../../concierge/actions";
import { gather } from "@/lib/scripts/generate";
import { scriptStore } from "@/lib/scripts/store";
import { GOAL_LABELS, GOALS } from "@/lib/scripts/signals";
import ScriptView from "../../scripts/ScriptView";
import { BuildButton } from "../../scripts/Buttons";
import { buildScriptAction } from "../../scripts/actions";
import { partnerUpdatesAction } from "../../automations/actions";
import Debrief from "./Debrief";
import { listenOn } from "@/lib/voice/google";
import { RELATIONSHIP_LABELS } from "@/lib/contacts/mapping";
import { formatPhone } from "@/lib/contacts/normalize";
import { usStateName } from "@/lib/us-states";
import { FlashBox, MloNav } from "../../MloChrome";
import { checkLineAction, consentAction, deleteContactAction, dncAction, rndAction, sendTextAction } from "../actions";
import "../../mlo.css";
import "../../scripts/scripts.css";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Contact", robots: { index: false, follow: false } };

const CHANNEL_LABELS = { call: "Calls from you", ai_call: "Calls from M8 (AI voice)", text: "Texts", email: "Email" } as const;
const PURPOSE_LABELS = { service: "About their loan or account", marketing: "Offers and check-ins" } as const;
const EVIDENCE_LABELS = { written: "Signed or written permission", recorded_call: "Said yes on a recorded call", web_form: "Web form or M8 chat checkbox", text_reply: "Texted back yes", attested: "Your word (from an import)", revoked: "Said no / stop" } as const;

const PROVENANCE_LABELS = { personal: "Your own relationship", own_closings: "Your own closed loan", prior_employer: "A previous employer's system", agent_partner: "Agent you work with", lead_vendor: "A lead vendor or web form", unknown: "Not sure" } as const;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }) : "");
const money = (n: number | null | undefined) => (n === null || n === undefined ? "" : `$${Math.round(n).toLocaleString("en-US")}`);

/** /mlo/contacts/[id] — one person: details, and permission by channel and purpose (D2). */
export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; script?: string }> }) {
  const [{ id }, { f, script: scriptId }] = await Promise.all([params, searchParams]);
  const v = await requireViewer();
  if (!v.user) notFound();
  const store = contactStore();
  const c = await store.get(id);
  if (!c || !canSee(v.user, c)) notFound();
  const log = await store.consents(c.id);
  const s = summarize(log);
  const pairs = CHANNELS.flatMap((ch) => PURPOSES.map((p) => [ch, p] as const));
  const decisions = await Promise.all(pairs.map(([ch, p]) => gateFor(v.user!, c, ch, p)));
  const gate = Object.fromEntries(CHANNELS.map((ch) => [ch, Object.fromEntries(PURPOSES.map((p) => [p, decisions[pairs.findIndex(([a, b]) => a === ch && b === p)]]))])) as Record<(typeof CHANNELS)[number], Record<(typeof PURPOSES)[number], (typeof decisions)[number]>>;
  const thread = await touchStore().forContact(c.id, 100);
  const texting = !!twilioConfig();
  const memory = await conciergeStore().memory(c.ownerUserId, c.id, new Date().toISOString(), { includePending: true });
  const tenant = listTenants()[0];
  // D9: possible needs and the latest call script.
  const [known, scripts, picked] = await Promise.all([gather(v.user, c, new Date()), scriptStore().forContact(v.user.id, c.id, 1), scriptId ? scriptStore().get(scriptId) : Promise.resolve(null)]);
  const shownScript = picked && picked.ownerUserId === v.user.id && picked.contactId === c.id ? picked : scripts[0] ?? null;
  const callStopped = s.call.service.evidence === "revoked" || s.call.marketing.evidence === "revoked";
  const signalGoals = known.signals.map((x) => x.goal);
  // D10: the client's own agents list, for "Updates to their agent".
  const agents = c.kind === "contact" ? (await store.list({ ownerUserId: c.ownerUserId, kind: "agent", limit: 500 })).contacts : [];
  const linkedAgent = c.partnerUpdates?.agentContactId ? agents.find((a) => a.id === c.partnerUpdates!.agentContactId) ?? null : null;
  const goalOptions = c.kind === "agent" ? (["partner"] as const) : [...new Set([...signalGoals, ...GOALS.filter((g) => g !== "auto" && g !== "partner")])];

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
              <tr>
                <th scope="row">Phone checks</th>
                <td>
                  {c.line ? `${c.line.type} line${c.line.carrier ? ` (${c.line.carrier})` : ""}, checked ${fmt(c.line.checkedAt)}` : "Line type not checked"}
                  {" · "}
                  {c.dnc ? `${c.dnc.onList ? "on a do-not-call list" : "not on do-not-call lists"} (${c.dnc.source}, ${fmt(c.dnc.checkedAt)})` : "Do-not-call not checked"}
                </td>
              </tr>
              <tr><th scope="row">Where it came from</th><td>{PROVENANCE_LABELS[c.provenance]}{c.locked ? " · on hold until you release your prior-employer lists" : ""}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="mlo-section" id="script">
          <h2>Call script</h2>
          {c.locked ? <p className="mlo-note">On hold: release the list they came from before you call.</p> : callStopped ? <p className="mlo-note">They asked not to be called, so there&apos;s no call script for them.</p> : (
            <>
              <div className="cs-builder">
                <p className="mlo-note">What they might need, from what you know:</p>
                <ul className="cs-signals">
                  {known.signals.slice(0, 5).map((x) => <li key={x.goal}><strong>{x.label}.</strong> {x.why}</li>)}
                </ul>
                <form action={buildScriptAction} className="mlo-grid">
                  <input type="hidden" name="contactId" value={c.id} />
                  <div className="mlo-grid mlo-grid--2">
                    <label className="mlo-field"><span>What this call is for</span>
                      <select name="goal" defaultValue="auto">
                        {c.kind === "agent" ? null : <option value="auto">{GOAL_LABELS.auto} ({known.signals[0]?.label ?? GOAL_LABELS.check_in})</option>}
                        {goalOptions.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}{signalGoals.includes(g) ? " ✓" : ""}</option>)}
                      </select>
                    </label>
                    <label className="mlo-field"><span>Anything you want from this call? (optional)</span><input name="ask" maxLength={400} placeholder="For example: find out if the kitchen project is still on" /></label>
                  </div>
                  <p className="mlo-note">✓ = a need the builder found for them.{c.kind === "agent" ? " Agent scripts are plain templates: production data from RETR can't be used with AI." : ""}</p>
                  <div><BuildButton /></div>
                </form>
              </div>
              {shownScript ? <ScriptView saved={shownScript} back={`/mlo/contacts/${c.id}?script=${shownScript.id}`} /> : null}
            </>
          )}
        </section>

        {c.kind === "contact" ? (
          <section className="mlo-section" id="partner">
            <h2>Updates to their agent</h2>
            <p className="mlo-note">
              {c.partnerUpdates?.allowed && linkedAgent
                ? `On: ${linkedAgent.firstName} ${linkedAgent.lastName} gets loan updates (recorded ${new Date(c.partnerUpdates.at).toLocaleDateString("en-US")}: “${c.partnerUpdates.proof}”).`
                : `Off. Their agent only hears how the loan is going if ${c.firstName || "they"} said so. Record it here when they do.`}
            </p>
            {v.user.id === c.ownerUserId ? (
              <form action={partnerUpdatesAction} className="mlo-grid">
                <input type="hidden" name="contactId" value={c.id} />
                <div className="mlo-grid mlo-grid--2">
                  <label className="mlo-field"><span>Their agent</span>
                    <select name="agentId" defaultValue={c.partnerUpdates?.agentContactId ?? ""}>
                      <option value="">Pick an agent</option>
                      {agents.map((a) => <option key={a.id} value={a.id}>{`${a.firstName} ${a.lastName}`.trim()}{a.agent?.brokerage ? ` · ${a.agent.brokerage}` : ""}</option>)}
                    </select>
                  </label>
                  <label className="mlo-field"><span>How they told you</span><input name="proof" maxLength={300} placeholder="Said yes by text, Nov 18" defaultValue={c.partnerUpdates?.allowed ? c.partnerUpdates.proof : ""} /></label>
                </div>
                <div className="mlo-row-form">
                  <button type="submit" name="allowed" value="yes" className="mlo-btn" style={{ marginTop: 0 }}>Their agent may get updates</button>
                  {c.partnerUpdates?.allowed ? <button type="submit" name="allowed" value="no" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Stop updates</button> : null}
                </div>
                {agents.length === 0 ? <p className="mlo-note">Import your agents first (Contacts → Import → Agents).</p> : null}
              </form>
            ) : null}
          </section>
        ) : null}

        {v.user.id === c.ownerUserId && c.kind === "contact" ? (
          <section className="mlo-section" id="debrief">
            <h2>After a call</h2>
            <Debrief contactId={c.id} micOn={listenOn()} />
          </section>
        ) : null}

        <section className="mlo-section" id="memory">
          <h2>What your Concierge remembers</h2>
          {memory.length === 0 ? (
            <p className="mlo-note">Nothing yet. It only remembers needs and plans {c.firstName || "they"} mention in their own words, and nothing is used until you keep it.</p>
          ) : (
            <table className="mlo-table mlo-table--plain">
              <tbody>
                {memory.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">{m.status === "pending" ? <span className="mlo-pill">Waiting for you</span> : null} {m.fact}<br /><span className="mlo-note">“{m.quote}” · {m.kind} · {new Date(m.createdAt).toLocaleDateString("en-US")}{m.expiresAt ? ` · forgets ${m.expiresAt.slice(0, 10)}` : ""}</span></th>
                    <td className="mlo-row-form">
                      {m.status === "pending" ? <form action={keepAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="contactId" value={c.id} /><button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Keep</button></form> : null}
                      <form action={forgetAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="contactId" value={c.id} /><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Forget</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mlo-section" id="conversation">
          <h2>Conversation</h2>
          {thread.length ? (
            <ol className="mlo-thread">
              {thread.map((t) => (
                <li key={t.id} className={`mlo-msg mlo-msg--${t.direction}`}>
                  <p style={{ whiteSpace: "pre-wrap" }}>{t.body}</p>
                  <span className="mlo-note">{t.direction === "in" ? "They texted" : t.channel === "call" ? `Call logged by ${t.actor}` : `Text from ${t.actor}`} · {new Date(t.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {t.status}{t.note && t.direction === "in" ? ` · ${t.note}` : ""}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mlo-note">No texts yet.</p>
          )}
          {!texting ? <p className="mlo-note">Texting turns on when the Twilio keys are in Vercel.</p> : null}
          <form action={sendTextAction} className="mlo-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="contactId" value={c.id} />
            <label className="mlo-field">
              <span>Text {c.firstName || "them"}</span>
              <textarea name="body" rows={3} maxLength={MAX_TEXT} className="mlo-textarea" required />
            </label>
            <div className="mlo-row-form">
              <select name="purpose" className="mlo-select" aria-label="What it's about" defaultValue="service">
                <option value="service">About their loan or account ({gate.text.service.allowed ? "allowed now" : "not now"})</option>
                <option value="marketing">An offer or check-in ({gate.text.marketing.allowed ? "allowed now" : "not now"})</option>
              </select>
              <button type="submit" className="mlo-btn" style={{ marginTop: 0 }} disabled={!texting}>Send text</button>
            </div>
            <p className="mlo-note">Your first text, and every offer, ends with who it&apos;s from and “Reply STOP to opt out.”</p>
          </form>
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

        <section className="mlo-section" id="permission">
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

        <section className="mlo-section">
          <h2 id="phone-checks">Phone checks</h2>
          <form action={checkLineAction} className="mlo-row-form">
            <input type="hidden" name="contactId" value={c.id} />
            <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} disabled={!c.phone}>Check line type (mobile or landline)</button>
          </form>
          <form action={dncAction} className="mlo-row-form" style={{ marginTop: 12 }}>
            <input type="hidden" name="contactId" value={c.id} />
            <select name="onList" className="mlo-select" aria-label="Do-not-call result" defaultValue="no">
              <option value="no">Not on do-not-call lists</option>
              <option value="yes">On a do-not-call list</option>
            </select>
            <input name="source" placeholder="Checked with (your DNC vendor or the registry)" className="mlo-input" style={{ flex: "1 1 240px" }} />
            <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Record check</button>
          </form>
          <p className="mlo-note">A check is good for 31 days. Marketing by phone needs one.</p>
          <form action={rndAction} className="mlo-row-form" style={{ marginTop: 12 }}>
            <input type="hidden" name="contactId" value={c.id} />
            <select name="result" className="mlo-select" aria-label="Reassigned Numbers Database result" defaultValue="no">
              <option value="no">Not disconnected since</option>
              <option value="yes">Disconnected since (may be someone else now)</option>
              <option value="no_data">No data for this number</option>
            </select>
            <label className="mlo-note">since <input type="date" name="since" className="mlo-input" defaultValue={c.rnd?.since ?? ""} required /></label>
            <input name="source" placeholder="Checked with (the FCC database or your vendor)" className="mlo-input" style={{ flex: "1 1 200px" }} />
            <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Record check</button>
          </form>
          <p className="mlo-note">{c.rnd ? `Reassigned Numbers Database: ${c.rnd.result === "yes" ? "disconnected" : c.rnd.result === "no" ? "not disconnected" : "no data"} since ${c.rnd.since} (${c.rnd.source}, checked ${fmt(c.rnd.checkedAt)}).` : "Reassigned Numbers Database: not checked."} Texts and M8 calls need a check when their permission or last message is more than 90 days old: check from that date. It&apos;s good for 30 days.</p>
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
