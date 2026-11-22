import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { requireViewer } from "@/lib/mlo/page-auth";
import { CHANNELS, contactStore, EVIDENCE, PURPOSES, type ConsentEntry } from "@/lib/contacts/store";
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
import { formatPhone, initialsOf } from "@/lib/contacts/normalize";
import { US_STATES, usStateName } from "@/lib/us-states";
import { FlashBox } from "../../MloChrome";
import { addNoteAction, approveHereAction, campaignAddAction, checkLineAction, consentAction, contactRepliedAction, deleteContactAction, dialAction, dncAction, draftClientLinkAction, mergeContactsAction, phoneStopAction, remindAction, rndAction, rotateClientLinkAction, sendEmailAction, sendTextAction, setTagsAction, skipHereAction, updateContactAction } from "../actions";
import ContactTags from "./ContactTags";
import { MAX_CONTACT_TAGS, tagHref } from "@/lib/contacts/tags";
import PhoneText from "./PhoneText";
import { emailReadyFor } from "@/lib/messaging/email";
import { campaignStore } from "@/lib/campaigns/store";
import { cardStore } from "@/lib/cards/store";
import { cardsOn } from "@/lib/cards/thanks";
import { noMailAction } from "../../cards/actions";
import { videoStore } from "@/lib/videos/store";
import { DEFAULT_NOTE, NOTE_MAX, videosOn } from "@/lib/videos/service";
import { sendVideoAction } from "../../videos/actions";
import { voicemailStore } from "@/lib/voicemail/store";
import { optOutLine, voicemailOn } from "@/lib/voicemail/service";
import { dropAction } from "../../voicemail/actions";
import { aiCallStore } from "@/lib/aicalls/store";
import { aiCallsOn } from "@/lib/aicalls/service";
import { aiCallAction } from "../aicall-actions";
import { clientLink } from "@/lib/clientpage/link";
import { contactPageCopy as cp } from "@/lib/content/contact-page";
import { permissionLine, reachBadge } from "@/lib/contacts/reach";
import { buildTimeline } from "@/lib/contacts/timeline";
import { relationshipsFor } from "@/lib/contacts/editing";
import { mergePreview, possibleMatches, REMIND_KINDS, remindTitle, searchBook } from "@/lib/contacts/manage";
import { nameOf } from "@/lib/contacts/merge";
import { Icon } from "@/app/mlo/icons";
import DetailSheet from "@/components/ui/DetailSheet";
import ContactTabs from "./ContactTabs";
import CallButton from "./CallButton";
import EditDetails from "./EditDetails";
import { LOAN_PROGRAMS, LOAN_PURPOSES, loanKind, OCCUPANCIES, PROPERTY_TYPES, RATE_TYPES, showRate } from "@/lib/contacts/loan";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { updateLoanAction } from "../actions";
import "../../mlo.css";
import "../../scripts/scripts.css";
import PageHead from "@/app/mlo/PageHead";
import { TechSteps } from "@/app/mlo/NotOnYet";
import { NOT_ON_YET } from "@/lib/content/cc-pages";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Contact", robots: { index: false, follow: false } };

const CHANNEL_LABELS = { call: "Calls from you", ai_call: "Recorded or AI-voice calls (voicemail drops, M8)", text: "Texts", email: "Email" } as const;
const PURPOSE_LABELS = { service: "About their loan or account", marketing: "Offers and check-ins" } as const;
const EVIDENCE_LABELS = { written: "Signed or written permission", recorded_call: "Said yes on a recorded call", web_form: "Web form or M8 chat checkbox", text_reply: "Texted back yes", attested: "Your word (from an import)", revoked: "Said no / stop", reset: cp.evidence.reset } as const;
const STATE_WORDS = { stop: "They said stop", none: cp.nothing, word: "Your word only", proof: "Permission on file" } as const;

const PROVENANCE_LABELS = { personal: "Your own relationship", own_closings: "Your own closed loan", prior_employer: "A previous employer's system", agent_partner: "Agent you work with", lead_vendor: "A lead vendor or web form", unknown: "Not sure" } as const;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }) : "");
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = (n: number | null | undefined) => (n === null || n === undefined ? "" : `$${Math.round(n).toLocaleString("en-US")}`);
const PHONE_CHANNELS = new Set(["call", "ai_call", "text"]);
const TABS = ["conversation", "details", "loan", "permission"] as const;
const SHOWN = 12;

/** /mlo/contacts/[id] — one person (D2; rebuilt in D77): who they are, how to reach them, and the record behind it. */
export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; script?: string; tab?: string; mq?: string; merge?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const v = await requireViewer();
  if (!v.user) notFound();
  const me = v.user;
  const store = contactStore();
  const c = await store.get(id);
  if (!c || !canSee(me, c)) notFound();
  const log = await store.consents(c.id);
  const s = summarize(log);
  const pairs = CHANNELS.flatMap((ch) => PURPOSES.map((p) => [ch, p] as const));
  const decisions = await Promise.all(pairs.map(([ch, p]) => gateFor(me, c, ch, p)));
  const gate = Object.fromEntries(CHANNELS.map((ch) => [ch, Object.fromEntries(PURPOSES.map((p) => [p, decisions[pairs.findIndex(([a, b]) => a === ch && b === p)]]))])) as Record<(typeof CHANNELS)[number], Record<(typeof PURPOSES)[number], (typeof decisions)[number]>>;
  const thread = await touchStore().forContact(c.id, 200);
  const texting = !!twilioConfig();
  const owner = me.id === c.ownerUserId;
  // D52: email goes from their own mailbox when connected.
  const [mail, inCampaigns, cards, myCampaigns] = await Promise.all([
    emailReadyFor(me),
    campaignStore().activeForContact(c.id).catch(() => []),
    cardsOn() ? cardStore().ordersForContact(c.id, 5).catch(() => []) : Promise.resolve([]),
    owner ? campaignStore().campaigns(me.id).catch(() => []) : Promise.resolve([]),
  ]);
  const campaignName = new Map(myCampaigns.map((x) => [x.id, x.name]));
  for (const e of inCampaigns) if (!campaignName.has(e.campaignId)) campaignName.set(e.campaignId, (await campaignStore().getCampaign(e.campaignId).catch(() => null))?.name ?? "Campaign");
  const running = myCampaigns.filter((x) => x.status === "active" && !inCampaigns.some((e) => e.campaignId === x.id));
  // D55: their video messages, and your videos ready to send.
  const [myVideos, theirVideos] = videosOn() ? await Promise.all([videoStore().videosFor(me.id, 50).catch(() => []), videoStore().sendsForContact(c.id, 10).catch(() => [])]) : [[], []];
  const readyVideos = myVideos.filter((x) => x.status === "ok");
  // D57 voicemails and D58 M8 loan-update calls.
  const m8Calls = aiCallsOn() ? await aiCallStore().forContact(c.id, 5).catch(() => []) : [];
  const [myVoicemails, theirDrops] = voicemailOn() ? await Promise.all([voicemailStore().voicemailsFor(me.id).catch(() => []), voicemailStore().dropsForContact(c.id, 5).catch(() => [])]) : [[], []];
  const memory = await conciergeStore().memory(c.ownerUserId, c.id, new Date().toISOString(), { includePending: true });
  // D77: the Concierge's pending suggestion for this person (the loan officer's own desk).
  const drafts = owner ? (await conciergeStore().proposals(me.id, "pending").catch(() => [])).filter((d) => d.contactId === c.id) : [];
  const clientUrl = clientLink(c.id, c.linkVersion ?? 0);
  // D9: possible needs and the latest call script.
  const [known, scripts, picked] = await Promise.all([gather(me, c, new Date()), scriptStore().forContact(me.id, c.id, 1), sp.script ? scriptStore().get(sp.script) : Promise.resolve(null)]);
  const shownScript = picked && picked.ownerUserId === me.id && picked.contactId === c.id ? picked : scripts[0] ?? null;
  const bookTags = await store.tagCounts(c.ownerUserId).catch(() => []);
  const callStopped = s.call.service.evidence === "revoked" || s.call.marketing.evidence === "revoked";
  const signalGoals = known.signals.map((x) => x.goal);
  // D10: the client's own agents list, for "Updates to their agent".
  const agents = c.kind === "contact" ? (await store.list({ ownerUserId: c.ownerUserId, kind: "agent", limit: 500 })).contacts : [];
  const linkedAgent = c.partnerUpdates?.agentContactId ? agents.find((a) => a.id === c.partnerUpdates!.agentContactId) ?? null : null;
  const goalOptions = c.kind === "agent" ? (["partner"] as const) : [...new Set([...signalGoals, ...GOALS.filter((g) => g !== "auto" && g !== "partner")])];
  // D77: merging. People who share a phone or email, a search, and the comparison for one picked record.
  const [maybe, found, preview] = await Promise.all([
    possibleMatches(me, c),
    sp.mq ? searchBook(me, c, sp.mq) : Promise.resolve([]),
    sp.merge && sp.merge !== c.id ? mergePreview(me, c.id, sp.merge) : Promise.resolve(null),
  ]);

  const name = nameOf(c);
  const first = c.firstName || "them";
  const reach = { summary: s, hasPhone: !!c.phone, hasEmail: !!c.email, locked: c.locked };
  const badge = reachBadge(reach);
  const callGate = gate.call.marketing.allowed ? gate.call.marketing : gate.call.service;
  const timeline = buildTimeline(thread, c.notes, inCampaigns.map((e) => ({ campaign: campaignName.get(e.campaignId) ?? "Campaign", log: e.log })));
  const mergedName = new Map((c.mergedFrom ?? []).map((m) => [m.id, m.name]));
  const shownPairs = c.phone ? pairs : pairs.filter(([ch]) => !PHONE_CHANNELS.has(ch));
  const initial = TABS.includes(sp.tab as (typeof TABS)[number]) ? sp.tab! : sp.merge || sp.mq ? "details" : sp.script ? "loan" : "conversation";
  const sub = [c.kind === "agent" ? c.agent?.brokerage || "Agent" : RELATIONSHIP_LABELS[c.relationship], [c.city, c.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const draft = drafts[0] ?? null;

  const conversation = (
    <>
      <section className="mlo-section cc-compose" id="conversation">
        <h2>{cp.compose.heading}</h2>
        {!c.phone ? (
          <p className="mlo-note">{cp.noPhone}</p>
        ) : texting ? (
          <form action={sendTextAction} className="mlo-grid" id="compose-text" data-focus="">
            <input type="hidden" name="contactId" value={c.id} />
            <label className="mlo-field">
              <span>{cp.compose.textLabel(first)}</span>
              <textarea name="body" rows={3} maxLength={MAX_TEXT} className="mlo-textarea" required />
            </label>
            <div className="mlo-row-form">
              <select name="purpose" className="mlo-select" aria-label="What it's about" defaultValue="service">
                <option value="service">About their loan or account ({gate.text.service.allowed ? "allowed now" : "not now"})</option>
                <option value="marketing">An offer or check-in ({gate.text.marketing.allowed ? "allowed now" : "not now"})</option>
              </select>
              <button type="submit" className="mlo-btn">Send text</button>
            </div>
            <p className="mlo-note">Your first text, and every offer, ends with who it&apos;s from and “Reply STOP to opt out.”</p>
          </form>
        ) : (
          // Texting from Command Center isn't on: the composer is "Text from my phone" (the same checks, then Messages opens).
          <div id="compose-text" data-focus="">
            <PhoneText contactId={c.id} first={c.firstName} maxLength={MAX_TEXT} serviceOk={gate.text.service.allowed} marketingOk={gate.text.marketing.allowed} />
          </div>
        )}
        {c.email ? (
          <details className="mlo-details" id="email">
            <summary>{cp.compose.emailFold(c.email)}</summary>
            <form action={sendEmailAction} className="mlo-grid" data-focus="">
              <input type="hidden" name="contactId" value={c.id} />
              <label className="mlo-field">
                <span>Subject</span>
                <input name="subject" className="mlo-input" maxLength={78} required />
              </label>
              <label className="mlo-field">
                <span>Message</span>
                <textarea name="body" rows={5} maxLength={4000} className="mlo-textarea" required />
                <span className="mlo-note">Your <Link href="/mlo/signature">email signature</Link> and the required footer are added under it.</span>
              </label>
              <div className="mlo-row-form">
                <select name="purpose" className="mlo-select" aria-label="What it's about" defaultValue="service">
                  <option value="service">About their loan or account ({gate.email.service.allowed ? "allowed now" : "not now"})</option>
                  <option value="marketing">An offer or check-in ({gate.email.marketing.allowed ? "allowed now" : "not now"})</option>
                </select>
                <button type="submit" className="mlo-btn" disabled={!mail.ready}>Send email</button>
              </div>
              <p className="mlo-note">
                {mail.reconnect ? <><Link href="/mlo/email">Reconnect your email</Link> to send. Nothing goes from another address meanwhile.</> : mail.via === "mailbox" ? `Sent from ${mail.from}; it lands in your Sent folder and replies come to you.` : mail.ready ? <>Sent in your name; replies come to your own inbox. <Link href="/mlo/email">Connect your own mailbox</Link> to send from your address.</> : <><Link href="/mlo/email">Connect your email</Link> to send.</>}{" "}
                Every email ends with your NMLS number, the company&apos;s name and address, and a one-click way to stop email.
              </p>
            </form>
          </details>
        ) : null}
        {owner && c.kind === "contact" ? (
          <details className="mlo-details" id="debrief">
            <summary>{cp.compose.noteFold}</summary>
            <div data-focus=""><Debrief contactId={c.id} micOn={listenOn("cc")} /></div>
          </details>
        ) : (
          <details className="mlo-details" id="note">
            <summary>{cp.compose.noteFold}</summary>
            <form action={addNoteAction.bind(null, c.id)} className="mlo-grid" data-focus="">
              <label className="mlo-field">
                <span>{cp.compose.noteLabel}</span>
                <textarea name="note" rows={3} maxLength={400} className="mlo-textarea" required />
              </label>
              <button type="submit" className="mlo-btn">{cp.compose.noteSave}</button>
            </form>
          </details>
        )}
        <details className="mlo-details" id="more">
          <summary>{cp.compose.moreFold}</summary>
          <div className="cc-moreways">
            {c.phone && texting ? <PhoneText contactId={c.id} first={c.firstName} maxLength={MAX_TEXT} serviceOk={gate.text.service.allowed} marketingOk={gate.text.marketing.allowed} /> : null}
            {c.phone ? (
              <form action={phoneStopAction.bind(null, c.id)} className="mlo-row-form">
                <button type="submit" className="mlo-btn mlo-btn--ghost">They asked to stop</button>
                <span className="mlo-note">They texted STOP or asked you to stop, on your own phone. Turns off texts and calls to this number in Command Center.</span>
              </form>
            ) : null}
            {inCampaigns.length ? (
              <form action={contactRepliedAction.bind(null, c.id)} className="mlo-row-form">
                <button type="submit" className="mlo-btn mlo-btn--ghost">They replied</button>
                <span className="mlo-note">In {inCampaigns.length} campaign{inCampaigns.length === 1 ? "" : "s"}. Answered an email or called back? This stops their follow-up campaigns (keep-in-touch ones carry on).</span>
              </form>
            ) : null}
            {cardsOn() ? (
              <div className="mlo-row-form" id="cards">
                {c.noMail ? (
                  <>
                    <span className="mlo-note">No cards by mail for them.</span>
                    <form action={noMailAction.bind(null, c.id, false)}><button type="submit" className="mlo-btn mlo-btn--ghost">Cards are OK again</button></form>
                  </>
                ) : (
                  <>
                    <Link className="mlo-btn mlo-btn--ghost" href={`/mlo/cards?c=${encodeURIComponent(c.id)}`}>Send a card</Link>
                    <form action={noMailAction.bind(null, c.id, true)}><button type="submit" className="mlo-btn mlo-btn--ghost">No cards by mail</button></form>
                  </>
                )}
                <span className="mlo-note">{cards.length ? `Cards: ${cards.map((o) => `${o.kind === "notecard" ? "notecard" : "postcard"} ${new Date(o.sentAt ?? o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}`).join(", ")}.` : c.street ? "No cards sent yet." : "Add a mailing address to send a card."}</span>
              </div>
            ) : null}
            {videosOn() ? (
              <div id="video">
                {readyVideos.length && (c.phone || c.email) ? (
                  <form action={sendVideoAction} className="mlo-grid">
                    <input type="hidden" name="contactId" value={c.id} />
                    <label className="mlo-field">
                      <span>Send {first} a video</span>
                      <select name="videoId" className="mlo-select" required>
                        {readyVideos.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                      </select>
                    </label>
                    <label className="mlo-field">
                      <span>Note with the link ({"{first}"} is their first name)</span>
                      <textarea name="note" rows={2} maxLength={NOTE_MAX} className="mlo-textarea" defaultValue={DEFAULT_NOTE} required />
                    </label>
                    <div className="mlo-row-form">
                      <select name="channel" className="mlo-select" aria-label="How to send it" defaultValue={c.phone && texting ? "text" : "email"}>
                        <option value="text" disabled={!c.phone || !texting}>By text</option>
                        <option value="email" disabled={!c.email || !mail.ready}>By email</option>
                      </select>
                      <select name="purpose" className="mlo-select" aria-label="What it's about" defaultValue="service">
                        <option value="service">About their loan or account</option>
                        <option value="marketing">An offer or check-in</option>
                      </select>
                      <button type="submit" className="mlo-btn">Send video</button>
                    </div>
                  </form>
                ) : (
                  <p className="mlo-note"><Link href="/mlo/videos">Record a video message</Link> to send {first} their own link.</p>
                )}
                {theirVideos.length ? <p className="mlo-note">Videos: {theirVideos.map((x) => `${new Date(x.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })} by ${x.channel}, ${x.views ? `watched ${x.views === 1 ? "once" : `${x.views} times`}` : "not watched yet"}`).join("; ")}.</p> : null}
              </div>
            ) : null}
            {voicemailOn() ? (
              <div id="voicemail">
                {myVoicemails.length && c.phone ? (
                  <form action={dropAction} className="mlo-row-form">
                    <input type="hidden" name="contactIds" value={c.id} />
                    <input type="hidden" name="back" value="contact" />
                    <select name="voicemailId" className="mlo-select" aria-label="Which voicemail">{myVoicemails.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
                    <select name="purpose" className="mlo-select" aria-label="What it's about" defaultValue="service">
                      <option value="service">About their loan ({gate.ai_call.service.allowed ? "allowed now" : "not now"})</option>
                      <option value="marketing" disabled={!optOutLine()}>An offer or check-in ({gate.ai_call.marketing.allowed ? "allowed now" : "not now"})</option>
                    </select>
                    <button type="submit" className="mlo-btn mlo-btn--ghost">Leave a voicemail</button>
                  </form>
                ) : (
                  <p className="mlo-note"><Link href="/mlo/voicemail">Record a voicemail</Link> to leave {first} a message without calling.</p>
                )}
                {theirDrops.length ? <p className="mlo-note">Voicemails: {theirDrops.map((d) => `${new Date(d.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })} ${d.status === "left" ? "left" : d.status === "answered" ? "answered" : d.status}${d.optedOut ? ", pressed 9 to stop" : ""}`).join("; ")}.</p> : null}
              </div>
            ) : null}
            {aiCallsOn() ? (
              <div id="m8-calls">
                <form action={aiCallAction.bind(null, c.id)} className="mlo-row-form">
                  <button type="submit" className="mlo-btn mlo-btn--ghost" disabled={!c.phone}>Have M8 call with a loan update</button>
                  <span className="mlo-note">An AI call ({gate.ai_call.service.allowed ? "allowed now" : "not now"}): needs their permission with proof (written, or a yes on a recorded call) and a loan in progress. M8 checks it&apos;s them first, says only what their own page says, and passes anything else to you.</span>
                </form>
                {m8Calls.map((k) => (
                  <details key={k.id} className="mlo-details">
                    <summary>M8 call {when(k.at)}: {k.status.replace("-", " ")}{k.outcome ? ` · ${k.outcome === "stop" ? "asked to stop" : k.outcome === "message" ? "left a message" : "wants a call back"}` : ""}</summary>
                    <ol className="mlo-note cc-turns">{k.turns.map((t, i) => <li key={i}><strong>{t.who === "m8" ? "M8" : c.firstName || "Client"}:</strong> {t.text}</li>)}</ol>
                  </details>
                ))}
              </div>
            ) : null}
            {!c.phone && !cardsOn() && !videosOn() && !voicemailOn() && !aiCallsOn() && !inCampaigns.length ? <p className="mlo-note">{cp.noPhone}</p> : null}
          </div>
        </details>
      </section>

      <section className="mlo-section" id="timeline">
        <h2>{cp.timeline.heading}</h2>
        {timeline.length ? (
          <>
            <TimelineList items={timeline.slice(0, SHOWN)} />
            {timeline.length > SHOWN ? (
              <details className="mlo-details">
                <summary>{cp.timeline.older(timeline.length - SHOWN)}</summary>
                <TimelineList items={timeline.slice(SHOWN)} />
              </details>
            ) : null}
          </>
        ) : (
          <p className="mlo-note">{cp.timeline.empty}</p>
        )}
      </section>
    </>
  );

  const details = (
    <>
      <section className="mlo-section" id="details">
        <h2>Details</h2>
        <EditDetails
          initial={{ firstName: c.firstName, lastName: c.lastName, phone: formatPhone(c.phone), phone2: formatPhone(c.phone2), email: c.email ?? "", street: c.street ?? "", city: c.city ?? "", state: c.state ?? "", zip: c.zip ?? "", relationship: c.relationship, leadSource: c.leadSource ?? "", referredBy: c.referredBy ?? "", notes: c.notes ?? "" }}
          relationships={relationshipsFor(c.kind).map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }))}
          states={US_STATES.map((x) => ({ code: x.code, name: x.name }))}
          agent={c.kind === "agent"}
          action={updateContactAction.bind(null, c.id)}
        >
          <dl className="cc-dl">
            <div><dt>Phone</dt><dd>{c.phone ? formatPhone(c.phone) : "None"}{c.phone2 ? ` · ${formatPhone(c.phone2)} (other)` : ""}</dd></div>
            <div><dt>Email</dt><dd>{c.email ?? "None"}</dd></div>
            <div><dt>Where</dt><dd>{[c.street, c.city, usStateName(c.state) ?? c.state, c.zip].filter(Boolean).join(", ") || "Not known"}</dd></div>
            <div><dt>Relationship</dt><dd>{RELATIONSHIP_LABELS[c.relationship]}</dd></div>
            {c.leadSource ? <div><dt>Lead source</dt><dd>{c.leadSource}</dd></div> : null}
            {c.referredBy ? <div><dt>Referred by</dt><dd>{c.referredBy}</dd></div> : null}
            {c.loan ? <div><dt>Their loan</dt><dd>{[c.loan.closedOn ? `closed ${c.loan.closedOn}` : "", loanKind(c.loan), money(c.loan.amount), c.loan.noteRate ? `${showRate(c.loan.noteRate)} note rate` : ""].filter(Boolean).join(" · ")}</dd></div> : null}
            {c.agent ? <div><dt>Production</dt><dd>{[c.agent.brokerage, c.agent.units !== null ? `${c.agent.units} units` : "", c.agent.volume !== null ? `${money(c.agent.volume)} volume` : "", c.agent.buyerUnits !== null ? `${c.agent.buyerUnits} buyer-side` : "", c.agent.listingUnits !== null ? `${c.agent.listingUnits} listings` : "", c.agent.topLender ? `usually works with ${c.agent.topLender}` : ""].filter(Boolean).join(" · ") || "Not known"}</dd></div> : null}
            {c.notes ? <div><dt>Notes</dt><dd className="cc-dl__pre">{c.notes}</dd></div> : null}
            <div><dt>Added</dt><dd>{fmt(c.createdAt)} · {c.source}</dd></div>
            <div><dt>Where it came from</dt><dd>{PROVENANCE_LABELS[c.provenance]}{c.locked ? " · on hold until you release your prior-employer lists" : ""}</dd></div>
            {c.mergedFrom?.length ? <div><dt>Merged in</dt><dd>{c.mergedFrom.map((m) => `${m.name} (${fmt(m.at)})`).join(", ")}</dd></div> : null}
          </dl>
        </EditDetails>
        <div className="cc-details__tags" id="tags">
          <h3>Tags</h3>
          <ContactTags initial={c.tags} suggestions={bookTags.map((t) => t.tag)} max={MAX_CONTACT_TAGS} action={setTagsAction.bind(null, c.id)} />
        </div>
      </section>

      <section className="mlo-section" id="merge">
        <h2>{cp.merge.fold}</h2>
        {preview && preview.ok ? (
          <div className="cc-merge">
            <h3>{cp.merge.heading(nameOf(preview.preview.drop))}</h3>
            <div className="cc-merge__pair">
              {[preview.preview.keep, preview.preview.drop].map((x, i) => (
                <div key={x.id} className="cc-card cc-merge__card">
                  <p className="cc-card__title">{i === 0 ? "This record" : <Link href={`/mlo/contacts/${x.id}`}>The other record</Link>}: {nameOf(x)}</p>
                  <p className="mlo-note">{[formatPhone(x.phone), x.email, [x.city, x.state].filter(Boolean).join(", "), RELATIONSHIP_LABELS[x.relationship]].filter(Boolean).join(" · ")}</p>
                  <p className="mlo-note">Added {fmt(x.createdAt)} · {x.tags.length} tag{x.tags.length === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>
            <h4 className="cc-merge__h">{cp.merge.outcome} (keeping this record)</h4>
            <ul className="cc-merge__out">
              {CHANNELS.map((ch) => (
                <li key={ch}>
                  <strong>{CHANNEL_LABELS[ch]}:</strong>{" "}
                  {PURPOSES.map((p) => {
                    const o = preview.preview.outcome.find((x) => x.channel === ch && x.purpose === p)!;
                    return `${PURPOSE_LABELS[p].toLowerCase()}: ${STATE_WORDS[o.state].toLowerCase()}`;
                  }).join("; ")}
                </li>
              ))}
            </ul>
            <p className="mlo-note">{cp.merge.moves}</p>
            <p className="mlo-note">{cp.merge.strict}</p>
            <form className="mlo-grid" action={mergeContactsAction.bind(null, c.id, preview.preview.drop.id, c.id)}>
              <label className="mlo-check">
                <input type="checkbox" name="same" value="yes" required />
                <span>{cp.merge.confirm}</span>
              </label>
              <div className="mlo-row-form">
                <button type="submit" className="mlo-btn">{cp.merge.keepThis(name)}</button>
                <button type="submit" formAction={mergeContactsAction.bind(null, preview.preview.drop.id, c.id, c.id)} className="mlo-btn mlo-btn--ghost">{cp.merge.keepOther(nameOf(preview.preview.drop))}</button>
                <Link href={`/mlo/contacts/${c.id}?tab=details#merge`} className="mlo-btn mlo-btn--ghost">{cp.merge.cancel}</Link>
              </div>
            </form>
          </div>
        ) : preview && !preview.ok ? (
          <div className="mlo-flash mlo-flash--err" role="alert">{cp.merge.refused[preview.error] ?? cp.merge.refused.gone}</div>
        ) : null}
        {maybe.length ? (
          <>
            <h3>{cp.merge.maybe}</h3>
            <p className="mlo-note">{cp.merge.maybeNote}</p>
            <PeopleRows people={maybe.filter((x) => x.id !== sp.merge)} self={c.id} />
          </>
        ) : null}
        <form method="get" action={`/mlo/contacts/${c.id}#merge`} className="mlo-row-form">
          <input type="hidden" name="tab" value="details" />
          <label className="mlo-field cc-grow">
            <span>{cp.merge.search}</span>
            <input name="mq" defaultValue={sp.mq ?? ""} placeholder={cp.merge.searchPlaceholder} maxLength={80} autoComplete="off" />
          </label>
          <button type="submit" className="mlo-btn mlo-btn--ghost">{cp.merge.find}</button>
        </form>
        {sp.mq ? found.length ? <PeopleRows people={found.filter((x) => x.id !== sp.merge)} self={c.id} /> : <p className="mlo-note">{cp.merge.noneFound}</p> : null}
      </section>

      {c.kind === "contact" && owner ? (
        <section className="mlo-section" id="their-page">
          <h2>Their own page</h2>
          {clientUrl ? (
            <>
              <p className="mlo-note">{c.firstName || "They"} can see who has their information and what permission is on file, stop texts or calls in one tap, give permission for texts themselves, and delete what your Concierge noted. It&apos;s a private link: share it only with them.</p>
              <code className="mlo-code cc-code-block">{clientUrl}</code>
              <div className="mlo-row-form">
                <form action={draftClientLinkAction.bind(null, c.id)}><button type="submit" className="mlo-btn">Draft a text with it</button></form>
                <form action={rotateClientLinkAction.bind(null, c.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Make a new link</button></form>
              </div>
            </>
          ) : (
            <>
              <p className="mlo-note">{NOT_ON_YET.clientpage.line}</p>
              <TechSteps owner={me.role === "owner"}><p className="mlo-note">Client pages turn on with CC_LINK_SECRET (Sensitive) or the database in Vercel.</p></TechSteps>
            </>
          )}
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
                    {m.status === "pending" ? <form action={keepAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="contactId" value={c.id} /><button type="submit" className="mlo-btn">Keep</button></form> : null}
                    <form action={forgetAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="contactId" value={c.id} /><button type="submit" className="mlo-btn mlo-btn--ghost">Forget</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );

  // D80: the loan's details (program, fixed or ARM, term, purpose, lender, the ARM's change), edited and checked here.
  const L = lc.loan;
  const lf = L.fields;
  const ln = c.loan;
  const loanRows: [string, string][] = ln
    ? ([
        [lf.closedOn, ln.closedOn ?? ""],
        [lf.amount, ln.amount ? money(ln.amount) : ""],
        [lf.noteRate, showRate(ln.noteRate)],
        [lf.program, ln.program ? L.programs[ln.program] : ""],
        [lf.rateType, ln.rateType ? L.rateTypes[ln.rateType] : ""],
        [lf.termMonths, ln.termMonths ? L.term(ln.termMonths) : ""],
        [lf.armFirstChange, ln.armFirstChange ?? ""],
        [lf.armMargin, ln.armMargin ? showRate(ln.armMargin) : ""],
        [lf.purpose, ln.purpose ? L.purposes[ln.purpose] : ""],
        [lf.occupancy, ln.occupancy ? L.occupancies[ln.occupancy] : ""],
        [lf.propertyType, ln.propertyType ? L.propertyTypes[ln.propertyType] : ""],
        [lf.lender, ln.lender ?? ""],
      ] as [string, string][]).filter(([, v]) => v)
    : [];
  const pick = (name: string, value: string | null | undefined, opts: readonly string[], labels: Record<string, string>) => (
    <select name={name} defaultValue={value ?? ""} className="mlo-select">
      <option value="">{L.notSet}</option>
      {opts.map((o) => <option key={o} value={o}>{labels[o]}</option>)}
    </select>
  );
  const loanDetails = c.kind === "contact" ? (
    <section className="mlo-section" id="loan-details">
      <h2>{L.heading}</h2>
      {loanRows.length ? (
        <dl className="cc-dl">
          {loanRows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      ) : <p className="mlo-note">{L.none}</p>}
      {ln?.noteRate ? <p className="mlo-note">{L.rateNote}</p> : null}
      {me.status === "active" ? (
        <details className="mlo-details">
          <summary>{L.edit}</summary>
          <form action={updateLoanAction.bind(null, c.id)} className="mlo-grid">
            <div className="mlo-grid mlo-grid--2">
              <label className="mlo-field"><span>{lf.closedOn}</span><input name="closedOn" type="date" defaultValue={ln?.closedOn ?? ""} /></label>
              <label className="mlo-field"><span>{lf.amount}</span><input name="amount" inputMode="numeric" defaultValue={ln?.amount ?? ""} placeholder="425000" autoComplete="off" /></label>
              <label className="mlo-field"><span>{lf.noteRate}</span><input name="noteRate" inputMode="decimal" defaultValue={ln?.noteRate ?? ""} placeholder="6.875" autoComplete="off" /></label>
              <label className="mlo-field"><span>{lf.program}</span>{pick("program", ln?.program, LOAN_PROGRAMS, L.programs)}</label>
              <label className="mlo-field"><span>{lf.rateType}</span>{pick("rateType", ln?.rateType, RATE_TYPES, L.rateTypes)}</label>
              <label className="mlo-field"><span>{lf.termMonths}</span><input name="termMonths" defaultValue={ln?.termMonths ?? ""} placeholder="360" autoComplete="off" /></label>
              <label className="mlo-field"><span>{lf.armFirstChange}</span><input name="armFirstChange" type="date" defaultValue={ln?.armFirstChange ?? ""} /></label>
              <label className="mlo-field"><span>{lf.armMargin}</span><input name="armMargin" inputMode="decimal" defaultValue={ln?.armMargin ?? ""} placeholder="2.75" autoComplete="off" /></label>
              <label className="mlo-field"><span>{lf.purpose}</span>{pick("purpose", ln?.purpose, LOAN_PURPOSES, L.purposes)}</label>
              <label className="mlo-field"><span>{lf.occupancy}</span>{pick("occupancy", ln?.occupancy, OCCUPANCIES, L.occupancies)}</label>
              <label className="mlo-field"><span>{lf.propertyType}</span>{pick("propertyType", ln?.propertyType, PROPERTY_TYPES, L.propertyTypes)}</label>
              <label className="mlo-field"><span>{lf.lender}</span><input name="lender" maxLength={120} defaultValue={ln?.lender ?? ""} autoComplete="off" /></label>
            </div>
            <div className="mlo-actions"><button type="submit" className="mlo-btn">{L.save}</button></div>
          </form>
        </details>
      ) : null}
    </section>
  ) : null;

  const loan = (
    <>
      {loanDetails}
      {c.kind === "contact" ? (
        <section className="mlo-section" id="partner">
          <h2>Updates to their agent</h2>
          <p className="mlo-note">
            {c.partnerUpdates?.allowed && linkedAgent
              ? `On: ${linkedAgent.firstName} ${linkedAgent.lastName} gets loan updates (recorded ${new Date(c.partnerUpdates.at).toLocaleDateString("en-US")}: “${c.partnerUpdates.proof}”).`
              : `Off. Their agent only hears how the loan is going if ${c.firstName || "they"} said so. Record it here when they do.`}
          </p>
          {owner ? (
            <form action={partnerUpdatesAction.bind(null, "yes")} className="mlo-grid">
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
                <button type="submit" formAction={partnerUpdatesAction.bind(null, "yes")} className="mlo-btn">Their agent may get updates</button>
                {c.partnerUpdates?.allowed ? <button type="submit" formAction={partnerUpdatesAction.bind(null, "no")} className="mlo-btn mlo-btn--ghost">Stop updates</button> : null}
              </div>
              {agents.length === 0 ? <p className="mlo-note">Import your agents first (Contacts → Import → Agents).</p> : null}
            </form>
          ) : null}
        </section>
      ) : null}
      <section className="mlo-section" id="script">
        <h2>Call script</h2>
        {c.locked ? <p className="mlo-note">On hold: release the list they came from before you call.</p> : callStopped ? <p className="mlo-note">They asked not to be called, so there&apos;s no call script for them.</p> : !c.phone ? <p className="mlo-note">{cp.noPhone}</p> : (
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
    </>
  );

  const permission = (
    <>
      <section className="mlo-section" id="can">
        <h2>What you can do right now</h2>
        {!c.phone ? <p className="cc-warnline">{cp.noPhone}</p> : null}
        <p className="mlo-note">Every text, call and email goes through these checks. When one says no, it says why.</p>
        <table className="mlo-table mlo-table--plain">
          <tbody>
            {shownPairs.map(([ch, p]) => {
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
            })}
          </tbody>
        </table>
      </section>

      <section className="mlo-section" id="permission">
        <h2>Permission to contact</h2>
        <p className="mlo-note">You can always call people you know yourself. M8 only texts or calls with permission on file, and AI calls and offers need proof, not just your word. A “stop” on calls or texts turns off every phone channel at once.</p>
        <table className="mlo-table mlo-table--plain">
          <tbody>
            {shownPairs.map(([ch, p]) => {
              const x = s[ch][p];
              return (
                <tr key={`${ch}-${p}`}>
                  <th scope="row">{CHANNEL_LABELS[ch]}<br /><span className="mlo-note">{PURPOSE_LABELS[p]}</span></th>
                  <td>
                    {x.evidence === "revoked" ? <span className="mlo-pill mlo-pill--off">Said no / stop</span> : x.granted && x.evidence ? <span className="mlo-pill">{EVIDENCE_LABELS[x.evidence]}</span> : <span className="mlo-pill mlo-pill--off">{cp.nothing}</span>}
                    {x.at ? <span className="mlo-note"> {fmt(x.at)}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <form action={consentAction} className="mlo-grid">
          <input type="hidden" name="contactId" value={c.id} />
          <div className="mlo-row-form">
            <select name="granted" className="mlo-select" aria-label="Yes or no" defaultValue="yes">
              <option value="yes">They said yes to</option>
              <option value="no">They said no / stop to</option>
            </select>
            <select name="channel" className="mlo-select" aria-label="Channel">{CHANNELS.filter((ch) => c.phone || !PHONE_CHANNELS.has(ch)).map((ch) => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}</select>
            <select name="purpose" className="mlo-select" aria-label="Purpose">{PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}</select>
            <select name="evidence" className="mlo-select" aria-label="How they told you">{EVIDENCE.filter((e) => e !== "revoked" && e !== "attested" && e !== "reset").map((e) => <option key={e} value={e}>{EVIDENCE_LABELS[e]}</option>)}</select>
          </div>
          <label className="mlo-field">
            <span>Where&apos;s the proof? (the form, the call recording, the message, the date)</span>
            <input name="proof" className="mlo-input" maxLength={500} />
          </label>
          <button type="submit" className="mlo-btn">Record it</button>
        </form>
        {log.length ? (
          <details className="mlo-details">
            <summary>History ({log.length})</summary>
            <ol className="cc-history">
              {[...log].sort((a, b) => b.at.localeCompare(a.at)).map((e, i) => <HistoryRow key={i} e={e} from={e.mergedFrom ? mergedName.get(e.mergedFrom) ?? "another" : null} />)}
            </ol>
          </details>
        ) : null}
      </section>

      <section className="mlo-section">
        <h2 id="phone-checks">Phone checks</h2>
        {!c.phone ? <p className="mlo-note">{cp.noPhone}</p> : (
          <>
            <p className="mlo-note">
              {c.line ? `${c.line.type} line${c.line.carrier ? ` (${c.line.carrier})` : ""}, checked ${fmt(c.line.checkedAt)}` : "Line type not checked"}
              {" · "}
              {c.dnc ? `${c.dnc.onList ? "on a do-not-call list" : "not on do-not-call lists"} (${c.dnc.source}, ${fmt(c.dnc.checkedAt)})` : "Do-not-call not checked"}
            </p>
            <form action={checkLineAction} className="mlo-row-form">
              <input type="hidden" name="contactId" value={c.id} />
              <button type="submit" className="mlo-btn mlo-btn--ghost">Check line type (mobile or landline)</button>
            </form>
            <form action={dncAction} className="mlo-row-form mlo-actions">
              <input type="hidden" name="contactId" value={c.id} />
              <select name="onList" className="mlo-select" aria-label="Do-not-call result" defaultValue="no">
                <option value="no">Not on do-not-call lists</option>
                <option value="yes">On a do-not-call list</option>
              </select>
              <input name="source" placeholder="Checked with (your DNC vendor or the registry)" aria-label="Checked with" className="mlo-input cc-grow" />
              <button type="submit" className="mlo-btn">Record check</button>
            </form>
            <p className="mlo-note">A check is good for 31 days. Marketing by phone needs one.</p>
            <form action={rndAction} className="mlo-row-form mlo-actions">
              <input type="hidden" name="contactId" value={c.id} />
              <select name="result" className="mlo-select" aria-label="Reassigned Numbers Database result" defaultValue="no">
                <option value="no">Not disconnected since</option>
                <option value="yes">Disconnected since (may be someone else now)</option>
                <option value="no_data">No data for this number</option>
              </select>
              <label className="mlo-note">since <input type="date" name="since" className="mlo-input" defaultValue={c.rnd?.since ?? ""} required /></label>
              <input name="source" placeholder="Checked with (the FCC database or your vendor)" aria-label="Checked with" className="mlo-input cc-grow" />
              <button type="submit" className="mlo-btn">Record check</button>
            </form>
            <p className="mlo-note">{c.rnd ? `Reassigned Numbers Database: ${c.rnd.result === "yes" ? "disconnected" : c.rnd.result === "no" ? "not disconnected" : "no data"} since ${c.rnd.since} (${c.rnd.source}, checked ${fmt(c.rnd.checkedAt)}).` : "Reassigned Numbers Database: not checked."} Texts and M8 calls need a check when their permission or last message is more than 90 days old: check from that date. It&apos;s good for 30 days.</p>
          </>
        )}
      </section>

      {me.role !== "assistant" ? (
        <form action={deleteContactAction} className="mlo-section" id="delete">
          <input type="hidden" name="contactId" value={c.id} />
          <p className="mlo-note">Deleting removes this person and their permission history from Command Center. It doesn&apos;t touch loan files in your loan system. If they&apos;re a duplicate, merge them instead (Details → Merge with…): nothing is lost.</p>
          <button type="submit" className="mlo-btn mlo-btn--ghost">Delete contact</button>
        </form>
      ) : null}
    </>
  );

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="contacts" eyebrow={<Link href={c.kind === "agent" ? "/mlo/contacts?kind=agent" : "/mlo/contacts"}>← {c.kind === "agent" ? "Agents" : "Contacts"}</Link>} title={name} sub={sub || undefined} />
        <FlashBox flash={decodeFlash(sp.f)} />

        <section className="cc-contact-head" aria-label={cp.lineLabel}>
          <span className="cc-initials" aria-hidden="true">{initialsOf(c.firstName, c.lastName, c.email ?? "")}</span>
          <div className="cc-contact-head__main">
            <p className="cc-contact-head__line"><span className={`cc-reach cc-reach--${badge.tone}`}>{badge.label}</span> {permissionLine(reach).join(" · ")}</p>
            {c.tags.length ? (
              <ul className="cc-tags" aria-label="Tags">
                {c.tags.slice(0, 8).map((t) => <li key={t}><Link className="cc-tag cc-tag--sm" href={tagHref(t, c.kind)}>{t}</Link></li>)}
                {c.tags.length > 8 ? <li><a className="cc-tag cc-tag--sm cc-tag--more" href="#tags">+{c.tags.length - 8}</a></li> : null}
              </ul>
            ) : null}
          </div>
        </section>

        <nav className="cc-contact-actions" aria-label={cp.actions.label}>
          {c.phone && callGate.allowed ? (
            <CallButton tel={c.phone} label={cp.actions.call} action={dialAction.bind(null, c.id)} />
          ) : (
            <button type="button" className="cc-act" disabled title={cp.actions.callOff(c.phone ? callGate.reasons[0] ?? "" : cp.line.noPhone)}><Icon name="phone" /><span>{cp.actions.call}</span></button>
          )}
          {c.phone ? <a className="cc-act" href="#compose-text"><Icon name="message" /><span>{cp.actions.text}</span></a> : <button type="button" className="cc-act" disabled><Icon name="message" /><span>{cp.actions.text}</span></button>}
          {c.email ? <a className="cc-act" href="#email"><Icon name="mail" /><span>{cp.actions.email}</span></a> : <button type="button" className="cc-act" disabled><Icon name="mail" /><span>{cp.actions.email}</span></button>}
          <a className="cc-act" href={owner && c.kind === "contact" ? "#debrief" : "#note"}><Icon name="pen" /><span>{cp.actions.note}</span></a>
          <DetailSheet label={cp.actions.remind} title={cp.remind.heading} className="cc-dsheet" buttonClassName="cc-act" buttonContent={<><Icon name="clock" /><span className="cc-l">{cp.actions.remind}</span><span className="cc-s" aria-hidden="true">{cp.actions.remindShort}</span></>}>
            <form action={remindAction.bind(null, c.id)} className="mlo-grid">
              <label className="mlo-field"><span>{cp.remind.what}</span>
                <select name="what" defaultValue="call">{REMIND_KINDS.map((k) => <option key={k} value={k}>{remindTitle(k, c.firstName)}</option>)}</select>
              </label>
              <label className="mlo-field"><span>{cp.remind.when}</span>
                <select name="when" defaultValue="7">{cp.remind.whenOptions.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}</select>
              </label>
              <button type="submit" className="mlo-btn">{cp.remind.save}</button>
            </form>
          </DetailSheet>
          <DetailSheet label={cp.actions.campaign} title={cp.campaign.heading} className="cc-dsheet" buttonClassName="cc-act" buttonContent={<><Icon name="send" /><span className="cc-l">{cp.actions.campaign}</span><span className="cc-s" aria-hidden="true">{cp.actions.campaignShort}</span></>}>
            {inCampaigns.length ? <p className="mlo-note">{cp.campaign.inNow(inCampaigns.map((e) => `“${campaignName.get(e.campaignId)}”`).join(", "))}</p> : null}
            {owner && running.length ? (
              <form action={campaignAddAction.bind(null, c.id)} className="mlo-grid">
                <label className="mlo-field"><span>{cp.campaign.pick}</span>
                  <select name="campaignId">{running.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                </label>
                <p className="mlo-note">{cp.campaign.note}</p>
                <button type="submit" className="mlo-btn">{cp.campaign.add}</button>
              </form>
            ) : (
              <>
                <p className="mlo-note">{cp.campaign.none}</p>
                <Link href="/mlo/campaigns?new=1" className="mlo-btn mlo-btn--ghost">{cp.campaign.start}</Link>
              </>
            )}
          </DetailSheet>
        </nav>

        {draft ? (
          <section className="cc-card cc-suggest" aria-label={cp.suggestion.heading}>
            <p className="cc-card__title">{cp.suggestion.heading} · {draft.purpose === "service" ? "about their loan" : "a check-in"}</p>
            <p className="mlo-note">{cp.suggestion.why(draft.why)}</p>
            {!draft.gate.allowed ? <p className="mlo-note">{cp.suggestion.held(draft.gate.reason ?? "")}</p> : null}
            <form action={approveHereAction.bind(null, c.id)} className="mlo-grid">
              <input type="hidden" name="id" value={draft.id} />
              <blockquote className="cc-draft__body">{draft.body}</blockquote>
              <details className="mlo-details">
                <summary>{cp.suggestion.edit}</summary>
                <textarea name="body" defaultValue={draft.body} rows={3} maxLength={640} className="mlo-textarea" aria-label="Draft" />
              </details>
              <div className="mlo-row-form">
                <button type="submit" className="mlo-btn">{cp.suggestion.approve}</button>
                <button type="submit" formAction={skipHereAction.bind(null, c.id)} formNoValidate className="mlo-btn mlo-btn--ghost">{cp.suggestion.skip}</button>
              </div>
            </form>
            {drafts.length > 1 ? <p className="mlo-note">{cp.suggestion.more(drafts.length - 1)} <Link href="/mlo/concierge#drafts">Open your desk</Link></p> : null}
          </section>
        ) : null}

        <ContactTabs
          label={cp.tabs.label}
          initial={initial}
          tabs={[
            { id: "conversation", label: cp.tabs.conversation, content: conversation },
            { id: "details", label: cp.tabs.details, content: details },
            { id: "loan", label: c.kind === "agent" ? cp.tabs.agentLoan : cp.tabs.loan, short: c.kind === "agent" ? undefined : cp.tabs.loanShort, content: loan },
            { id: "permission", label: cp.tabs.permission, content: permission },
          ]}
        />
      </div>
    </PageShell>
  );
}

function TimelineList({ items }: { items: ReturnType<typeof buildTimeline> }) {
  return (
    <ol className="cc-timeline">
      {items.map((t) => (
        <li key={t.id} className={`cc-tl cc-tl--${t.kind}`}>
          <p className="cc-tl__head"><span className="cc-tl__title">{t.title}</span> <time dateTime={t.at}>{t.kind === "note" ? new Date(t.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : when(t.at)}</time></p>
          <p className="cc-tl__body">{t.body}</p>
          {t.meta ? <p className="mlo-note">{t.meta}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function PeopleRows({ people, self }: { people: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; city: string | null; state: string | null }[]; self: string }) {
  if (!people.length) return null;
  return (
    <ul className="cc-list cc-merge__list">
      {people.map((x) => (
        <li key={x.id} className="cc-row">
          <span className="cc-initials cc-initials--sm" aria-hidden="true">{initialsOf(x.firstName, x.lastName, x.email ?? "")}</span>
          <div>
            <p className="cc-row__title">{nameOf(x)}</p>
            <p className="cc-row__why">{[formatPhone(x.phone), x.email, [x.city, x.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
          </div>
          <Link className="cc-row__go" href={`/mlo/contacts/${self}?tab=details&merge=${encodeURIComponent(x.id)}#merge`}>{cp.merge.pick}</Link>
        </li>
      ))}
    </ul>
  );
}

function HistoryRow({ e, from }: { e: ConsentEntry; from: string | null }) {
  return (
    <li className="cc-history__row">
      <span className="cc-history__when">{fmt(e.at)}</span>
      <span>{e.evidence === "reset" ? cp.nothing : e.granted ? "Yes" : "No"} · {CHANNEL_LABELS[e.channel]} · {PURPOSE_LABELS[e.purpose]}</span>
      <span className="mlo-note">{EVIDENCE_LABELS[e.evidence]} · {e.proof} · {e.actor}{from ? ` · ${cp.history.merged(from)}` : ""}</span>
    </li>
  );
}
