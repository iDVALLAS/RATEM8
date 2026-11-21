import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { todayFor } from "@/lib/today/facts";
import { scriptStore, OUTCOME_LABELS } from "@/lib/scripts/store";
import { GOAL_LABELS, GOALS, type ScriptGoal } from "@/lib/scripts/signals";
import { STATES } from "@/lib/config";
import { FlashBox, MloNav } from "../MloChrome";
import ScriptView from "./ScriptView";
import { BuildButton } from "./Buttons";
import { buildScriptAction, practiceScriptAction } from "./actions";
import "../mlo.css";
import "./scripts.css";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Call scripts", robots: { index: false, follow: false } };

/** Today's card kind → the script that fits it. */
const GOAL_FOR: Record<string, ScriptGoal> = { reply: "reply", anniversary: "anniversary", rate_gap: "refi_review", check_in: "check_in", ask_permission: "permission", loan_late: "loan_status", lock: "loan_status", closing: "loan_status", agent: "partner" };

/** /mlo/scripts — call scripts for the people on Today, practice scripts, and the ones you've used (D9). */
export default async function Scripts({ searchParams }: { searchParams: Promise<{ f?: string; id?: string }> }) {
  const { f, id } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const [today, recent, open] = me ? await Promise.all([todayFor(me), scriptStore().recent(me.id, 15), id ? scriptStore().get(id) : Promise.resolve(null)]) : [null, [], null];
  const shown = open && me && open.ownerUserId === me.id ? open : null;
  const cards = (today?.cards ?? []).filter((c) => c.contactId).filter((c, i, all) => all.findIndex((x) => x.contactId === c.contactId) === i).slice(0, 10);
  const states = STATES.map((s) => s.code);

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Call scripts</h1>
        <MloNav current="scripts" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to build call scripts.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>A script for each call</h2>
              <p className="mlo-note">
                The builder reads what you already know about a client (their loan, any loan in process, what they&apos;ve told you, your notes and recent texts), finds what they might need, and writes a script for the call: an opener, questions, what to listen for, answers to pushback, a voicemail and a follow-up text. It never puts a rate, payment or promise in your mouth, and it leaves out family, marital status, religion, health, age, race and national origin. You can also build one from any contact&apos;s page.
              </p>
            </section>

            {shown ? (
              <section className="mlo-section" id="script">
                <h2>{shown.contactId ? <Link href={`/mlo/contacts/${shown.contactId}#script`}>{shown.contactName}</Link> : "Practice script"}</h2>
                <ScriptView saved={shown} back={`/mlo/scripts?id=${shown.id}`} />
              </section>
            ) : null}

            <section className="mlo-section">
              <h2>Who to call today</h2>
              {cards.length === 0 ? <p className="mlo-note">No one on Today right now. Open any contact to build a script for them.</p> : (
                <ol className="cc-today">
                  {cards.map((c) => (
                    <li key={c.contactId} className="cc-card">
                      <p className="cc-card__title"><Link href={`/mlo/contacts/${c.contactId}#script`}>{c.title}</Link></p>
                      <p className="mlo-note">{c.reason}</p>
                      <p className="mlo-note">Goal: {GOAL_LABELS[GOAL_FOR[c.kind] ?? "auto"]}</p>
                      <form action={buildScriptAction} className="mlo-row-form">
                        <input type="hidden" name="contactId" value={c.contactId} />
                        <input type="hidden" name="from" value="scripts" />
                        <input type="hidden" name="goal" value={GOAL_FOR[c.kind] ?? "auto"} />
                        <BuildButton label="Build script" />
                      </form>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="mlo-section">
              <h2>Practice a call</h2>
              <p className="mlo-note">Describe a situation and get a script, with no client attached. Good for training new loan officers or rehearsing a tricky call. Leave out names, account numbers and anything personal.</p>
              <form action={practiceScriptAction} className="mlo-grid">
                <label className="mlo-field"><span>The situation</span><textarea name="situation" required minLength={10} maxLength={800} placeholder="A past client from 2022 texted that they're thinking about adding a second story and asked what their options are." /></label>
                <div className="mlo-grid mlo-grid--2">
                  <label className="mlo-field"><span>Goal</span>
                    <select name="goal" defaultValue="check_in">
                      {GOALS.filter((g) => g !== "auto").map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
                    </select>
                  </label>
                  <label className="mlo-field"><span>Their state (for the recording rule)</span>
                    <select name="state" defaultValue="">
                      <option value="">Not set</option>
                      {states.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
                <div><BuildButton label="Build a practice script" /></div>
              </form>
            </section>

            <section className="mlo-section">
              <h2>Your recent scripts</h2>
              {recent.length === 0 ? <p className="mlo-note">None yet.</p> : (
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.id}>
                        <th scope="row"><Link href={`/mlo/scripts?id=${r.id}#script`}>{r.contactName} · {r.script.title}</Link></th>
                        <td className="mlo-note">{new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}</td>
                        <td className="mlo-note">{r.outcome ? OUTCOME_LABELS[r.outcome.result] : "not logged"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
