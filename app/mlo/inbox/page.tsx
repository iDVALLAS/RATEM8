import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import type { User } from "@/lib/accounts/store";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { touchStore } from "@/lib/messaging/store";
import { textingReadyFor } from "@/lib/texting/ready";
import { twilioConfig } from "@/lib/messaging/twilio";
import { gateFor, MAX_TEXT } from "@/lib/messaging/service";
import { emailReadyFor } from "@/lib/messaging/email";
import { SUBS } from "@/lib/content/cc-pages";
import { inboxCopy as ic } from "@/lib/content/inbox";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { canSee, summarize } from "@/lib/contacts/service";
import { permissionLine, reachBadge } from "@/lib/contacts/reach";
import { buildTimeline } from "@/lib/contacts/timeline";
import { RELATIONSHIP_LABELS } from "@/lib/contacts/mapping";
import { formatPhone, initialsOf } from "@/lib/contacts/normalize";
import { nameOf } from "@/lib/contacts/merge";
import { conciergeStore } from "@/lib/concierge/store";
import { inboxThreads, type InboxThread } from "@/lib/inbox/service";
import { INBOX_TABS, inTab, shortWhen, tabOf, whenIn, zoneLabel, type InboxTab, type ThreadState } from "@/lib/inbox/state";
import { zoneFor } from "@/lib/profile/prefs";
import PageHead from "../PageHead";
import NotOnYet from "../NotOnYet";
import { FlashBox, MloNav } from "../MloChrome";
import PhoneText from "../contacts/[id]/PhoneText";
import { approveDraftAction, doneAction, draftReplyAction, notDoneAction, replyEmailAction, replyTextAction, skipDraftAction, snoozeAction, unsnoozeAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox", robots: { index: false, follow: false } };

const PILL: Record<ThreadState, string> = { needs: "cc-ibx-pill cc-ibx-pill--needs", sent: "cc-ibx-pill", done: "cc-ibx-pill", snoozed: "cc-ibx-pill", stopped: "cc-ibx-pill cc-ibx-pill--stop" };

/**
 * /mlo/inbox — every conversation, and a reply box (D4, rebuilt in D79).
 * Desktop: the conversations on the left, the one you picked on the right
 * with its reply box and a slim card about the person. Phones: the list,
 * and a conversation opens full screen (?c=). Tabs: Needs reply / All /
 * Done. Times are in the loan officer's own time zone.
 */
export default async function Inbox({ searchParams }: { searchParams: Promise<{ tab?: string; c?: string; f?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const now = new Date();
  const tab = tabOf(sp.tab);
  const all = me ? await inboxThreads(me, now) : [];
  const zone = me ? await zoneFor(me) : "America/Los_Angeles";
  const shown = all.filter((t) => inTab(t.state, tab));
  const counts = Object.fromEntries(INBOX_TABS.map((k) => [k, all.filter((t) => inTab(t.state, k)).length])) as Record<InboxTab, number>;
  const texting = me ? await textingReadyFor(me).catch(() => false) : !!twilioConfig();
  const owner = me?.role === "owner";
  // The conversation open on the right: the one asked for (if it's in the book), else the first in this tab.
  const asked = me && sp.c && /^c_[A-Za-z0-9_-]{6,40}$/.test(sp.c) ? await contactStore().get(sp.c) : null;
  const open = asked && me && canSee(me, asked) ? asked : shown[0]?.contact ?? null;
  const openThread = open ? all.find((t) => t.contact.id === open.id) ?? null : null;

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="inbox" title={ic.title} sub={SUBS.inbox} />
        <MloNav current="inbox" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        {me && !texting ? (
          <NotOnYet what="texting" icon="message" owner={owner}>
            <p className="mlo-note">{twilioConfig() ? "The platform's Twilio keys are set, but this company has no Messaging Service yet: approve its registration on Texting setup, or set its Messaging Service by hand there." : "Add TWILIO_ACCOUNT_SID (not Sensitive) and TWILIO_AUTH_TOKEN (Sensitive) in Vercel, redeploy, then set up each company's Messaging Service on Texting setup."} <Link href="/mlo/texting">Open Texting setup</Link>.</p>
          </NotOnYet>
        ) : null}
        <FlashBox flash={decodeFlash(sp.f)} />
        {!me ? (
          <section className="mlo-section">
            <p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your conversations.</p>
          </section>
        ) : (
          <>
            <nav className="cc-tabs-inline cc-ibx-tabs" aria-label={ic.tabs.label}>
              {INBOX_TABS.map((k) => (
                <Link key={k} href={`/mlo/inbox?tab=${k}`} aria-current={k === tab ? "page" : undefined}>
                  {ic.tabs[k]}{k !== "all" ? ` (${counts[k]})` : ""}
                </Link>
              ))}
            </nav>
            <div className="cc-ibx" data-open={sp.c && open ? "1" : "0"}>
              <section className="cc-ibx__list" aria-label="Conversations">
                {shown.length ? (
                  <ul className="cc-threads">
                    {shown.map((t) => (
                      <ThreadRow key={t.contact.id} t={t} tab={tab} zone={zone} now={now} current={t.contact.id === open?.id} picked={!!sp.c} />
                    ))}
                  </ul>
                ) : (
                  <p className="mlo-note cc-ibx__empty">{ic.empty[tab]}</p>
                )}
              </section>
              <section className="cc-ibx__pane" aria-label="Conversation">
                {open ? <Conversation me={me} c={open} thread={openThread} tab={tab} zone={zone} now={now} texting={texting} /> : <p className="mlo-note cc-ibx__empty">{ic.pick}</p>}
              </section>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

function ThreadRow({ t, tab, zone, now, current, picked }: { t: InboxThread; tab: InboxTab; zone: string; now: Date; current: boolean; /** Opened on purpose (?c=); otherwise it is only shown beside the list on wide screens. */ picked: boolean }) {
  const c = t.contact;
  const preview = `${t.latest.direction === "out" ? ic.you : ""}${t.latest.body.replace(/\s+/g, " ").slice(0, 120)}`;
  return (
    <li>
      <Link className="cc-thread" href={`/mlo/inbox?tab=${tab}&c=${encodeURIComponent(c.id)}`} aria-current={current && picked ? "true" : undefined} data-shown={current && !picked ? "" : undefined} data-state={t.state}>
        <span className="cc-initials cc-initials--sm" aria-hidden="true">{initialsOf(c.firstName, c.lastName, c.email ?? "")}</span>
        <span className="cc-thread__main">
          <span className="cc-thread__top">
            <span className="cc-thread__name">{nameOf(c)}</span>
            <time className="cc-thread__when" dateTime={t.latest.at}>{shortWhen(t.latest.at, zone, now)}</time>
          </span>
          <span className="cc-thread__preview">{preview}</span>
          {t.state !== "sent" ? <span className={PILL[t.state]}>{t.state === "snoozed" && t.mark?.snoozeUntil ? ic.snoozedUntil(shortWhen(t.mark.snoozeUntil, zone, now)) : ic.state[t.state]}</span> : null}
        </span>
      </Link>
    </li>
  );
}

async function Conversation({ me, c, thread, tab, zone, now, texting }: { me: User; c: Contact; thread: InboxThread | null; tab: InboxTab; zone: string; now: Date; texting: boolean }) {
  const [touches, log, textService, textMarketing, emailService, emailMarketing, mail, optedOut] = await Promise.all([
    touchStore().forContact(c.id, 60),
    contactStore().consents(c.id),
    gateFor(me, c, "text", "service", now),
    gateFor(me, c, "text", "marketing", now),
    gateFor(me, c, "email", "service", now),
    gateFor(me, c, "email", "marketing", now),
    emailReadyFor(me),
    c.phone ? touchStore().optedOut(c.phone) : Promise.resolve(false),
  ]);
  const ownBook = me.id === c.ownerUserId;
  const [settings, drafts] = ownBook ? await Promise.all([conciergeStore().settings(me.id).catch(() => null), conciergeStore().proposals(me.id, "pending").catch(() => [])]) : [null, []];
  const draft = drafts.find((d) => d.contactId === c.id) ?? null;
  const s = summarize(log);
  const reach = { summary: s, hasPhone: !!c.phone, hasEmail: !!c.email, locked: c.locked };
  const badge = reachBadge(reach);
  const first = c.firstName || "them";
  const state = thread?.state ?? "sent";
  const items = buildTimeline(touches, null, []).slice(0, 30);
  const sub = [formatPhone(c.phone) || c.email, c.state, RELATIONSHIP_LABELS[c.relationship]].filter(Boolean).join(" · ");
  const phoneStopped = optedOut || s.text.marketing.evidence === "revoked" || s.text.service.evidence === "revoked";
  return (
    <>
      <Link href={`/mlo/inbox?tab=${tab}`} className="cc-ibx__back">‹ {ic.back}</Link>
      <header className="cc-contact-head cc-ibx-card">
        <span className="cc-initials" aria-hidden="true">{initialsOf(c.firstName, c.lastName, c.email ?? "")}</span>
        <div className="cc-contact-head__main">
          <h2 className="cc-ibx-card__name">{nameOf(c)}</h2>
          <p className="cc-contact-head__line">{sub}</p>
          <p className="cc-contact-head__line"><span className={`cc-reach cc-reach--${badge.tone}`}>{badge.label}</span> {permissionLine(reach).join(" · ")}</p>
          {c.tags.length ? (
            <ul className="cc-tags" aria-label={ic.card.tags}>
              {c.tags.slice(0, 6).map((t) => <li key={t}><span className="cc-tag">{t}</span></li>)}
            </ul>
          ) : null}
        </div>
      </header>
      <div className="mlo-actions cc-ibx-acts">
        {state === "done" ? (
          <form action={notDoneAction.bind(null, c.id, tab)}><button type="submit" className="mlo-btn mlo-btn--ghost">{ic.notDone}</button></form>
        ) : (
          <form action={doneAction.bind(null, c.id, tab)}><button type="submit" className="mlo-btn">{ic.done}</button></form>
        )}
        {state === "snoozed" ? (
          <form action={unsnoozeAction.bind(null, c.id, tab)}><button type="submit" className="mlo-btn mlo-btn--ghost">{ic.unsnooze}</button></form>
        ) : state === "needs" ? (
          <form action={snoozeAction.bind(null, c.id, tab)}><button type="submit" className="mlo-btn mlo-btn--ghost">{ic.snooze}</button></form>
        ) : null}
        <Link href={`/mlo/contacts/${encodeURIComponent(c.id)}`} className="mlo-btn mlo-btn--ghost">{ic.openContact}</Link>
      </div>
      {state === "snoozed" && thread?.mark?.snoozeUntil ? <p className="mlo-note">{ic.snoozedUntil(`${whenIn(thread.mark.snoozeUntil, zone)} ${zoneLabel(zone)} time`)}</p> : null}

      {draft ? (
        <section className="cc-card cc-suggest" aria-label={ic.draft.heading}>
          <p className="cc-card__title">{ic.draft.heading}</p>
          <p className="mlo-note">{ic.draft.why(draft.why)}</p>
          {!draft.gate.allowed ? <p className="mlo-note">{ic.draft.held(draft.gate.reason ?? "")}</p> : null}
          <form action={approveDraftAction.bind(null, c.id, tab, draft.id)} className="mlo-grid">
            <blockquote className="cc-draft__body">{draft.body}</blockquote>
            <details className="mlo-details">
              <summary>{ic.draft.edit}</summary>
              <textarea name="body" defaultValue={draft.body} rows={3} maxLength={MAX_TEXT} className="mlo-textarea" aria-label="Draft" />
            </details>
            <div className="mlo-row-form">
              <button type="submit" className="mlo-btn">{ic.draft.approve}</button>
              <button type="submit" formAction={skipDraftAction.bind(null, c.id, tab, draft.id)} formNoValidate className="mlo-btn mlo-btn--ghost">{ic.draft.skip}</button>
            </div>
          </form>
        </section>
      ) : ownBook && state === "needs" && settings?.enabled ? (
        <form action={draftReplyAction.bind(null, c.id, tab)} className="mlo-row-form cc-ibx-ask">
          <button type="submit" className="mlo-btn mlo-btn--ghost">{ic.draft.ask}</button>
          <span className="mlo-note">{ic.draft.askNote}</span>
        </form>
      ) : null}

      <section className="mlo-section cc-ibx-reply" aria-label={ic.reply.heading}>
        <h2>{ic.reply.heading}</h2>
        {!c.phone ? (
          <p className="mlo-note">{ic.reply.noPhone}</p>
        ) : phoneStopped ? (
          <p className="mlo-note">{ic.reply.stopped}</p>
        ) : texting ? (
          <form action={replyTextAction.bind(null, c.id, tab)} className="mlo-grid">
            <label className="mlo-field">
              <span>{ic.reply.textLabel(c.firstName)}</span>
              <textarea name="body" rows={3} maxLength={MAX_TEXT} className="mlo-textarea" required />
            </label>
            <div className="mlo-row-form">
              <select name="purpose" className="mlo-select" aria-label="What it's about" defaultValue="service">
                <option value="service">{ic.reply.purpose.service} ({ic.reply.allowed(textService.allowed)})</option>
                <option value="marketing">{ic.reply.purpose.marketing} ({ic.reply.allowed(textMarketing.allowed)})</option>
              </select>
              <button type="submit" className="mlo-btn">{ic.reply.send}</button>
            </div>
            <p className="mlo-note">{ic.reply.signoff}</p>
          </form>
        ) : (
          <PhoneText contactId={c.id} first={first} maxLength={MAX_TEXT} serviceOk={textService.allowed} marketingOk={textMarketing.allowed} refresh stopWhere={ic.reply.stopWhere} />
        )}
        {c.email ? (
          <details className="mlo-details">
            <summary>{ic.reply.emailFold(c.email)}</summary>
            <form action={replyEmailAction.bind(null, c.id, tab)} className="mlo-grid">
              <label className="mlo-field">
                <span>{ic.reply.subject}</span>
                <input name="subject" className="mlo-input" maxLength={78} required />
              </label>
              <label className="mlo-field">
                <span>{ic.reply.message}</span>
                <textarea name="body" rows={4} maxLength={4000} className="mlo-textarea" required />
                <span className="mlo-note">{ic.reply.emailNote}</span>
              </label>
              <div className="mlo-row-form">
                <select name="purpose" className="mlo-select" aria-label="What it's about" defaultValue="service">
                  <option value="service">{ic.reply.purpose.service} ({ic.reply.allowed(emailService.allowed)})</option>
                  <option value="marketing">{ic.reply.purpose.marketing} ({ic.reply.allowed(emailMarketing.allowed)})</option>
                </select>
                <button type="submit" className="mlo-btn" disabled={!mail.ready}>{ic.reply.sendEmail}</button>
              </div>
            </form>
          </details>
        ) : null}
      </section>

      <section className="mlo-section cc-ibx-thread" aria-label="Messages">
        <ol className="cc-timeline">
          {items.map((t) => (
            <li key={t.id} className={`cc-tl cc-tl--${t.kind}`}>
              <p className="cc-tl__head"><span className="cc-tl__title">{t.title}</span> <time dateTime={t.at}>{whenIn(t.at, zone)}</time></p>
              <p className="cc-tl__body">{t.body}</p>
              {t.meta ? <p className="mlo-note">{t.meta}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
