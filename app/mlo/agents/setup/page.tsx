import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { teamStore, type Source } from "@/lib/agents/store";
import { goalPlan, playbookStatus } from "@/lib/agents/service";
import { AGENTS } from "@/lib/agents/team";
import { GIFT_RULES } from "@/lib/agents/runner";
import { FlashBox } from "../../MloChrome";
import { listingsAction, newAgentsAction, playbookAction, settingsAction } from "../actions";
import "../../mlo.css";
import "../agents.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your team", robots: { index: false, follow: false } };

const SOURCE_LABELS: Record<Source, string> = {
  book: "My own book: anniversaries, past clients gone quiet, refi watch, permission to ask",
  leads: "New web leads: answered in minutes",
  partners: "Realtor partners: a steady touch with agents you work with",
  listings: "Canceled and expired listings: reach the listing agent (from a list you add below)",
  new_agents: "Agents new to the area: a welcome (from a list you add below)",
  relocation: "Relocation: a monthly plan for brokerage relocation desks and local employers",
  mail: "Mail to new neighborhoods: a quarterly idea from Marketing; Thanks.io finds and prices the homes, and nothing is bought until you say yes",
};

/** /mlo/agents/setup — turn the team on, choose where it looks, goals, gifts, playbooks and lists (D54). */
export default async function TeamSetup({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  if (!me) {
    return (
      <PageShell>
        <div className="mlo-wrap"><h1 className="tagline text-4xl">Set up your team</h1><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> first.</p></div>
      </PageShell>
    );
  }
  const s = await teamStore().settings(me.id);
  const pbs = playbookStatus(s);
  const g = s.goals;
  const plan = goalPlan(g);
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="mlo-note"><Link href="/mlo/agents">← AI assistants</Link></p>
        <h1 className="tagline text-4xl">Set up your team</h1>
        <FlashBox flash={decodeFlash(f)} />

        <form action={settingsAction}>
          <section className="mlo-section" aria-labelledby="on-h">
            <h2 id="on-h" className="text-xl">Run the team</h2>
            <div className="ag-checks" style={{ marginTop: 8 }}>
              <label><input type="checkbox" name="enabled" defaultChecked={s.enabled} /> On: plan every morning, send approved playbooks at midday</label>
            </div>
            <p className="mlo-note">Messages only go out on their own from playbooks you approve below, and every one passes Compliance and your contact rules (permission, do-not-call, quiet hours, state rules). Everything else waits for you. Money is never spent without your yes.</p>
            <label className="mlo-field" style={{ maxWidth: 320, marginTop: 10 }}>
              <span>Most automatic sends a day</span>
              <input name="dailySends" className="mlo-input" inputMode="numeric" defaultValue={s.dailySends} />
            </label>
            <label className="mlo-field" style={{ maxWidth: 420 }}>
              <span>Your market, as messages should name it</span>
              <input name="area" className="mlo-input" maxLength={40} defaultValue={s.area} placeholder="Bellevue, the Eastside, Phoenix…" />
            </label>
          </section>

          <section className="mlo-section" aria-labelledby="src-h">
            <h2 id="src-h" className="text-xl">Where your {AGENTS.finder.name} looks</h2>
            <div className="ag-checks" style={{ marginTop: 8, display: "grid", gap: 4 }}>
              {(Object.keys(SOURCE_LABELS) as Source[]).map((k) => (
                <label key={k}><input type="checkbox" name="sources" value={k} defaultChecked={s.sources.includes(k)} /> {SOURCE_LABELS[k]}</label>
              ))}
            </div>
          </section>

          <section className="mlo-section" aria-labelledby="goals" id="goals">
            <h2 className="text-xl">Your goals (for the Coach)</h2>
            <div className="mlo-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", display: "grid", gap: 10, marginTop: 8 }}>
              <label className="mlo-field"><span>Yearly income goal ($)</span><input name="yearlyIncome" className="mlo-input" inputMode="numeric" defaultValue={g.yearlyIncome || ""} placeholder="e.g. 250000" /></label>
              <label className="mlo-field"><span>Your income per closed loan ($)</span><input name="incomePerLoan" className="mlo-input" inputMode="numeric" defaultValue={g.incomePerLoan || ""} placeholder="e.g. 4500" /></label>
              <label className="mlo-field"><span>Applications that close (%)</span><input name="appToClose" className="mlo-input" inputMode="numeric" defaultValue={g.appToClose} /></label>
              <label className="mlo-field"><span>Conversations that become applications (%)</span><input name="talkToApp" className="mlo-input" inputMode="numeric" defaultValue={g.talkToApp} /></label>
              <label className="mlo-field"><span>Partner touches a week</span><input name="partnerTouchesPerWeek" className="mlo-input" inputMode="numeric" defaultValue={g.partnerTouchesPerWeek} /></label>
            </div>
            <p className="mlo-note" style={{ marginTop: 8 }}>{plan ? `That works out to about ${plan.loansPerYear} loans a year: ${plan.loansPerWeek} closing${plan.loansPerWeek === 1 ? "" : "s"}, ${plan.appsPerWeek} applications and ${plan.talksPerWeek} conversations a week (48 working weeks).` : "Fill in the first two and your Coach works them back to weekly numbers."}</p>
          </section>

          <section className="mlo-section" aria-labelledby="gift-h">
            <h2 id="gift-h" className="text-xl">Gifts and lunches</h2>
            <div className="ag-checks" style={{ marginTop: 8 }}>
              <label><input type="checkbox" name="gifts" defaultChecked={s.gifts} /> Suggest closing gifts, holiday thank-yous and lunches (each waits for your yes)</label>
            </div>
            <ul className="mlo-list">
              <li><strong>Closing gifts:</strong> {GIFT_RULES.closing}</li>
              <li><strong>Holiday thank-yous to agents:</strong> {GIFT_RULES.holiday}</li>
              <li><strong>Lunches:</strong> {GIFT_RULES.lunch}</li>
              <li>Never a gift card or cash for an agent, and never mentioned in a message. Each one is logged with its value and added to your expenses (gifts count up to $25 per person a year for taxes).</li>
            </ul>
            <label className="mlo-field" style={{ maxWidth: 320, marginTop: 10 }}>
              <span>Most per agent per year ($, optional)</span>
              <input name="giftCap" className="mlo-input" inputMode="numeric" defaultValue={s.giftCapCents ? s.giftCapCents / 100 : ""} placeholder="Your sponsor's limit, if any" />
            </label>
          </section>

          <div className="mlo-row-form" style={{ marginTop: 14 }}>
            <button type="submit" className="mlo-btn">Save</button>
          </div>
        </form>

        <section className="mlo-section" id="playbooks" aria-labelledby="pb-h">
          <h2 id="pb-h" className="text-xl">Playbooks</h2>
          <p className="mlo-note">Approve one and your team may send it on its own when it fits, through your contact rules. Until then it shows up as a draft for you to send. Your email signature and the required lines (NMLS, company, Equal Housing, a way to stop) are added to every email.</p>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {pbs.map((p) => (
              <div key={p.id} className="ag-pb">
                <div className="mlo-row-form" style={{ justifyContent: "space-between" }}>
                  <strong>{p.label}</strong>
                  <span className={`ag-badge ag-badge--${p.agent}`}>{AGENTS[p.agent].name} · {p.channel}</span>
                </div>
                <p className="mlo-note" style={{ margin: 0 }}>When: {p.when}</p>
                <pre>{p.subject ? `Subject: ${p.subject}\n\n` : ""}{p.body}</pre>
                <div className="mlo-row-form">
                  {p.approved ? (
                    <>
                      <span className="mlo-note">Approved: sends on its own.</span>
                      <form action={playbookAction.bind(null, p.id, false)}><button type="submit" className="mlo-btn mlo-btn--ghost">Take back</button></form>
                    </>
                  ) : (
                    <>
                      {p.stale ? <span className="mlo-note">The wording changed since you approved it.</span> : null}
                      <form action={playbookAction.bind(null, p.id, true)}><button type="submit" className="mlo-btn">Approve</button></form>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mlo-section" id="lists" aria-labelledby="lists-h">
          <h2 id="lists-h" className="text-xl">Lists for your team</h2>
          <form action={listingsAction} className="mlo-grid" style={{ marginTop: 8 }}>
            <label className="mlo-field">
              <span>Canceled or expired listings (CSV): an MLS hot sheet or a vendor export with the address and the listing agent&apos;s name, email and phone</span>
              <input type="file" name="file" accept=".csv,text/csv" className="mlo-input" required />
            </label>
            <button type="submit" className="mlo-btn mlo-btn--ghost">Add listings</button>
          </form>
          <form action={newAgentsAction} className="mlo-grid" style={{ marginTop: 14 }}>
            <label className="mlo-field">
              <span>Agents new to the area (CSV): a roster from your MLS or a brokerage, with name and email or phone</span>
              <input type="file" name="file" accept=".csv,text/csv" className="mlo-input" required />
            </label>
            <button type="submit" className="mlo-btn mlo-btn--ghost">Add new agents</button>
          </form>
          <p className="mlo-note" style={{ marginTop: 10 }}>Your team never uses RETR production numbers: RETR&apos;s terms bar using its data in automated processes. It works only from your own history with agents you add here or who worked a loan with you.</p>
        </section>
      </div>
    </PageShell>
  );
}
