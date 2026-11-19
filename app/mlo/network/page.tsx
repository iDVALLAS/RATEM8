import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { MEMBERSHIP } from "@/lib/config";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { accountStore } from "@/lib/accounts/store";
import { isAdmin } from "@/lib/accounts/auth";
import { areaPlan, CHANNEL_LABELS, coopBudget, creditBalance, PAID_AD_CHANNELS, rewardsOn, statementFor } from "@/lib/membership/service";
import { areaKey, COOP_CHANNELS, membershipStore, NATIONAL } from "@/lib/membership/store";
import { productionOn, shareFor, sponsorStatement } from "@/lib/membership/production";
import { allowanceFor, monthOf, usageStore } from "@/lib/ai/meter";
import { AI_PLANS } from "@/lib/config";
import { FlashBox, MloNav } from "../MloChrome";
import { answerIdeaAction, ideaAction, paymentAction, prefAction, setMemberAction, spendAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Membership", robots: { index: false, follow: false } };

const $ = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const month = () => new Date().toISOString().slice(0, 7);

/** /mlo/network — membership: people you brought in, your credit, and where marketing goes (D35/D36). */
export default async function Membership({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const st = me ? await statementFor(me) : null;
  const admin = me && isAdmin(me);
  const users = admin ? (await accountStore().listUsers()).filter((u) => u.role !== "assistant") : [];
  const members = admin ? await membershipStore().members() : [];
  const memberOf = (id: string) => members.find((m) => m.userId === id);
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? "";
  const balances = admin ? await Promise.all(users.map(async (u) => ({ id: u.id, ...(await creditBalance(u.id)) }))) : [];
  const areas = admin ? [...new Map(members.map((m) => [areaKey(m.area), m.area])).values()] : [];
  const areaBudgets = admin ? await Promise.all(areas.map(async (a) => ({ ...(await coopBudget(a)), plan: await areaPlan(a) }))) : [];
  const allIdeas = admin ? (await membershipStore().ideas(null)).filter((i) => i.status === "open" || i.status === "approved") : [];
  const thisMonth = month();
  const lastMonth = (() => { const d = new Date(`${thisMonth}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const myShare = me ? [...(await shareFor(me.id, thisMonth)).map((l) => ({ ...l, month: thisMonth })), ...(await shareFor(me.id, lastMonth)).map((l) => ({ ...l, month: lastMonth }))] : [];
  const sponsorThis = me ? await sponsorStatement(me, thisMonth) : null;
  const nameOfAny = async (id: string) => (await accountStore().userById(id))?.name?.split(/\s+/)[0] ?? "A member";
  const shareNames = Object.fromEntries(await Promise.all([...new Set([...myShare.map((l) => l.recruitUserId), ...(sponsorThis?.lines ?? []).flatMap((l) => [l.recruitUserId, l.recruiterUserId])])].map(async (id) => [id, await nameOfAny(id)] as const)));
  const myAi = me ? await allowanceFor(me.id) : null;
  const teamAi = admin ? await usageStore().monthAll(monthOf(new Date())) : [];
  const ROUTE_LABELS: Record<string, string> = { concierge: "Concierge", tell: "Tell your Concierge", ask: "Questions", debrief: "Call notes", scripts: "Call scripts", templates: "Templates", docs: "AUS findings", practice: "Training practice", expenses: "Expenses", receipts: "Receipts", chat: "Borrower chat (M8)" };
  const nationalShare = MEMBERSHIP.marketingShare * MEMBERSHIP.nationalPart;
  const areaShare = MEMBERSHIP.marketingShare - nationalShare;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Membership</h1>
        <MloNav current="network" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me || !st ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your membership.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>How it works</h2>
              <ul className="mlo-list">
                <li><strong>Bring in loan officers you know.</strong> For each one, {pct(MEMBERSHIP.recruitRate)} of the membership fee they pay comes back to you as credit on your own membership, rising to {pct(MEMBERSHIP.recruitTenureRate)} once they&apos;ve been a member {MEMBERSHIP.tenureMonths} months. Credit only, one level, and never based on anyone&apos;s loans.</li>
                <li><strong>Market your area together.</strong> {pct(MEMBERSHIP.marketingShare)} of every fee goes to marketing: {pct(nationalShare)} of the fee to national LoanM8 marketing and {pct(areaShare)} to your own area, where the members there decide how it&apos;s split and suggest local ideas.</li>
                <li><strong>Share in their production.</strong> When a loan officer you brought in (including an agent you helped get licensed) closes loans, you get {MEMBERSHIP.productionBps[0]} basis points of their closed loan amounts{MEMBERSHIP.productionBps.length > 1 ? `, and the same for the people they bring in, ${MEMBERSHIP.productionBps.length} levels down` : ""}, paid by the sponsoring company through its compensation plan. After {MEMBERSHIP.productionVestYears} years as a member it&apos;s vested: it keeps paying even if you leave. It&apos;s based only on loan amounts, never rates or terms.</li>
                <li><strong>See every dollar.</strong> Each spend is listed with what it was, where it ran and its receipt.</li>
              </ul>
              {!rewardsOn() ? <p className="mlo-note" style={{ marginTop: 8 }}>Recruiting credit is being tracked and held. It becomes usable once counsel approves the plan.</p> : null}
              {!productionOn() ? <p className="mlo-note" style={{ marginTop: 4 }}>The production share is tracked, not owed, until counsel and the sponsoring company approve it.</p> : null}
            </section>

            <section className="mlo-section">
              <h2>Your membership</h2>
              {st.member ? (
                <table className="mlo-table mlo-table--plain"><tbody>
                  <tr><th scope="row">Area</th><td>{st.member.area}</td></tr>
                  <tr><th scope="row">Monthly fee</th><td>{$(st.member.feeCents)}</td></tr>
                  <tr><th scope="row">Member since</th><td>{st.member.joinedOn}</td></tr>
                  <tr><th scope="row">Credit you can use</th><td>{$(st.credit.usable)}{st.credit.held ? <span className="mlo-note"> · {$(st.credit.held)} held until the plan is approved</span> : null}</td></tr>
                </tbody></table>
              ) : <p className="mlo-note">The owner sets up your membership (area and fee). Ask them if it&apos;s missing.</p>}
            </section>

            <section className="mlo-section">
              <h2>Loan officers you brought in ({st.recruits.length})</h2>
              {st.recruits.length === 0 ? <p className="mlo-note">None yet. When someone you brought in joins, the owner links them to you here.</p> : (
                <table className="mlo-table">
                  <thead><tr><th>Who</th><th>Member since</th><th>Rate now</th><th>Credit so far</th></tr></thead>
                  <tbody>{st.recruits.map((r) => <tr key={r.userId}><td>{r.name}{r.active ? "" : " (left)"}</td><td>{r.joinedOn}</td><td>{pct(r.rateNow)}</td><td>{$(r.creditCents)}</td></tr>)}</tbody>
                </table>
              )}
            </section>

            {myAi ? (
              <section className="mlo-section" id="ai">
                <h2>Your AI this month</h2>
                <p className="mlo-note">{myAi.label} plan · {$(Math.round(myAi.usedCents))} of {$(myAi.allowanceCents)} used{myAi.over ? ` · used up: AI features use their plain versions until ${myAi.resetsOn}` : ` · resets ${myAi.resetsOn}`}</p>
                <div className="nw-meter" role="img" aria-label={`${Math.min(100, Math.round((myAi.usedCents / myAi.allowanceCents) * 100))}% of this month's AI allowance used`}><span style={{ width: `${Math.min(100, (myAi.usedCents / myAi.allowanceCents) * 100)}%` }} className={myAi.over ? "nw-meter--over" : ""} /></div>
                {Object.keys(myAi.byRoute).length ? <p className="mlo-note" style={{ marginTop: 8 }}>{Object.entries(myAi.byRoute).sort((a, b) => b[1] - a[1]).map(([r, c]) => `${ROUTE_LABELS[r] ?? r} ${$(Math.round(c))}`).join(" · ")}</p> : null}
                <p className="mlo-note" style={{ marginTop: 4 }}>Borrower chat on your area&apos;s M8 is counted here but never stopped.</p>
              </section>
            ) : null}

            <section className="mlo-section" id="production">
              <h2>Your production share</h2>
              {myShare.length === 0 ? <p className="mlo-note">No closed loans from loan officers you brought in, this month or last.</p> : (
                <table className="mlo-table">
                  <thead><tr><th>Month</th><th>Who</th><th>Closed loans</th><th>Volume</th><th>Share</th></tr></thead>
                  <tbody>{myShare.map((l) => <tr key={`${l.month}-${l.recruitUserId}`}><td>{l.month}</td><td>{shareNames[l.recruitUserId]}{l.level > 1 ? ` (level ${l.level})` : ""}</td><td>{l.loans}</td><td>{$(l.volume * 100)}</td><td>{$(l.cents)}{productionOn() ? "" : " (tracked)"}</td></tr>)}</tbody>
                </table>
              )}
            </section>

            {st.coop ? (
              <section className="mlo-section" id="area">
                <h2>{st.coop.area}: your area&apos;s marketing</h2>
                <p className="mlo-note">{st.coop.members} {st.coop.members === 1 ? "member" : "members"} · {$(st.coop.inCents)} in · {$(st.coop.spentCents)} spent · <strong>{$(st.coop.balanceCents)} available</strong></p>
                {st.coop.spends.length ? (
                  <table className="mlo-table" style={{ marginTop: 10 }}>
                    <thead><tr><th>Month</th><th>What</th><th>Where</th><th>Cost</th></tr></thead>
                    <tbody>{st.coop.spends.map((s) => <tr key={s.id}><td>{s.month}</td><td>{s.what}<br /><span className="mlo-note">Receipt: {s.proof}</span></td><td>{CHANNEL_LABELS[s.channel]}</td><td>{$(s.cents)}</td></tr>)}</tbody>
                  </table>
                ) : <p className="mlo-note">Nothing spent yet.</p>}
              </section>
            ) : null}

            {st.member ? (
              <section className="mlo-section" id="say">
                <h2>Your say</h2>
                <p className="mlo-note">How would you like your area&apos;s budget split? The plan is the average of every member&apos;s answer ({st.plan?.voters ?? 0} so far). Whole percents, adding to 100.</p>
                <form action={prefAction} className="mlo-split">
                  {COOP_CHANNELS.map((c) => (
                    <label key={c} className="mlo-field mlo-split__row">
                      <span>{CHANNEL_LABELS[c]}</span>
                      <input type="number" name={`pct_${c}`} min={0} max={100} step={1} defaultValue={st.myPref?.[c] ?? ""} className="mlo-input" inputMode="numeric" aria-label={`${CHANNEL_LABELS[c]} percent`} />
                    </label>
                  ))}
                  <button type="submit" className="mlo-btn">Save my split</button>
                </form>
                {st.plan && st.plan.rows.length ? (
                  <table className="mlo-table" style={{ marginTop: 14 }}>
                    <thead><tr><th>Channel</th><th>Members&apos; plan</th><th>Actually spent</th></tr></thead>
                    <tbody>{st.plan.rows.map((r) => <tr key={r.channel}><td>{CHANNEL_LABELS[r.channel]}</td><td>{r.planPct}%</td><td>{r.spentPct}%</td></tr>)}</tbody>
                  </table>
                ) : null}
                <form action={ideaAction} className="mlo-grid" style={{ marginTop: 18 }}>
                  <label className="mlo-field"><span>Suggest something local (a sponsorship, an event, a mailer)</span><textarea name="text" rows={2} maxLength={400} className="mlo-textarea" required /></label>
                  <label className="mlo-field"><span>Rough cost, $ (optional)</span><input name="dollars" type="number" min={0} step={1} className="mlo-input" style={{ maxWidth: 160 }} /></label>
                  <button type="submit" className="mlo-btn">Suggest it</button>
                </form>
                {st.ideas.length ? (
                  <ol className="mlo-list" style={{ marginTop: 12 }}>
                    {st.ideas.map((i) => <li key={i.id}>{i.text}{i.dollars ? ` (about $${i.dollars})` : ""} · <span className={`mlo-pill ${i.status === "declined" ? "mlo-pill--off" : ""}`}>{i.status === "open" ? "Waiting" : i.status === "approved" ? "Approved" : i.status === "done" ? "Done" : "Declined"}</span>{i.reply ? <span className="mlo-note"> · {i.reply}</span> : null}</li>)}
                  </ol>
                ) : null}
              </section>
            ) : null}

            <section className="mlo-section" id="national">
              <h2>National marketing</h2>
              <p className="mlo-note">{$(st.national.inCents)} in · {$(st.national.spentCents)} spent · {$(st.national.balanceCents)} available. The owner decides national spending; every member sees it.</p>
              {st.national.spends.length ? (
                <table className="mlo-table" style={{ marginTop: 10 }}>
                  <thead><tr><th>Month</th><th>What</th><th>Where</th><th>Cost</th></tr></thead>
                  <tbody>{st.national.spends.map((s) => <tr key={s.id}><td>{s.month}</td><td>{s.what}</td><td>{CHANNEL_LABELS[s.channel]}</td><td>{$(s.cents)}</td></tr>)}</tbody>
                </table>
              ) : null}
            </section>

            {admin ? (
              <>
                <section className="mlo-section" id="members">
                  <h2>Members (owner and team leads)</h2>
                  <table className="mlo-table">
                    <thead><tr><th>Who</th><th>Membership</th><th>This month</th></tr></thead>
                    <tbody>
                      {users.map((u) => {
                        const m = memberOf(u.id);
                        const b = balances.find((x) => x.id === u.id);
                        return (
                          <tr key={u.id}>
                            <th scope="row">{u.name}<br /><span className="mlo-note">{m?.recruitedBy ? `Brought in by ${nameOf(m.recruitedBy)}` : "Joined directly"}{b && (b.usable || b.held) ? ` · credit ${$(b.usable)}${b.held ? ` (+${$(b.held)} held)` : ""}` : ""}</span></th>
                            <td>
                              <form action={setMemberAction} className="mlo-row-form">
                                <input type="hidden" name="userId" value={u.id} />
                                <input name="area" defaultValue={m?.area ?? ""} placeholder="Service area" className="mlo-input" aria-label={`Area for ${u.name}`} required />
                                <input name="fee" type="number" min={0} step="0.01" defaultValue={m ? (m.feeCents / 100).toFixed(2) : ""} placeholder="Fee $" className="mlo-input" style={{ maxWidth: 110 }} aria-label={`Monthly fee for ${u.name}`} required />
                                <input name="joinedOn" type="date" defaultValue={m?.joinedOn ?? u.createdAt.slice(0, 10)} className="mlo-input" aria-label={`Joined on, ${u.name}`} required />
                                <select name="plan" defaultValue={m?.plan ?? "capped"} className="mlo-select" aria-label={`AI plan for ${u.name}`}>
                                  {(Object.keys(AI_PLANS) as (keyof typeof AI_PLANS)[]).map((p) => <option key={p} value={p}>{AI_PLANS[p].label} ({$(AI_PLANS[p].allowanceCents)} AI)</option>)}
                                </select>
                                <select name="recruitedBy" defaultValue={m?.recruitedBy ?? ""} className="mlo-select" aria-label={`Who brought ${u.name} in`}>
                                  <option value="">Joined directly</option>
                                  {users.filter((x) => x.id !== u.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                                <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Save</button>
                              </form>
                            </td>
                            <td>
                              {m ? (
                                <form action={paymentAction} className="mlo-row-form">
                                  <input type="hidden" name="userId" value={u.id} />
                                  <input name="month" type="month" defaultValue={month()} className="mlo-input" aria-label={`Month paid, ${u.name}`} required />
                                  <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Fee paid</button>
                                </form>
                              ) : <span className="mlo-note">Set up first</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {teamAi.length ? <p className="mlo-note">AI this month: {teamAi.sort((a, b) => b.costMicros - a.costMicros).map((t) => `${users.find((u) => u.id === t.userId)?.name ?? (t.userId.startsWith("mlo:") ? "Borrower chat (no account yet)" : "Someone")} ${$(Math.round(t.costMicros / 10_000))}`).join(" · ")} · total {$(Math.round(teamAi.reduce((n, t) => n + t.costMicros, 0) / 10_000))}</p> : null}
                  <p className="mlo-note">“Fee paid” uses their credit first, then sets aside the marketing shares and works out credit for whoever brought them in. Recorded payments can&apos;t be edited.</p>
                </section>

                <section className="mlo-section" id="coop">
                  <h2>Record marketing spending</h2>
                  <table className="mlo-table mlo-table--plain"><tbody>
                    {areaBudgets.map((b) => <tr key={b.area}><th scope="row">{b.area}</th><td>{$(b.balanceCents)} available · {b.plan.voters} {b.plan.voters === 1 ? "member has" : "members have"} set a split{b.plan.rows.length ? `: ${b.plan.rows.filter((r) => r.planPct).map((r) => `${CHANNEL_LABELS[r.channel]} ${r.planPct}%`).join(", ")}` : ""}</td></tr>)}
                    <tr><th scope="row">{NATIONAL}</th><td>{$(st.national.balanceCents)} available</td></tr>
                  </tbody></table>
                  <form action={spendAction} className="mlo-grid" style={{ marginTop: 12 }}>
                    <div className="mlo-row-form">
                      <select name="area" className="mlo-select" aria-label="Which budget" required defaultValue="">
                        <option value="" disabled>Which budget</option>
                        {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                        <option value={NATIONAL}>{NATIONAL}</option>
                      </select>
                      <input name="month" type="month" defaultValue={month()} className="mlo-input" aria-label="Month" required />
                      <input name="dollars" type="number" min={0} step="0.01" placeholder="Cost $" className="mlo-input" style={{ maxWidth: 120 }} aria-label="Cost in dollars" required />
                      <select name="channel" className="mlo-select" aria-label="Where it ran" required defaultValue="">
                        <option value="" disabled>Where it ran</option>
                        {COOP_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
                      </select>
                    </div>
                    <label className="mlo-field"><span>What it was</span><input name="what" className="mlo-input" maxLength={200} required /></label>
                    <label className="mlo-field"><span>Receipt (a link or invoice number)</span><input name="proof" className="mlo-input" maxLength={300} required /></label>
                    <label className="mlo-check"><input type="checkbox" name="locationOnly" value="yes" /> <span>For {PAID_AD_CHANNELS.map((c) => CHANNEL_LABELS[c].toLowerCase()).join(" and ")}: the ad uses the housing ad category and targets by location only (no age, gender, family status or ZIP exclusions), and shows the loan officer&apos;s NMLS number and Equal Housing Opportunity.</span></label>
                    <button type="submit" className="mlo-btn">Record spend</button>
                  </form>
                </section>

                <section className="mlo-section" id="sponsor">
                  <h2>Production share statement for the sponsor ({thisMonth})</h2>
                  <p className="mlo-note">The sponsoring company pays the production share through its payroll under its written compensation plan; LoanM8 never pays it. {productionOn() ? "The plan is on." : "The plan isn't approved yet, so this is for tracking only."}</p>
                  {sponsorThis && sponsorThis.lines.length ? (
                    <table className="mlo-table">
                      <thead><tr><th>Recruiter</th><th>Recruit</th><th>Level</th><th>Volume</th><th>Share</th></tr></thead>
                      <tbody>{sponsorThis.lines.map((l) => <tr key={`${l.recruiterUserId}-${l.recruitUserId}`}><td>{shareNames[l.recruiterUserId]}</td><td>{shareNames[l.recruitUserId]}</td><td>{l.level}</td><td>{$(l.volume * 100)}</td><td>{$(l.cents)}</td></tr>)}</tbody>
                    </table>
                  ) : <p className="mlo-note">Nothing this month yet.</p>}
                  <p className="mlo-note" style={{ marginTop: 8 }}><a href={`/api/cc/override/csv?month=${thisMonth}`}>Download this month&apos;s statement (CSV)</a> · <a href={`/api/cc/override/csv?month=${lastMonth}`}>last month</a></p>
                </section>

                <section className="mlo-section" id="ideas">
                  <h2>Members&apos; ideas ({allIdeas.length})</h2>
                  {allIdeas.length === 0 ? <p className="mlo-note">Nothing waiting.</p> : (
                    <ol className="cc-today">
                      {allIdeas.map((i) => (
                        <li key={i.id} className="cc-card">
                          <p className="cc-card__title">{i.area} · {nameOf(i.userId) || "A member"}{i.dollars ? ` · about $${i.dollars}` : ""} · {i.status === "open" ? "waiting" : "approved"}</p>
                          <p>{i.text}</p>
                          <form className="mlo-row-form">
                            <input name="reply" className="mlo-input" placeholder="Your reply (needed to decline)" maxLength={400} aria-label="Reply" />
                            {i.status === "open" ? <button type="submit" formAction={answerIdeaAction.bind(null, i.id, "approved")} className="mlo-btn" style={{ marginTop: 0 }}>Approve</button> : null}
                            {i.status === "approved" ? <button type="submit" formAction={answerIdeaAction.bind(null, i.id, "done")} className="mlo-btn" style={{ marginTop: 0 }}>Mark done</button> : null}
                            <button type="submit" formAction={answerIdeaAction.bind(null, i.id, "declined")} className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Decline</button>
                          </form>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
