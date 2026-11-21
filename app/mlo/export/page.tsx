import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { CC_TAGLINE } from "@/lib/content/command-center";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Download everything", robots: { index: false, follow: false } };

/** /mlo/export — your whole book in one download (D53.1). */
export default async function ExportPage() {
  const v = await requireViewer();
  const me = v.user;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Download everything</h1>
        {!me ? (
          <p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to download your book.</p>
        ) : me.role === "assistant" ? (
          <p className="mlo-note">The book belongs to the loan officer you assist. They can download it here.</p>
        ) : (
          <section className="mlo-section">
            <p><strong>{CC_TAGLINE}</strong> Your book is yours. This is one zip with everything Command Center keeps for you, as spreadsheets that open in Excel or Google Sheets, and that most other CRMs can import:</p>
            <ul className="mlo-list">
              <li>Contacts and agents, with addresses, tags, notes and loan details</li>
              <li>Every permission and opt-out on file, with its proof (keep this: it&apos;s your consent record)</li>
              <li>Every text, email and call logged here</li>
              <li>Your Concierge&apos;s notes, reminders and drafts</li>
              <li>Loans, campaigns, templates, call scripts and cards sent</li>
              <li>Expenses, income, mileage and receipt files</li>
            </ul>
            <form method="post" action="/api/cc/export" style={{ marginTop: 14 }}>
              <button type="submit" className="mlo-btn">Download everything (.zip)</button>
            </form>
            <p className="mlo-note" style={{ marginTop: 10 }}>Only your own book. Passwords, connection keys and sign-in codes are never included. We email you a note each time a download is made, in case it wasn&apos;t you. It contains your clients&apos; personal information: keep it somewhere safe and delete copies you don&apos;t need.</p>
          </section>
        )}
      </div>
    </PageShell>
  );
}
