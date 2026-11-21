import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { CREDIT, sessionsOf, TRACKS, type TrackId } from "@/lib/academy/course";
import { academyStore, teamProgress, weekOf, SESSION_COUNT } from "@/lib/academy/service";
import { FlashBox, MloNav } from "../MloChrome";
import { numbersAction, weekAction } from "./actions";
import "../mlo.css";
import "../templates/templates.css";
import "./academy.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Training", robots: { index: false, follow: false } };

/** /mlo/academy — training sessions, your numbers and the team's progress (D39). */
export default async function Academy({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const [progress, numbers, weeks] = me ? await Promise.all([academyStore().progress(me.id), academyStore().numbers(me.id), academyStore().weeks(me.id)]) : [[], null, []];
  const team = me ? await teamProgress(me) : null;
  const thisWeek = weekOf(new Date());
  const current = weeks.find((w) => w.week === thisWeek);
  const passed = (id: string) => progress.find((p) => p.sessionId === id)?.passedAt;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="academy" title="Training" />
        <MloNav current="academy" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to take the training.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <p className="mlo-note">{progress.filter((p) => p.passedAt).length} of {SESSION_COUNT} sessions passed. Each session is short: learn it, do this week&apos;s actions, pass the quiz, and practice with M8 where there&apos;s a conversation to rehearse.</p>
              <p className="mlo-note" style={{ marginTop: 8 }}>{CREDIT}</p>
            </section>
            {(Object.keys(TRACKS) as TrackId[]).map((t) => (
              <section key={t} className="mlo-section">
                <h2>{TRACKS[t].title}</h2>
                <p className="mlo-note">{TRACKS[t].blurb}</p>
                <ol className="ac-sessions">
                  {sessionsOf(t).map((s) => (
                    <li key={s.id}>
                      <Link href={`/mlo/academy/${s.id}`} className="ac-session">
                        <span className="ac-session__n">{s.n}</span>
                        <span className="ac-session__t">{s.title}<span className="mlo-note"> · {s.minutes} min{s.practice ? " · practice" : ""}</span></span>
                        <span className={`mlo-pill ${passed(s.id) ? "" : "mlo-pill--off"}`}>{passed(s.id) ? "Passed" : "Start"}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}

            <section className="mlo-section" id="numbers">
              <h2>Your numbers</h2>
              <p className="mlo-note">Set targets once; log the week every Friday. Activity you control predicts the results you don&apos;t.</p>
              <form action={numbersAction} className="mlo-row-form" style={{ marginTop: 10 }}>
                <label className="mlo-field"><span>Purchase loans a month (goal)</span><input type="number" name="goal" min={0} max={500} defaultValue={numbers?.monthlyPurchaseGoal ?? ""} className="mlo-input" required /></label>
                <label className="mlo-field"><span>Agent conversations a week</span><input type="number" name="conversations" min={0} max={1000} defaultValue={numbers?.weeklyConversations ?? ""} className="mlo-input" required /></label>
                <label className="mlo-field"><span>Agent meetings a week</span><input type="number" name="meetings" min={0} max={1000} defaultValue={numbers?.weeklyMeetings ?? ""} className="mlo-input" required /></label>
                <button type="submit" className="mlo-btn mlo-btn--ghost">Save targets</button>
              </form>
              <form action={weekAction} className="mlo-row-form" style={{ marginTop: 14 }}>
                <input type="hidden" name="week" value={thisWeek} />
                <label className="mlo-field"><span>Conversations</span><input type="number" name="conversations" min={0} defaultValue={current?.conversations ?? 0} className="mlo-input" /></label>
                <label className="mlo-field"><span>Meetings</span><input type="number" name="meetings" min={0} defaultValue={current?.meetings ?? 0} className="mlo-input" /></label>
                <label className="mlo-field"><span>Follow-ups</span><input type="number" name="followUps" min={0} defaultValue={current?.followUps ?? 0} className="mlo-input" /></label>
                <label className="mlo-field"><span>Buyers introduced</span><input type="number" name="introductions" min={0} defaultValue={current?.introductions ?? 0} className="mlo-input" /></label>
                <button type="submit" className="mlo-btn">Log week of {thisWeek}</button>
              </form>
              {weeks.length ? (
                <table className="mlo-table" style={{ marginTop: 12 }}>
                  <thead><tr><th>Week of</th><th>Conversations</th><th>Meetings</th><th>Follow-ups</th><th>Introduced</th></tr></thead>
                  <tbody>{weeks.slice(0, 8).map((w) => <tr key={w.week}><td>{w.week}</td><td className={numbers && w.conversations < numbers.weeklyConversations ? "ac-under" : ""}>{w.conversations}{numbers ? ` / ${numbers.weeklyConversations}` : ""}</td><td className={numbers && w.meetings < numbers.weeklyMeetings ? "ac-under" : ""}>{w.meetings}{numbers ? ` / ${numbers.weeklyMeetings}` : ""}</td><td>{w.followUps}</td><td>{w.introductions}</td></tr>)}</tbody>
                </table>
              ) : null}
            </section>

            {team ? (
              <section className="mlo-section">
                <h2>The team</h2>
                <table className="mlo-table">
                  <thead><tr><th>Who</th><th>Sessions passed</th><th>Last week logged</th></tr></thead>
                  <tbody>{team.map((t) => <tr key={t.userId}><td>{t.name}</td><td>{t.passed} of {SESSION_COUNT}</td><td>{t.lastWeek ? `${t.lastWeek.week}: ${t.lastWeek.conversations} conversations, ${t.lastWeek.meetings} meetings` : "Not yet"}</td></tr>)}</tbody>
                </table>
              </section>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
