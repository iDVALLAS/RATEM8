import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { accountStore } from "@/lib/accounts/store";
import { mfaRequired, pendingEnroll } from "@/lib/accounts/mfa";
import { FlashBox, MloNav } from "../MloChrome";
import Confirm from "./Confirm";
import QRCode from "qrcode";
import { disableAction, forgetDevicesAction, startAction } from "./actions";
import "../mlo.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign-in security", robots: { index: false, follow: false } };

/** /mlo/security — the second sign-in step, per person (D34). */
export default async function Security({ searchParams }: { searchParams: Promise<{ f?: string; required?: string; recovery?: string }> }) {
  const { f, required, recovery } = await searchParams;
  const v = await requireViewer({ allowWithoutMfa: true });
  const tenant = listTenants()[0];
  const me = v.user;
  const rec = me ? await accountStore().getMfa(me.id) : null;
  const on = !!rec?.enabledAt;
  const pending = me && !on ? await pendingEnroll(me) : null;
  // D63: a QR code to scan from a computer screen (drawn here from the same setup link; nothing leaves the server).
  const qr = pending ? await QRCode.toString(pending.uri, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } }).catch(() => null) : null;
  const left = recovery !== undefined ? Number(recovery) : null;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="security" title="Sign-in security" />
        <MloNav current="security" tenantId={tenant.id} admin={v.admin} signedIn={!!me} />
        <FlashBox flash={decodeFlash(f)} />
        {required && !on ? <div className="mlo-flash mlo-flash--err" role="alert">The owner requires a second sign-in step for everyone. Set it up here to continue.</div> : null}
        {left !== null && Number.isFinite(left) ? <div className={`mlo-flash ${left <= 3 ? "mlo-flash--err" : "mlo-flash--ok"}`} role="status">You signed in with a recovery code. {left} left.{left <= 3 ? " Turn this off and on again to get a fresh set (you'll need your phone)." : ""}</div> : null}
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to set this up. The shared admin login can&apos;t have a second step; turn it off once your own sign-in works.</p></section>
        ) : (
          <>
            <section className="mlo-section">
              <h2>A code from your phone</h2>
              <p className="mlo-note">Your client files hold personal financial information, so the FTC&apos;s Safeguards Rule asks for a second sign-in step. After the emailed link, you&apos;ll type a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy or similar). It takes a minute to set up.</p>
              <p style={{ marginTop: 10 }}><span className={`mlo-pill ${on ? "" : "mlo-pill--off"}`}>{on ? "On" : "Off"}</span> <span className="mlo-note">{on ? `Since ${new Date(rec!.enabledAt!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${rec!.recoveryHashes.length} recovery codes left` : mfaRequired() ? "Required by the owner" : "Turn on: recommended"}</span></p>
            </section>
            {!on ? (
              <section className="mlo-section" id="setup">
                <h2>Set it up</h2>
                {!pending ? (
                  <form action={startAction}><button type="submit" className="mlo-btn">Start</button></form>
                ) : (
                  <ol className="mlo-steps">
                    <li>
                      <p>On your phone, open Google Authenticator (or another authenticator app), tap +, and scan this code. On this phone, <a href={pending.uri}>tap here to add it</a> instead. Or choose &ldquo;enter a setup key&rdquo; and type the key below.</p>
                      {qr ? <div className="mlo-qr" role="img" aria-label="QR code to scan with your authenticator app" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
                      <p className="mlo-key" aria-label="Setup key">{pending.key}</p>
                      <p className="mlo-note">Account: MLO Command Center · Time based. Keep this key private.</p>
                    </li>
                    <li><Confirm /></li>
                  </ol>
                )}
              </section>
            ) : (
              <section className="mlo-section">
                <h2>Turn it off or move it to a new phone</h2>
                {mfaRequired() ? <p className="mlo-note">The owner requires it. If you lost your phone, use a recovery code, or ask the owner to reset it on Team.</p> : (
                  <form action={disableAction} className="mlo-row-form">
                    <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={11} className="mlo-input" aria-label="A current code or a recovery code" placeholder="Current code" />
                    <button type="submit" className="mlo-btn mlo-btn--ghost">Turn off</button>
                  </form>
                )}
              </section>
            )}
            <section className="mlo-section" id="remembered">
              <h2>Remembered computers</h2>
              <p className="mlo-note">When you tick &ldquo;Remember this computer for 30 days&rdquo; as you sign in, that computer stays signed in for 30 days{on ? " and skips the phone code for 30 days" : ""}. Unticked, a sign-in lasts 12 hours. Lost a laptop, or ticked it on a shared computer? Forget them all here; {on ? "each one asks for your phone code again next time" : "this matters once the phone code is on"}.</p>
              <form action={forgetDevicesAction} className="mlo-actions">
                <button type="submit" className="mlo-btn mlo-btn--ghost">Forget my remembered computers</button>
              </form>
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
