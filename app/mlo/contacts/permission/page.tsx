import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { previewBulk } from "@/lib/contacts/bulk-consent";
import { FlashBox, MloNav } from "../../MloChrome";
import { bulkConsentAction } from "./actions";
import "../../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Record permission", robots: { index: false, follow: false } };

/** /mlo/contacts/permission — put the permission you already hold for past clients on file (D12.2). */
export default async function BulkPermission({ searchParams }: { searchParams: Promise<{ f?: string; since?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const me = v.user;
  const since = Number(sp.since) >= 1990 && Number(sp.since) <= 2100 ? Number(sp.since) : null;
  const p = me ? await previewBulk(me, since) : null;

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow"><Link href="/mlo/contacts">← Contacts</Link></p>
        <h1 className="tagline text-4xl">Record permission for past clients</h1>
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
              <label className="mlo-check"><input type="checkbox" name="ai_call" /> <span>Calls from M8 (an AI voice)</span></label>
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
          </>
        )}
      </div>
    </PageShell>
  );
}
