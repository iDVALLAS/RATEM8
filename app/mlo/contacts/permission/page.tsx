import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { previewBulk } from "@/lib/contacts/bulk-consent";
import { dncNeeded, LINE_BATCH, linesNeeded, rndNeeded } from "@/lib/messaging/service";
import { lookupPriceUsd, twilioConfig } from "@/lib/messaging/twilio";
import { getImport, importPeople } from "@/lib/contacts/imports";
import { importCheckCopy as kc } from "@/lib/content/import-check";
import { FlashBox, MloNav } from "../../MloChrome";
import { bulkConsentAction, dncBulkAction, lineCheckImportAction, rndBulkAction } from "./actions";
import "../../mlo.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Record permission", robots: { index: false, follow: false } };

/** /mlo/contacts/permission — put the permission you already hold for past clients on file (D12.2). */
export default async function BulkPermission({ searchParams }: { searchParams: Promise<{ f?: string; since?: string; import?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const since = Number(sp.since) >= 1990 && Number(sp.since) <= 2100 ? Number(sp.since) : null;
  const p = me ? await previewBulk(me, since) : null;
  const need = me ? await rndNeeded(me) : [];
  // D75: "Check do-not-call and phone type for these N people" from an import's done screen: this section limited to its people.
  const run = me && /^imp_[A-Za-z0-9_-]{6,40}$/.test(sp.import ?? "") ? await getImport(me, sp.import!) : null;
  const people = me && run ? await importPeople(me, run.id) : null;
  const dncNeed = me ? await dncNeeded(me, new Date(), people ?? undefined) : [];
  const lineNeed = people ? linesNeeded(people) : [];
  const price = lookupPriceUsd();

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="permission" eyebrow={<><Link href="/mlo/contacts">← Contacts</Link></>} title="Record permission for past clients" />
        <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(sp.f)} />
        {!me || !p ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> first.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>{p.eligible.length} past {p.eligible.length === 1 ? "client" : "clients"} this would cover</h2>
              <p className="mlo-note">
                If your clients signed permission for calls and texts (for example, the consent in your loan application), record it here so your contact rules can see it. Each person gets an entry in their permission log saying where the proof is. It never overrides anyone who said stop.
              </p>
              <ul className="mlo-note" style={{ marginTop: 8, paddingLeft: "1.2em", listStyle: "disc" }}>
                {p.skipped.stopped ? <li>{p.skipped.stopped} left out: they said stop.</li> : null}
                {p.skipped.priorEmployer ? <li>{p.skipped.priorEmployer} left out: from a previous employer&apos;s system (permission given to another company doesn&apos;t carry over).</li> : null}
                {p.skipped.held ? <li>{p.skipped.held} left out: on hold.</li> : null}
              </ul>
              <form method="get" className="mlo-row-form">
                <label className="mlo-field"><span>Only loans closed in or after (optional)</span><input name="since" inputMode="numeric" defaultValue={since ?? ""} placeholder="2022" /></label>
                <button type="submit" className="mlo-btn mlo-btn--ghost">Update the count</button>
              </form>
            </section>

            <form action={bulkConsentAction} className="mlo-section mlo-grid">
              <h2>What they gave permission for</h2>
              <input type="hidden" name="since" value={since ?? ""} />
              <label className="mlo-check"><input type="checkbox" name="text" defaultChecked /> <span>Texts from me</span></label>
              <label className="mlo-check"><input type="checkbox" name="ai_call" /> <span>Recorded or AI-voice calls (voicemail drops and M8)</span></label>
              <label className="mlo-check"><input type="checkbox" name="service" defaultChecked /> <span>About their loan or account</span></label>
              <label className="mlo-check"><input type="checkbox" name="marketing" defaultChecked /> <span>Offers and check-ins</span></label>
              <label className="mlo-field"><span>How they gave it</span>
                <select name="evidence" defaultValue="written">
                  <option value="written">Signed (on paper or e-signed)</option>
                  <option value="web_form">A web form or online application checkbox</option>
                </select>
              </label>
              <label className="mlo-field"><span>Where the proof is</span><input name="proof" required minLength={12} maxLength={400} placeholder="Call and text consent in our loan application, e-signed at application; copies in ARIVE" /></label>
              <h2 style={{ marginTop: 8 }}>Confirm</h2>
              <label className="mlo-check"><input type="checkbox" name="namesUs" /> <span>The permission names me or my current company (not a previous employer) and covers this phone number.</span></label>
              <label className="mlo-check"><input type="checkbox" name="canProduce" /> <span>I can produce a copy for any of these clients if asked.</span></label>
              <label className="mlo-check"><input type="checkbox" name="coversAiVoice" /> <span>For M8 calls: it covers calls made with an artificial, prerecorded or AI voice.</span></label>
              <p className="mlo-note">Texts and M8 calls still follow everything else in your contact rules: do-not-call checks, daily limits, quiet hours and your licensed states. A client can still say stop at any time, and it ends texts and calls at once.</p>
              <div><button type="submit" className="mlo-btn">Record permission for {p.eligible.length} {p.eligible.length === 1 ? "client" : "clients"}</button></div>
            </form>

            {run && people ? (
              <section className="mlo-section mlo-grid" id="lines">
                <h2>{kc.title(people.filter((c) => c.phone).length)}</h2>
                <p className="mlo-note">{kc.lead(run.files.join(", "))} <Link href="/mlo/contacts/permission#dnc">{kc.whole}</Link></p>
                <h3 className="cc-card__title">{kc.lineTitle}</h3>
                {lineNeed.length ? (
                  <>
                    <p className="mlo-note">{kc.lineNote(lineNeed.length, `$${(lineNeed.length * price).toFixed(2)}`, `$${price.toFixed(3)}`, LINE_BATCH)}</p>
                    {twilioConfig() ? (
                      <form action={lineCheckImportAction.bind(null, run.id)} className="mlo-actions">
                        <button type="submit" className="mlo-btn">{kc.lineButton(Math.min(LINE_BATCH, lineNeed.length), `$${(Math.min(LINE_BATCH, lineNeed.length) * price).toFixed(2)}`)}</button>
                      </form>
                    ) : <p className="mlo-note">{kc.noTwilio} <Link href="/mlo/setup-help?topic=texting">{kc.setUp}</Link></p>}
                  </>
                ) : <p className="mlo-note">{kc.linesDone}</p>}
              </section>
            ) : null}
            <form action={dncBulkAction} className="mlo-section mlo-grid" id="dnc">
              {run ? <input type="hidden" name="import" value={run.id} /> : null}
              <h2>{run ? kc.dncTitle : "Do-not-call checks for your whole book"}</h2>
              <p className="mlo-note">Marketing calls and texts need a do-not-call check from the last 31 days. Upload this list to your DNC vendor (or the National Do Not Call Registry for your subscription), then paste the results here: one line each, <code>phone, yes or no</code> (yes = on a list). Include your state lists (for example, Texas) in the scrub.</p>
              {dncNeed.length ? (
                <details className="mlo-note"><summary>{dncNeed.length} {dncNeed.length === 1 ? "number needs" : "numbers need"} a check: copy this list to upload</summary><pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{dncNeed.map((n) => n.phone).join("\n")}</pre></details>
              ) : <p className="mlo-note">Every number in your book has a current check.</p>}
              <label className="mlo-field"><span>Results</span><textarea name="rows" rows={4} placeholder={"(206) 555-1234, no\n(425) 555-2222, yes"} /></label>
              <label className="mlo-field"><span>Checked with</span><input name="source" maxLength={120} placeholder="Your DNC vendor, with state lists" /></label>
              <div><button type="submit" className="mlo-btn">Record results</button></div>
            </form>

            <form action={rndBulkAction} className="mlo-section mlo-grid" id="rnd">
              <h2>Then: check for reassigned numbers</h2>
              <p className="mlo-note">Permission from an old application counts from when the loan closed. Before texts or M8 calls go to a number whose permission is more than 90 days old, check the FCC Reassigned Numbers Database (reassigned.us, or your vendor) from that date. Upload your list there, then paste the results here: one line each, <code>phone, date checked from, answer</code> (yes = disconnected since, no, or no data). A check is good for 30 days.</p>
              {need.length ? (
                <details className="mlo-note"><summary>{need.length} {need.length === 1 ? "number needs" : "numbers need"} a check: copy this list to upload</summary><pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{need.map((n) => `${n.phone},${n.since}`).join("\n")}</pre></details>
              ) : <p className="mlo-note">No numbers need a check right now.</p>}
              <label className="mlo-field"><span>Results</span><textarea name="rows" rows={4} placeholder={"(206) 555-1234, 2021-04-01, no\n(425) 555-2222, 2022-03-02, yes"} /></label>
              <label className="mlo-field"><span>Checked with</span><input name="source" maxLength={120} placeholder="FCC Reassigned Numbers Database" /></label>
              <div><button type="submit" className="mlo-btn">Record results</button></div>
            </form>
          </>
        )}
      </div>
    </PageShell>
  );
}
