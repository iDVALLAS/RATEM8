import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { emailFooter } from "@/lib/messaging/email";
import { signatureFor, suggestSignature } from "@/lib/profile/signature";
import { FlashBox } from "../MloChrome";
import Editor from "./Editor";
import { saveSignatureAction } from "./actions";
import "../mlo.css";
import "./signature.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email signature", robots: { index: false, follow: false } };

/** /mlo/signature — the signature under every email you send from Command Center (D49). */
export default async function SignaturePage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  if (!me) {
    return (
      <PageShell>
        <div className="mlo-wrap"><h1 className="tagline text-4xl">Email signature</h1><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to set your signature.</p></div>
      </PageShell>
    );
  }
  const saved = await signatureFor(me);
  const suggestion = suggestSignature(me);
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Email signature</h1>
        <FlashBox flash={decodeFlash(f)} />
        <section className="mlo-section">
          <p className="mlo-note">It goes under every email you send from Command Center, from a contact&apos;s page and from your Concierge&apos;s drafts. Under it, Command Center always adds the lines the law asks for: your NMLS number, your company and its address, Equal Housing Opportunity, and a link to stop emails. Texts keep their own short sign-off.</p>
          <form action={saveSignatureAction} className="mlo-grid" style={{ marginTop: 14 }}>
            <Editor initial={saved || suggestion} suggestion={suggestion} footer={emailFooter(me, "https://…/my/…")} />
            <div className="mlo-row-form">
              <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>{saved ? "Save" : "Save my signature"}</button>
              {saved ? <span className="mlo-note">To turn it off, clear the box and save.</span> : <span className="mlo-note">Not saved yet: this is a starting point from your details.</span>}
            </div>
          </form>
          <p className="mlo-note" style={{ marginTop: 12 }}>Plain text only. No rates or percentages, no promises about approval, pricing or timing, and nothing about who a home is for. Links start with https://.</p>
        </section>
      </div>
    </PageShell>
  );
}
