import type { Metadata } from "next";
import Link from "next/link";
import CcShell from "./CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { listTenants } from "@/lib/pricing/tenants";
import { todayFor } from "@/lib/today/facts";
import type { TodayCard } from "@/lib/today/rank";
import { contactStore } from "@/lib/contacts/store";
import { formatPhone } from "@/lib/contacts/normalize";
import { telHref } from "@/lib/call-hours";
import { checklist } from "@/lib/setup/checklist";
import { conciergeStore } from "@/lib/concierge/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { academyStore, SESSION_COUNT } from "@/lib/academy/service";
import { expenseStore } from "@/lib/expenses/store";
import { allowanceFor } from "@/lib/ai/meter";
import { firstDay, pilotOn } from "@/lib/pilot/service";
import SetupGuide from "./SetupGuide";
import FirstDay from "./FirstDay";
import { FlashBox } from "./MloChrome";
import { decodeFlash } from "@/lib/mlo/flash";
import { GROUPS, hrefOf, visibleDests, type GroupKey, type IconName } from "./nav";
import { Icon } from "./icons";
import { TileArt } from "./art";
import { callQueue } from "@/lib/calls/session";
import { topBlocker } from "@/lib/calls/blockers";
import { repliesWaiting } from "@/lib/messaging/replies";
import { textingReadyFor } from "@/lib/texting/ready";
import { CALL_FIX, HOME } from "@/lib/content/cc-pages";
import "./mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "MLO Command Center" }, robots: { index: false, follow: false } };

const KIND_ICON: Partial<Record<TodayCard["kind"], IconName>> = { reply: "inbox", new_lead: "lead", journey: "pipeline", promise: "check", anniversary: "spark", rate_gap: "trend", check_in: "users", ask_permission: "check", agent: "users", loan_late: "pipeline", lock: "lock", closing: "pipeline" };
const HOT: TodayCard["kind"][] = ["reply", "new_lead", "journey", "promise"];

/** /mlo — Command Center home (D43): today at a glance, then every area as a tile. */
export default async function CommandCenterHome({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const tenant = listTenants()[0];
  const [today, setup] = me ? await Promise.all([todayFor(me), checklist(me)]) : [null, null];
  const day1 = me && setup ? await firstDay(me, setup).catch(() => null) : null;
  const showFirst = !!day1 && !day1.hidden && day1.done < day1.steps.length;
  const phones = today ? await Promise.all(today.cards.map((c) => (c.contactId ? contactStore().get(c.contactId).then((x) => x?.phone ?? null) : Promise.resolve(null)))) : [];
  const [drafts, loans, contacts, progress, expDrafts, ai] = me
    ? await Promise.all([
        conciergeStore().proposals(me.id, "pending").then((x) => x.length),
        pipelineStore().list(me.id).then((x) => x.filter((l) => !l.closed && !l.dead).length),
        contactStore().list({ ownerUserId: me.id, limit: 1 }).then((x) => x.total),
        academyStore().progress(me.id).then((x) => x.filter((p) => p.passedAt).length),
        expenseStore().list(me.id, null).then((x) => x.filter((e) => e.status === "draft").length),
        allowanceFor(me.id).catch(() => null),
      ])
    : [0, 0, 0, 0, 0, null];
  // D76: the call button says what's true: people ready to call, or how many need one fix first.
  const [queue, replies, texting] = me && today ? await Promise.all([callQueue(me, new Date(), today.cards).catch(() => null), repliesWaiting(me).catch(() => 0), textingReadyFor(me).catch(() => false)]) : [null, 0, false];
  const blocker = queue && !queue.ready.length ? topBlocker(queue.blocked.map((x) => x.reason)) : null;
  const call = !queue ? { href: "/mlo/calls", label: HOME.callNone } : queue.ready.length ? { href: "/mlo/calls", label: HOME.callReady(queue.ready.length) } : queue.blocked.length ? { href: "/mlo/calls#blocked", label: HOME.callBlocked(queue.blocked.length) } : { href: "/mlo/calls", label: HOME.callNone };
  const deadlines = today?.cards.filter((c) => c.kind === "journey").length ?? 0;
  const first = me?.name.split(" ")[0] ?? "";
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const setupDone = setup ? setup.filter((s) => s.done).length : 0;

  const stat: Record<string, string> = {
    concierge: drafts ? `${drafts} ${drafts === 1 ? "draft" : "drafts"} waiting` : "Nothing waiting",
    contacts: `${contacts.toLocaleString("en-US")} ${contacts === 1 ? "person" : "people"}`,
    pipeline: `${loans} active ${loans === 1 ? "loan" : "loans"}`,
    academy: `${progress} of ${SESSION_COUNT} sessions passed`,
    expenses: expDrafts ? `${expDrafts} to confirm` : "Up to date",
    network: ai ? `AI this month: $${(ai.usedCents / 100).toFixed(2)} of $${(ai.allowanceCents / 100).toFixed(0)}` : "",
    inbox: replies ? `${replies} waiting for a reply` : "No replies waiting",
  };
  const badge: Record<string, number> = { concierge: drafts, inbox: replies, expenses: expDrafts };
  // D76: Home shows "Your day" and "People"; the rest fold under "Everything else". Platform (admin) tiles stay off Home.
  const dests = visibleDests({ admin: v.admin, signedIn: !!me }).filter((d) => d.key !== "home" && !d.admin);
  const groups = (Object.keys(GROUPS) as GroupKey[]).map((g) => ({ g, items: dests.filter((d) => d.group === g) })).filter((x) => x.items.length);
  const MAIN: GroupKey[] = ["day", "people"];
  const tiles = (items: typeof dests) => (
    <div className="cc-tiles">
      {items.map((d) => (
        <Link key={d.key} href={hrefOf(d, tenant.id)} className="cc-tile">
          <TileArt name={d.key} fallback={<Icon name={d.icon} size={32} />} />
          <span className="cc-tile__body">
            <span className="cc-tile__head">
              <span className="cc-tile__icon"><Icon name={d.icon} size={18} /></span>
              <span className="cc-tile__label">{d.label}</span>
              {badge[d.key] ? <span className="cc-badge cc-tile__badge">{badge[d.key]}</span> : null}
            </span>
            <span className="cc-tile__desc">{d.desc}</span>
            {stat[d.key] ? <span className="cc-tile__stat">{stat[d.key]}</span> : null}
          </span>
        </Link>
      ))}
    </div>
  );

  // D76: the first few people show; the rest of today's list is one tap away.
  const FIRST = 6;
  const row = (card: TodayCard, i: number) => {
    const tel = telHref(phones[i] ?? undefined);
    const href = card.contactId ? `/mlo/contacts/${card.contactId}` : "/mlo/pipeline";
    const go =
      card.next === "reply" || card.next === "text" ? { href: `${href}#conversation`, label: card.next === "reply" ? "Reply" : texting ? "Text" : HOME.openWord }
      : card.next === "call" && tel ? { href: tel, label: `Call ${formatPhone(phones[i])}` }
      : card.next === "record_permission" ? { href: `${href}#permission`, label: "Record what they said" }
      : card.loanId ? { href: `/mlo/pipeline/${card.loanId}${card.kind === "journey" ? "#clocks" : ""}`, label: "Open the journey" }
      : { href, label: "Open" };
    return (
      <li key={`${card.contactId}-${card.kind}-${i}`} className="cc-row">
        <span className={`cc-row__icon ${HOT.includes(card.kind) ? "cc-row__icon--hot" : ""}`}><Icon name={KIND_ICON[card.kind] ?? "users"} size={20} /></span>
        <span style={{ minWidth: 0 }}>
          <Link href={href} className="cc-row__title" style={{ color: "inherit", textDecoration: "none" }}>{card.title}</Link>
          <div className="cc-row__why">{card.reason}</div>
        </span>
        <a className={`cc-row__go ${i === 0 ? "cc-row__go--hi" : ""}`} href={go.href}>{go.label}</a>
      </li>
    );
  };

  return (
    <CcShell>
      <div className="cc-home">
        <FlashBox flash={decodeFlash(f)} />
        <div className="cc-hello">
          <span className="cc-hello__av" aria-hidden="true">{(me?.name || "M 8").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("")}</span>
          <div>
            <div className="cc-hello__small">{greet}{first ? "," : ""}</div>
            <h1>{first || "Command Center"}</h1>
          </div>
        </div>

        {!me ? (
          <div className="cc-panel"><p className="mlo-note">You&apos;re on the shared admin login. <Link href="/sign-in">Sign in with your email</Link> to see your own day, your book and the team.</p></div>
        ) : (
          <div className="cc-hero">
            <div className="cc-panel cc-today-big">
              <div className="cc-today-big__label"><span>Today</span><span>{new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "short", day: "numeric" }).format(new Date())}</span></div>
              <div className="cc-today-big__n">{today?.cards.length ?? 0}<small>{(today?.cards.length ?? 0) === 1 ? "person to reach" : "people to reach"}</small></div>
              <div className="cc-chips">
                <Link className="cc-chip" href="/mlo/concierge#drafts"><Icon name="spark" size={16} /><strong>{drafts}</strong> {drafts === 1 ? "draft" : "drafts"}</Link>
                <Link className="cc-chip" href="/mlo/inbox"><Icon name="inbox" size={16} /><strong>{replies}</strong> {replies === 1 ? "reply" : "replies"}</Link>
                <Link className="cc-chip" href="/mlo/pipeline"><Icon name="pipeline" size={16} /><strong>{loans}</strong> active {loans === 1 ? "loan" : "loans"}</Link>
                {deadlines ? <Link className="cc-chip" href="/mlo/pipeline"><Icon name="lock" size={16} /><strong>{deadlines}</strong> {deadlines === 1 ? "deadline" : "deadlines"}</Link> : null}
              </div>
              <div className="cc-actions">
                <Link className="mlo-btn" href={call.href}>{call.label}</Link>
                <Link className="mlo-btn mlo-btn--ghost" href="/mlo/contacts/import">Import contacts</Link>
              </div>
              {blocker ? <p className="cc-blocker"><Link className="cc-chip cc-chip--warn" href="/mlo/calls#blocked">{CALL_FIX[blocker.kind].chip}<strong>{blocker.count}</strong></Link></p> : null}
            </div>
            <div className="cc-insight">
              <div className="cc-insight__top"><span className="cc-insight__icon"><Icon name="spark" size={22} /></span><h2>Your Concierge</h2></div>
              <p>{drafts ? `${drafts} ${drafts === 1 ? "text is" : "texts are"} drafted and waiting for your OK. Each one is re-checked against your contact rules when you approve it.` : today && today.cards.length ? "Nothing waiting for approval. Press Run now and it'll draft check-ins for the people on today's list." : "Import your contacts and it will start drafting check-ins and reminders each morning."}</p>
              <Link className="cc-btn-dark" href="/mlo/concierge#drafts">{drafts ? "Review drafts" : "Open Concierge"}</Link>
            </div>
          </div>
        )}

        {showFirst && day1 ? <FirstDay steps={day1.steps} done={day1.done} pilot={pilotOn()} /> : null}

        {today ? (
          <section>
            <div className="cc-sechead"><h2>Who to reach</h2>{today.cards.length ? <Link href="/mlo/calls">Call session</Link> : null}</div>
            {today.people === 0 ? (
              <div className="cc-panel"><p className="mlo-note">Nothing yet. <Link href="/mlo/contacts/import">Import your contacts</Link> and this list will show who to reach out to, and why.</p></div>
            ) : today.cards.length === 0 ? (
              <div className="cc-panel"><p className="mlo-note">You&apos;re caught up: no replies waiting and nothing time-sensitive across {today.people.toLocaleString("en-US")} people.</p></div>
            ) : (
              <>
                <ol className="cc-list">{today.cards.slice(0, FIRST).map((card, i) => row(card, i))}</ol>
                {today.cards.length > FIRST ? (
                  <details className="cc-more">
                    <summary>{HOME.more(today.cards.length - FIRST)}</summary>
                    <ol className="cc-list" start={FIRST + 1}>{today.cards.slice(FIRST).map((card, i) => row(card, i + FIRST))}</ol>
                  </details>
                ) : null}
              </>
            )}
            {today.ref ? <p className="mlo-note" style={{ marginTop: 8 }}>Refinance comparisons use today&apos;s priced example ({today.ref.rate}%, {today.ref.label}), for your eyes only.</p> : null}
          </section>
        ) : null}

        {groups.filter((x) => MAIN.includes(x.g)).map(({ g, items }) => (
          <section key={g} className="cc-group" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`}>{GROUPS[g]}</h2>
            {tiles(items)}
          </section>
        ))}

        {groups.some((x) => !MAIN.includes(x.g)) ? (
          <details className="cc-all cc-fold">
            <summary className="cc-sechead"><h2>{HOME.everythingElse}</h2><span className="cc-fold__arrow" aria-hidden="true" /></summary>
            {groups.filter((x) => !MAIN.includes(x.g)).map(({ g, items }) => (
              <section key={g} className="cc-group" aria-labelledby={`g-${g}`}>
                <h3 id={`g-${g}`}>{GROUPS[g]}</h3>
                {tiles(items)}
              </section>
            ))}
          </details>
        ) : null}

        {setup && setupDone < setup.length ? (
          <section aria-label="Setup">
            <SetupGuide items={setup} open={false} />
          </section>
        ) : null}
      </div>
    </CcShell>
  );
}
