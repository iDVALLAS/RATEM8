import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { automationStore } from "@/lib/automations/store";
import { GROUP_LABELS, RECIPES, type Recipe } from "@/lib/automations/recipes";
import { FlashBox, MloNav } from "../MloChrome";
import { runNowAction, saveAutomationsAction } from "./actions";
import PageHead from "../PageHead";
import AutonomyToggle from "../AutonomyToggle";
import AutomationsForm from "./AutomationsForm";
import { AUTOMATIONS, SUBS } from "@/lib/content/cc-pages";
import { firedLabel, firedOutcome, groupCount, rowMode, SHARED_OF, whenOf, type SharedCap } from "@/lib/automations/rows";
import { autonomyOf } from "@/lib/loa/service";
import { canChangeSwitches, capByKey, officerMode, type Mode } from "@/lib/loa/autonomy";
import "../autonomy-toggle.css";
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
  const [settings, recent, a] = me ? await Promise.all([automationStore().settings(me.id), automationStore().recent(me.id, 25), autonomyOf(me.id).catch(() => null)]) : [null, [], null];
  // D76: what the borrower and agent rows show for "how it goes out", read from the LOA's shared switches.
  const shared: Partial<Record<SharedCap, Mode>> = {};
  const split: Partial<Record<SharedCap, boolean>> = {};
  for (const cap of ["client_updates", "agent_updates"] as const) {
    const c = capByKey(cap);
    const ms = a ? (["purchase", "refi"] as const).filter((t) => c.applies[t]).map((t) => officerMode(c, t, a.modes)) : [];
    shared[cap] = ms.length && ms.every((m) => m === "auto") ? "auto" : "approve";
    split[cap] = new Set(ms.filter((m) => m !== "off")).size > 1;
  }
  const mayAuto = !!me && canChangeSwitches(me, me.id);
  const example = (r: Recipe) => (r.body ? r.body({ first: r.to === "agent" ? "Pat" : "Ann", me: me?.name.split(/\s+/)[0] ?? "", client: "Ann" }) : r.task ? `Reminder: ${r.task({ first: "Ann", client: "Ann" })}` : "");

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="automations" title="Automations" sub={SUBS.automations} how={<p className="mlo-note">{AUTOMATIONS.how} Drafts land on your <Link href="/mlo/concierge#drafts">Concierge desk</Link>, and each text still goes through your contact rules.</p>} />
        <MloNav current="automations" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {!me || !settings ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to set up automations.</p></section>
        ) : (
          <>
            <AutomationsForm action={saveAutomationsAction}>
              {GROUPS.map((g) => {
                const n = groupCount(g, settings.enabled);
                const cap = SHARED_OF[g];
                return (
                  <details className="mlo-section cc-fold cc-autogroup" key={g} id={g} data-count="" data-shared={cap}>
                    <summary className="cc-sechead">
                      <h2>{GROUP_LABELS[g]} <span className="mlo-note cc-autogroup__n" data-count-out="">{AUTOMATIONS.count(n.on, n.all)}</span></h2>
                      <span className="cc-fold__arrow" aria-hidden="true" />
                    </summary>
                    {g === "agent_updates" ? <p className="mlo-note">Only for clients whose page says their agent may be kept updated (Contacts → the client → “Updates to their agent”). Their agent also needs texting permission of their own.</p> : null}
                    {cap ? <p className="mlo-note">{AUTOMATIONS.shared}{split[cap] ? ` ${AUTOMATIONS.split}` : ""} <Link href="/mlo/loa#autopilot">Your LOA&apos;s switches</Link>.</p> : null}
                    <ul className="cc-autorows">
                      {RECIPES.filter((r) => r.group === g).map((r) => {
                        const mode = rowMode(r, settings.enabled, shared);
                        // A disabled radio isn't sent, so the one that's chosen is never disabled.
                        const reason = mode === "auto" ? undefined : !cap ? AUTOMATIONS.noAuto : !mayAuto ? "Only the loan officer can change Full-auto." : undefined;
                        return (
                          <li key={r.id} className="cc-autorow" data-row="">
                            <div className="cc-autorow__text">
                              <strong>{r.label.replace(/^(Borrower|Agent): /, "")}</strong>
                              <span className="mlo-note">{whenOf(r)}{r.purpose === "marketing" ? " · needs marketing permission" : ""}</span>
                            </div>
                            <AutonomyToggle name={r.id} label={r.label} value={mode} disabled={reason ? { auto: reason } : undefined} idBase={`au-${r.id}`} />
                            <details className="cc-autorow__preview">
                              <summary>{AUTOMATIONS.preview}</summary>
                              <p className="mlo-note">{r.description} {example(r)}</p>
                            </details>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </AutomationsForm>
            <form action={runNowAction} className="mlo-actions"><button type="submit" className="mlo-btn mlo-btn--ghost">Check my book now</button></form>

            <section className="mlo-section" id="recent">
              <h2>Recently fired</h2>
              {recent.length === 0 ? <p className="mlo-note">Nothing yet.</p> : (
                <table className="mlo-table mlo-table--plain">
                  <tbody>
                    {recent.map((x) => (
                      <tr key={x.key}>
                        <th scope="row">{x.contactId ? <Link href={`/mlo/contacts/${x.contactId}`}>{firedLabel(x.recipeId)}</Link> : x.loanId ? <Link href={`/mlo/pipeline/${x.loanId}#loa`}>{firedLabel(x.recipeId)}</Link> : firedLabel(x.recipeId)}</th>
                        <td className="mlo-note">{firedOutcome(x.outcome)}</td>
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
