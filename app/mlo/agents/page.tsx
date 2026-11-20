import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { teamStore, type Move } from "@/lib/agents/store";
import { AGENTS, AGENT_KEYS } from "@/lib/agents/team";
import { scorecard } from "@/lib/agents/service";
import { snapshot, SET_ASIDE } from "@/lib/agents/business";
import { COACH_SCENARIOS, scenarioById } from "@/lib/agents/practice";
import { Practice } from "../academy/Client";
import { GIFT_RULES } from "@/lib/agents/runner";
import { FlashBox } from "../MloChrome";
import { giftAction, moveDismissAction, moveDoneAction, runNowAction, sendDraftAction } from "./actions";
import "../mlo.css";
import "./agents.css";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Your team", robots: { index: false, follow: false } };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "not yet");

function MoveCard({ m, top }: { m: Move; top?: boolean }) {
  const a = AGENTS[m.agent];
  const link = m.loanId ? `/mlo/pipeline/${m.loanId}` : m.contactId ? `/mlo/contacts/${m.contactId}` : m.href ?? null;
  return (
    <li className={`ag-move ag-move--${m.kind} ${top ? "is-top" : ""}`}>
      <div className="ag-move__head">
        <span className={`ag-badge ag-badge--${m.agent}`}>{a.name}</span>
        {m.kind === "send" ? <span className="ag-tag">Sends on its own</span> : m.kind === "draft" ? <span className="ag-tag">Needs your OK</span> : m.kind === "spend" ? <span className="ag-tag">Needs your yes</span> : null}
      </div>
      <p className="ag-move__title">{link ? <Link href={link}>{m.title}</Link> : m.title}</p>
      <p className="ag-move__why">{m.why}</p>
      {m.body ? (
        <details className="ag-msg">
          <summary>{m.channel === "email" ? "The email" : "The text"}{m.subject ? `: ${m.subject}` : ""}</summary>
          <pre>{m.body}</pre>
        </details>
      ) : null}
      {m.note ? <p className="ag-move__note">{m.note}</p> : null}
      <div className="mlo-row-form ag-move__acts">
        {m.kind === "draft" || m.kind === "send" ? <form action={sendDraftAction.bind(null, m.id)}><button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>{m.kind === "send" ? "Send now" : "Send"}</button></form> : null}
        {m.kind === "spend" && m.gift ? (
          <form action={giftAction.bind(null, m.id)} className="ag-gift">
            <input name="what" className="mlo-input" placeholder={m.gift === "lunch" ? "Where (e.g. lunch at a café)" : "What (e.g. a gift basket)"} aria-label="What it was" required maxLength={80} />
            <input name="dollars" className="mlo-input" inputMode="decimal" placeholder="$" aria-label="What it cost" required />
            <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Yes, log it</button>
          </form>
        ) : null}
        {m.kind === "spend" && !m.gift && m.href ? <Link href={m.href} className="mlo-btn" style={{ marginTop: 0 }}>Open and price it</Link> : null}
        {m.kind === "task" || m.kind === "plan" || (m.kind === "spend" && !m.gift) ? <form action={moveDoneAction.bind(null, m.id)}><button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Done</button></form> : null}
        <form action={moveDismissAction.bind(null, m.id)}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Not now</button></form>
        {m.kind === "draft" ? <Link href="/mlo/agents/setup#playbooks" className="mlo-note">Let it send on its own</Link> : null}
      </div>
    </li>
  );
}

/** /mlo/agents — the Concierge team (D54): the plan, what waits for you, what was sent, and the Coach. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ f?: string; practice?: string }> }) {
  const { f, practice } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  if (!me) {
    return (
      <PageShell>
        <div className="mlo-wrap"><h1 className="tagline text-4xl">Your team</h1><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your team.</p></div>
      </PageShell>
    );
  }
  const s = await teamStore().settings(me.id);
  const open = await teamStore().moves(me.id, { status: "open", limit: 300 });
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const sent = await teamStore().moves(me.id, { status: "sent", since: weekAgo, limit: 200 });
  const [card, biz] = await Promise.all([scorecard(me), snapshot(me)]);
  const scene = practice ? scenarioById(practice) : null;
  const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
  const top = open.filter((m) => m.kind !== "send").slice(0, 3);
  const rest = open.filter((m) => !top.includes(m));
  const byAgent = (k: string) => open.filter((m) => m.agent === k).length;
  const p = card.plan;

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <div className="ag-head">
          <div>
            <h1 className="tagline text-4xl">Your Concierge team</h1>
            <p className="mlo-note">{s.enabled ? `On · last run ${when(s.lastRunAt)} · ${open.length} waiting for you · ${sent.length} sent this week` : "Off. Turn it on in Set up; nothing runs until you do."}</p>
          </div>
          <div className="mlo-row-form">
            {s.enabled ? <form action={runNowAction}><button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Run now</button></form> : null}
            <Link href="/mlo/agents/setup" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Set up</Link>
          </div>
        </div>
        <FlashBox flash={decodeFlash(f)} />

        {s.enabled ? (
          <>
            <section className="mlo-section" aria-labelledby="top-h">
              <h2 id="top-h" className="text-xl">Today&apos;s top three</h2>
              <p className="mlo-note">From your Chief of Staff and Coach: the three things that most move your business today.</p>
              {top.length ? <ol className="ag-moves">{top.map((m) => <MoveCard key={m.id} m={m} top />)}</ol> : <p className="mlo-note" style={{ marginTop: 8 }}>Nothing urgent. Run the team, or add a list in Set up so it can find more business.</p>}
            </section>

            {rest.length ? (
              <section className="mlo-section" aria-labelledby="wait-h">
                <h2 id="wait-h" className="text-xl">Waiting for you <span className="mlo-note">· {rest.length}</span></h2>
                <ul className="ag-moves">{rest.slice(0, 60).map((m) => <MoveCard key={m.id} m={m} />)}</ul>
                {rest.length > 60 ? <p className="mlo-note">And {rest.length - 60} more; finish these first.</p> : null}
              </section>
            ) : null}

            <section className="mlo-section" aria-labelledby="coach-h">
              <h2 id="coach-h" className="text-xl">Your Coach</h2>
              <div className="ag-score">
                <div><strong>{card.talks}</strong><span>conversations{p ? ` of ${p.talksPerWeek}` : ""}</span></div>
                <div><strong>{card.apps}</strong><span>applications{p ? ` of ${p.appsPerWeek}` : ""}</span></div>
                <div><strong>{card.closed}</strong><span>loans closed{p ? ` of ${p.loansPerWeek}` : ""}</span></div>
                <div><strong>{card.partnerTouches}</strong><span>partner touches of {s.goals.partnerTouchesPerWeek}</span></div>
                <div><strong>{card.sentByTeam}</strong><span>sent by your team</span></div>
              </div>
              <p className="mlo-note" style={{ marginTop: 8 }}>The last 7 days. {p ? `Your goal works out to about ${p.loansPerYear} loans a year: ${p.loansPerWeek} closing${p.loansPerWeek === 1 ? "" : "s"}, ${p.appsPerWeek} applications and ${p.talksPerWeek} conversations a week.` : <>Set your income goal in <Link href="/mlo/agents/setup#goals">Set up</Link> and your Coach works it back to weekly numbers.</>}</p>
              <h3 className="ag-sub" id="practice">Practice a call with M8</h3>
              <div className="mlo-row-form">
                {COACH_SCENARIOS.map((x) => <Link key={x.id} href={`/mlo/agents?practice=${x.id}#practice`} className={`mlo-btn ${scene?.id === x.id ? "" : "mlo-btn--ghost"}`} style={{ marginTop: 0 }}>{x.title}</Link>)}
                <Link href="/mlo/academy" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Next CORE lesson</Link>
              </div>
              {scene ? (
                <div style={{ marginTop: 12 }}>
                  <p className="mlo-note">M8 plays {scene.practice.persona}. Your goal: {scene.practice.tryTo} When you&apos;re done, ask the Coach for feedback.</p>
                  <Practice key={scene.id} sessionId={scene.id} opening={scene.practice.opening} tryTo={scene.practice.tryTo} />
                </div>
              ) : null}
            </section>

            <section className="mlo-section" aria-labelledby="biz-h">
              <h2 id="biz-h" className="text-xl">Your Business Manager · {biz.year} so far</h2>
              <div className="ag-score">
                <div><strong>{usd(biz.incomeCents)}</strong><span>income recorded</span></div>
                <div><strong>{usd(biz.expenseCents)}</strong><span>business expenses</span></div>
                <div><strong>{usd(biz.profitCents)}</strong><span>profit</span></div>
                <div><strong>{usd(biz.setAsideCents)}</strong><span>to set aside for taxes ({Math.round(SET_ASIDE * 100)}%)</span></div>
                <div><strong>{biz.costPerLoanCents === null ? "–" : usd(biz.costPerLoanCents)}</strong><span>cost per closed loan ({biz.loansClosed} closed)</span></div>
              </div>
              <p className="mlo-note" style={{ marginTop: 8 }}>From your <Link href="/mlo/expenses">Expenses</Link> (confirmed entries only{biz.drafts ? `; ${biz.drafts} drafts waiting` : ""}) and your loans. {Math.round(SET_ASIDE * 100)}% of profit is a common starting point for self-employed set-asides, not tax advice: your CPA sets the real number.</p>
              {biz.sources.length ? (
                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <table className="mlo-table">
                    <thead><tr><th>Lead source</th><th>Leads</th><th>Became loans</th></tr></thead>
                    <tbody>{biz.sources.map((x) => <tr key={x.source}><td>{x.source}</td><td>{x.leads}</td><td>{x.loans}{x.leads ? ` (${Math.round((x.loans / x.leads) * 100)}%)` : ""}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <section className="mlo-section" aria-labelledby="sent-h">
              <h2 id="sent-h" className="text-xl">Sent by your team this week</h2>
              {sent.length ? (
                <ul className="mlo-list">{sent.slice(0, 40).map((m) => <li key={m.id}><span className={`ag-badge ag-badge--${m.agent}`}>{AGENTS[m.agent].name}</span> {m.contactId ? <Link href={`/mlo/contacts/${m.contactId}`}>{m.title}</Link> : m.title} <span className="mlo-note">· {when(m.updatedAt)}</span></li>)}</ul>
              ) : <p className="mlo-note">Nothing yet. Only playbooks you approve send on their own; everything else waits above.</p>}
            </section>
          </>
        ) : null}

        <section className="mlo-section" aria-labelledby="team-h">
          <h2 id="team-h" className="text-xl">The team</h2>
          <ul className="ag-team">
            {AGENT_KEYS.map((k) => {
              const a = AGENTS[k];
              return (
                <li key={k} className={`ag-agent ${a.ready ? "" : "is-next"}`}>
                  <span className={`ag-badge ag-badge--${k}`}>{a.name}</span>
                  <p className="ag-agent__role">{a.role}{a.ready ? (byAgent(k) ? ` · ${byAgent(k)} waiting` : "") : " · coming next"}</p>
                  <ul>{a.does.map((d) => <li key={d}>{d}</li>)}</ul>
                </li>
              );
            })}
          </ul>
          <p className="mlo-note" style={{ marginTop: 10 }}>Gifts and lunches are your call: each one waits for your yes and is logged. {GIFT_RULES.holiday.split(":")[0]}.</p>
        </section>
      </div>
    </PageShell>
  );
}
