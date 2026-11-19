import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { automationStore } from "@/lib/automations/store";
import { GROUP_LABELS, RECIPES, recipeById, type Recipe } from "@/lib/automations/recipes";
import { FlashBox, MloNav } from "../MloChrome";
import { runNowAction, saveAutomationsAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automations", robots: { index: false, follow: false } };

const GROUPS = Object.keys(GROUP_LABELS) as Recipe["group"][];

/** /mlo/automations — loan updates and ready-made follow-up (D10). */
export default async function Automations({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const [settings, recent] = me ? await Promise.all([automationStore().settings(me.id), automationStore().recent(me.id, 25)]) : [null, []];
  const example = (r: Recipe) => (r.body ? r.body({ first: r.to === "agent" ? "Pat" : "Ann", me: me?.name.split(/\s+/)[0] ?? "", client: "Ann" }) : r.task ? `Reminder: ${r.task({ first: "Ann", client: "Ann" })}` : "");

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Automations</h1>
        <MloNav current="automations" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me || !settings ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to set up automations.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>Follow-up that runs itself, and waits for your OK</h2>
              <p className="mlo-note">
                Turn on what you want. When a loan moves in your loan system, the right update is drafted for the borrower (and their agent, if the client said so). After closing and for new contacts, the morning run sets drafts and reminders. Everything lands on your <Link href="/mlo/concierge#drafts">Concierge desk</Link>: nothing is sent until you approve it, and each text still goes through your contact rules. Updates never give a date, an approval or a rate.
              </p>
            </section>
            <form action={saveAutomationsAction}>
              {GROUPS.map((g) => (
                <section className="mlo-section" key={g}>
                  <h2>{GROUP_LABELS[g]}</h2>
                  {g === "agent_updates" ? <p className="mlo-note">Only for clients whose page says their agent may be kept updated (Contacts → the client → “Updates to their agent”). Their agent also needs texting permission of their own.</p> : null}
                  <div className="mlo-grid">
                    {RECIPES.filter((r) => r.group === g).map((r) => (
                      <label key={r.id} className="mlo-check">
                        <input type="checkbox" name={r.id} defaultChecked={settings.enabled.includes(r.id)} />
                        <span>
                          <strong>{r.label}.</strong> {r.description}
                          <br />
                          <span className="mlo-note">{example(r)}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
              <div><button type="submit" className="mlo-btn">Save</button></div>
            </form>
            <form action={runNowAction}><button type="submit" className="mlo-btn mlo-btn--ghost">Check my book now</button></form>

            <section className="mlo-section" id="recent">
              <h2>Recently fired</h2>
              {recent.length === 0 ? <p className="mlo-note">Nothing yet.</p> : (
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {recent.map((x) => (
                      <tr key={x.key}>
                        <th scope="row">{x.contactId ? <Link href={`/mlo/contacts/${x.contactId}`}>{recipeById(x.recipeId)?.label ?? x.recipeId}</Link> : recipeById(x.recipeId)?.label ?? x.recipeId}</th>
                        <td className="mlo-note">{x.outcome === "drafted" ? "draft on your desk" : "reminder set"}</td>
                        <td className="mlo-note">{new Date(x.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
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
