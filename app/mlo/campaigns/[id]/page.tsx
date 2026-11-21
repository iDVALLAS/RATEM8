import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { campaignStore } from "@/lib/campaigns/store";
import { checkCampaign } from "@/lib/campaigns/service";
import { contactStore } from "@/lib/contacts/store";
import { companyOfMlo, singleCompany } from "@/lib/accounts/company";
import { twilioConfig } from "@/lib/messaging/twilio";
import { textSender } from "@/lib/texting/service";
import { emailReadyFor } from "@/lib/messaging/email";
import { FlashBox } from "../../MloChrome";
import Editor from "../Editor";
import { campaignStatusAction, deleteCampaignAction, enrollGroupAction, saveCampaignAction, stopEnrollmentAction } from "../actions";
import "../../mlo.css";
import "../campaigns.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campaign", robots: { index: false, follow: false } };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

/** /mlo/campaigns/[id] — edit a campaign, turn it on, and see who's in it (D51). */
export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string }> }) {
  const [{ id }, { f }] = await Promise.all([params, searchParams]);
  const v = await requireViewer();
  const me = v.user;
  const c = me ? await campaignStore().getCampaign(id) : null;
  if (!me || !c || c.ownerUserId !== me.id) notFound();
  const people = (await campaignStore().enrollments(c.id)).slice(0, 300);
  const names = new Map(await Promise.all(people.map(async (e) => [e.contactId, await contactStore().get(e.contactId)] as const)));
  const problem = checkCampaign(c);
  const textReady = !!twilioConfig() && !!(await textSender(companyOfMlo(me.mloId), singleCompany()));
  const active = people.filter((e) => e.status === "active").length;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="mlo-note"><Link href="/mlo/campaigns">← Campaigns</Link></p>
        <div className="cp-head">
          <div>
            <h1 className="tagline text-4xl">{c.name}</h1>
            <p className="mlo-note"><span className={`cp-status cp-status--${c.status}`}>{c.status === "active" ? "On" : c.status === "paused" ? "Paused" : "Draft"}</span> {active} {active === 1 ? "person" : "people"} in it</p>
          </div>
          <div className="mlo-row-form">
            {c.status === "active"
              ? <form action={campaignStatusAction.bind(null, c.id, "paused")}><button type="submit" className="mlo-btn mlo-btn--ghost">Pause</button></form>
              : <form action={campaignStatusAction.bind(null, c.id, "active")}><button type="submit" className="mlo-btn" disabled={!!problem}>Turn it on</button></form>}
          </div>
        </div>
        <FlashBox flash={decodeFlash(f)} />
        {problem && c.status !== "active" ? <p className="mlo-flash mlo-flash--err">Before it can run: {problem}</p> : null}

        <Editor campaign={c} action={saveCampaignAction.bind(null, c.id)} textReady={textReady} emailReady={(await emailReadyFor(me)).ready} />

        <section className="mlo-section" id="people">
          <h2>People in it</h2>
          {c.trigger === "new_lead" ? <p className="mlo-note">New leads go in automatically the moment they arrive, and steps due right away go out then. You can also add people below.</p> : null}
          <form action={enrollGroupAction.bind(null, c.id)} className="mlo-row-form" style={{ marginTop: 8 }}>
            <select name="group" className="mlo-select" aria-label="Who to add" defaultValue="past_client">
              <option value="past_client">All past clients</option>
              <option value="lead">All leads</option>
              <option value="sphere">Everyone in my sphere</option>
              <option value="agent">All agents</option>
              <option value="other">Everyone else</option>
            </select>
            <button type="submit" className="mlo-btn mlo-btn--ghost">Add them</button>
          </form>
          <p className="mlo-note">People already in this campaign aren&apos;t added twice. Anyone without permission for a step&apos;s channel is skipped for that step, and the reason is shown here.</p>
          {people.length === 0 ? <p className="mlo-note" style={{ marginTop: 10 }}>Nobody yet.</p> : (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="mlo-table">
                <thead><tr><th>Who</th><th>Where they are</th><th>Last step</th><th></th></tr></thead>
                <tbody>
                  {people.map((e) => {
                    const p = names.get(e.contactId);
                    const last = e.log[e.log.length - 1];
                    return (
                      <tr key={e.id}>
                        <td>{p ? <Link href={`/mlo/contacts/${p.id}`}>{[p.firstName, p.lastName].filter(Boolean).join(" ") || "(no name)"}</Link> : "(removed)"}</td>
                        <td>{e.status === "active" ? `Step ${Math.min(e.stepIndex + 1, c.steps.length)} of ${c.steps.length}, ${when(e.nextAt)}` : e.status === "done" ? "Finished" : `Stopped: ${e.reason}`}</td>
                        <td className="mlo-note">{last ? `${when(last.at)} · ${last.note}` : "Nothing yet"}</td>
                        <td>{e.status === "active" ? <form action={stopEnrollmentAction.bind(null, c.id, e.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Take out</button></form> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <details className="mlo-details" style={{ marginTop: 16 }}>
          <summary>Delete this campaign</summary>
          <form action={deleteCampaignAction.bind(null, c.id)}>
            <p className="mlo-note">Everyone in it is taken out, and it can&apos;t be undone. Messages already sent stay on each person&apos;s page.</p>
            <button type="submit" className="mlo-btn mlo-btn--ghost">Delete campaign</button>
          </form>
        </details>
      </div>
    </PageShell>
  );
}
