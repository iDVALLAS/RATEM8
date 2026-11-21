import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { sessionById, sessionsOf, TRACKS } from "@/lib/academy/course";
import { academyStore } from "@/lib/academy/service";
import { FlashBox, MloNav } from "../../MloChrome";
import { Practice, QuizForm } from "../Client";
import { coachNoteAction, notesAction } from "../actions";
import "../../mlo.css";
import "../../templates/templates.css";
import "../academy.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Training session", robots: { index: false, follow: false } };

/** /mlo/academy/[id] — one session: learn, coaching notes, this week, notes, quiz, practice (D39). */
export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string }> }) {
  const { id } = await params;
  const { f } = await searchParams;
  const s = sessionById(id);
  if (!s) notFound();
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const [progress, notes] = me ? await Promise.all([academyStore().progress(me.id), academyStore().notes()]) : [[], []];
  const mine = progress.find((p) => p.sessionId === s.id);
  const coach = notes.find((n) => n.sessionId === s.id);
  const canCoach = !!me && (me.role === "owner" || me.role === "team_lead");
  const list = sessionsOf(s.track);
  const next = list.find((x) => x.n === s.n + 1);
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="academy" eyebrow={<>{TRACKS[s.track].title} · session {s.n} of {list.length}</>} title={s.title} />
        <MloNav current="academy" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        <p className="mlo-note"><Link href="/mlo/academy">← All sessions</Link> · {s.minutes} minutes{mine?.passedAt ? " · passed" : ""}</p>
        <section className="mlo-section">
          <p><strong>Goal:</strong> {s.goal}</p>
          {s.learn.map((b) => (
            <div key={b.h} className="ac-block">
              <h2>{b.h}</h2>
              <ul className="mlo-list">{b.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          ))}
        </section>
        {coach?.text || canCoach ? (
          <section className="mlo-section" id="coach">
            <h2>Coaching notes</h2>
            {coach?.text ? <p style={{ whiteSpace: "pre-wrap" }}>{coach.text}</p> : <p className="mlo-note">None yet.</p>}
            {canCoach ? (
              <form action={coachNoteAction.bind(null, s.id)} className="mlo-grid" style={{ marginTop: 10 }}>
                <label className="mlo-field"><span>Add or change the notes everyone sees for this session (your own coaching material)</span><textarea name="text" rows={4} maxLength={4000} defaultValue={coach?.text ?? ""} className="mlo-textarea" /></label>
                <button type="submit" className="mlo-btn mlo-btn--ghost">Save coaching notes</button>
              </form>
            ) : null}
          </section>
        ) : null}
        <section className="mlo-section">
          <h2>Do this week</h2>
          <ul className="mlo-list">{s.doThisWeek.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </section>
        {me ? (
          <section className="mlo-section" id="notes">
            <h2>Your notes</h2>
            <form action={notesAction.bind(null, s.id)} className="mlo-grid">
              <textarea name="notes" rows={4} maxLength={3000} defaultValue={mine?.notes ?? ""} className="mlo-textarea" aria-label="Your notes" placeholder="Your commitments, your plan, what you'll try." />
              <button type="submit" className="mlo-btn mlo-btn--ghost">Save notes</button>
            </form>
          </section>
        ) : null}
        {me && s.practice ? (
          <section className="mlo-section" id="practice">
            <h2>Practice with M8</h2>
            <Practice sessionId={s.id} opening={s.practice.opening} tryTo={s.practice.tryTo} />
          </section>
        ) : null}
        {me ? (
          <section className="mlo-section" id="quiz">
            <h2>Quiz</h2>
            <QuizForm sessionId={s.id} quiz={s.quiz} />
            {next ? <p className="mlo-note" style={{ marginTop: 12 }}>Next: <Link href={`/mlo/academy/${next.id}`}>{next.title}</Link></p> : null}
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
