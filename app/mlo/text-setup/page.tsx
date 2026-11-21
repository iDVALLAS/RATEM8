import type { Metadata } from "next";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { singleCompany } from "@/lib/accounts/company";
import { mloById } from "@/lib/config";
import { companyDetails } from "@/lib/accounts/company";
import { BUSINESS_TYPES, JOB_POSITIONS, textingStore, type TextingSetup } from "@/lib/texting/store";
import { companyFor, FEES, stepsOf, textSender, textSetupOn } from "@/lib/texting/service";
import { FlashBox } from "../MloChrome";
import { checkTextingAction, fixAndRetryTextingAction, saveTextingAction } from "./actions";
import "../mlo.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Texting for your company", robots: { index: false, follow: false } };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "");

const STATUS: Record<TextingSetup["status"], string> = {
  draft: "Saved, not sent yet",
  review: "Waiting for the platform owner to approve",
  working: "Registering. Steps that wait on the carriers are checked each morning.",
  live: "Texting is on",
  attention: "Stopped: needs a look",
  stopped: "Turned off by the platform owner",
};

/** /mlo/text-setup — Command Center registers your company for business texting (D56). */
export default async function TextSetupPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const shell = (body: React.ReactNode) => (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="textsetup" title="Texting for your company" />
        <FlashBox flash={decodeFlash(sp.f)} />
        {body}
      </div>
    </PageShell>
  );
  if (!me) return shell(<section className="mlo-section"><p className="mlo-note">Sign in with your own account to set up texting for your company.</p></section>);
  const co = companyFor(me);
  if (!co) return shell(<section className="mlo-section"><p className="mlo-note">Your account isn&apos;t linked to a loan officer record yet. Ask the platform owner to link it on Team.</p></section>);

  const [s, sender] = await Promise.all([textingStore().get(co.company), textSender(co.company, singleCompany())]);
  const byHand = !!sender && !sender.account;
  const editable = !s || ["draft", "review", "attention", "stopped"].includes(s.status);
  const isOwner = me.role === "owner";
  const m = mloById(me.mloId);
  // Prefill from what Command Center already knows about the company.
  const parts = co.address.split(",").map((x) => x.trim()).filter(Boolean);
  const stateZip = parts.length >= 3 ? parts[parts.length - 1].match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/) : null;
  const guess = { legalName: companyDetails(m).names[0] ?? "", street: stateZip ? parts.slice(0, -2).join(", ") : "", city: stateZip ? parts[parts.length - 2] : "", state: stateZip?.[1] ?? "", zip: stateZip?.[2] ?? "" };
  const i = s?.info;
  const val = (k: keyof NonNullable<typeof i>, d = "") => (i ? String(i[k] ?? "") : d);

  return shell(
    <>
      <p className="mlo-note" style={{ maxWidth: 700 }}>
        To text clients, carriers require {co.name} to register as a business that texts (10DLC): the company, with its EIN, and what it texts and how people agree to it. Command Center does the registering for you. Fill this in once; every loan officer at {co.name} then texts from the company&apos;s registered number.
      </p>

      {byHand ? (
        <section className="mlo-section">
          <h2>Texting is already set up for {co.name}</h2>
          <p className="mlo-note">The platform owner registered it by hand. Nothing to do here.</p>
        </section>
      ) : null}

      {s ? (
        <section className="mlo-section" id="status">
          <h2>{STATUS[s.status]}</h2>
          {s.status === "attention" ? <div className="mlo-flash mlo-flash--err" role="alert"><p>{s.error}</p></div> : null}
          <ol className="mlo-steps" style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
            {stepsOf(s).map((x) => <li key={x.label}><span aria-hidden>{x.done ? "✓" : "○"}</span> {x.label}<span className="sr-only">{x.done ? " (done)" : " (not yet)"}</span></li>)}
          </ol>
          {s.status === "working" ? <form action={checkTextingAction.bind(null, s.company, "/mlo/text-setup#status")}><button type="submit" className="mlo-btn mlo-btn--ghost">Check now</button></form> : null}
          {s.checkedAt ? <p className="mlo-note">Last checked {when(s.checkedAt)}.</p> : null}
          {s.log.length ? (
            <details>
              <summary className="mlo-note">What happened so far</summary>
              <ul className="mlo-note" style={{ paddingLeft: 18 }}>{[...s.log].reverse().map((l, n) => <li key={n}>{when(l.at)}: {l.text}</li>)}</ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {!byHand && !textSetupOn() ? (
        <section className="mlo-section">
          <p className="mlo-note">{isOwner ? "Before anyone's company can be registered here, set up the platform's own Twilio account: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and your approved primary business profile in Twilio Trust Hub (TWILIO_PRIMARY_PROFILE_SID). See the launch checklist." : "The platform owner hasn't finished setting up texting registration yet. You can fill this in now; it starts once they have."}</p>
        </section>
      ) : null}

      {!byHand && editable ? (
        <section className="mlo-section" id="details">
          <h2>{co.name}&apos;s details</h2>
          <form className="mlo-grid">
            <p className="mlo-note">Exactly as the IRS has them (the carriers check the EIN against the legal name and address).</p>
            <label className="mlo-field"><span>Legal name</span><input name="legalName" className="mlo-input" required maxLength={120} defaultValue={val("legalName", guess.legalName)} /></label>
            <label className="mlo-field"><span>EIN</span><input name="ein" className="mlo-input" required inputMode="numeric" placeholder="12-3456789" defaultValue={val("ein")} autoComplete="off" /></label>
            <label className="mlo-field"><span>Legal form</span>
              <select name="businessType" className="mlo-select" defaultValue={val("businessType", "Limited Liability Corporation")}>{BUSINESS_TYPES.map((b) => <option key={b}>{b}</option>)}</select>
            </label>
            <label className="mlo-field"><span>Ownership</span>
              <select name="companyType" className="mlo-select" defaultValue={val("companyType", "private")}><option value="private">Privately held</option><option value="non-profit">Non-profit</option></select>
            </label>
            <label className="mlo-field"><span>Company website</span><input name="website" type="url" className="mlo-input" required placeholder="https://" defaultValue={val("website")} /></label>
            <label className="mlo-field"><span>Privacy policy page (it should say phone numbers aren&apos;t shared for marketing)</span><input name="privacyUrl" type="url" className="mlo-input" required placeholder="https://" defaultValue={val("privacyUrl")} /></label>
            <label className="mlo-field"><span>Street</span><input name="street" className="mlo-input" required defaultValue={val("street", guess.street)} /></label>
            <div className="mlo-row-form">
              <label className="mlo-field"><span>City</span><input name="city" className="mlo-input" required defaultValue={val("city", guess.city)} /></label>
              <label className="mlo-field"><span>State</span><input name="state" className="mlo-input" required maxLength={2} size={3} defaultValue={val("state", guess.state)} /></label>
              <label className="mlo-field"><span>ZIP</span><input name="zip" className="mlo-input" required inputMode="numeric" size={8} defaultValue={val("zip", guess.zip)} /></label>
            </div>
            <p className="mlo-note">A person at the company the carriers can contact (an owner, officer or manager).</p>
            <div className="mlo-row-form">
              <label className="mlo-field"><span>First name</span><input name="repFirst" className="mlo-input" required defaultValue={val("repFirst")} /></label>
              <label className="mlo-field"><span>Last name</span><input name="repLast" className="mlo-input" required defaultValue={val("repLast")} /></label>
            </div>
            <div className="mlo-row-form">
              <label className="mlo-field"><span>Email</span><input name="repEmail" type="email" className="mlo-input" required defaultValue={val("repEmail")} /></label>
              <label className="mlo-field"><span>Phone</span><input name="repPhone" type="tel" className="mlo-input" required defaultValue={val("repPhone")} /></label>
            </div>
            <div className="mlo-row-form">
              <label className="mlo-field"><span>Title</span><input name="repTitle" className="mlo-input" required placeholder="Managing Member" defaultValue={val("repTitle")} /></label>
              <label className="mlo-field"><span>Position</span>
                <select name="repPosition" className="mlo-select" defaultValue={val("repPosition", "CEO")}>{JOB_POSITIONS.map((p) => <option key={p}>{p}</option>)}</select>
              </label>
            </div>
            <label className="mlo-field"><span>Area code for the company&apos;s texting number</span><input name="areaCode" className="mlo-input" required inputMode="numeric" maxLength={3} size={4} defaultValue={val("areaCode")} /></label>
            <p className="mlo-note">{FEES}{isOwner ? "" : " The platform owner approves before anything is charged."}</p>
            <label className="mlo-check"><input type="checkbox" name="attest" /> I&apos;m allowed to register {co.name} for business texting, and these details are correct.</label>
            <div className="mlo-row-form">
              {s?.status === "attention" && s.approvedAt ? (
                <button type="submit" formAction={fixAndRetryTextingAction} className="mlo-btn">Save and send again</button>
              ) : (
                <button type="submit" formAction={saveTextingAction.bind(null, true)} className="mlo-btn">{isOwner ? "Start registering" : "Send for approval"}</button>
              )}
              <button type="submit" formAction={saveTextingAction.bind(null, false)} className="mlo-btn mlo-btn--ghost" formNoValidate>Save for later</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="mlo-section">
        <h2>What clients get</h2>
        <p className="mlo-note">Loan updates, document reminders that point to your secure portal, and replies to their messages, from the company&apos;s own number. Every first text says who it&apos;s from and how to stop. STOP and plain &ldquo;stop texting me&rdquo; are honored at once, for every loan officer at {co.name}. Offers and check-ins go by email until a marketing campaign is approved separately.</p>
      </section>
    </>,
  );
}
