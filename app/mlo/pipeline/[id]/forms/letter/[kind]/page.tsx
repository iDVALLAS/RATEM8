import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { letterDraft } from "@/lib/forms/service";
import { FlashBox } from "../../../../../MloChrome";
import { makeLetterAction } from "../../actions";
import "../../../../../mlo.css";
import "../../../../../loa/loa.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Write a letter", robots: { index: false, follow: false } };

/** One letter, written from the file, for the loan officer to read and change before it's saved as a PDF (D66). */
export default async function LetterPage({ params, searchParams }: { params: Promise<{ id: string; kind: string }>; searchParams: Promise<{ f?: string }> }) {
  const [{ id, kind }, { f }] = await Promise.all([params, searchParams]);
  const v = await requireViewer();
  if (!v.user) notFound();
  const d = await letterDraft(v.user, id, kind);
  if (!d) notFound();
  const back = `/mlo/pipeline/${encodeURIComponent(id)}/forms`;
  return (
    <PageShell>
      <div className="mlo-wrap loa-forms">
        <PageHead k="pipeline" eyebrow={<><Link href={`${back}#letters`}>Forms for this loan</Link></>} title={d.label} />
        <FlashBox flash={decodeFlash(f)} />
        <section className="mlo-section">
          <p className="mlo-note" style={{ maxWidth: 720 }}>{d.about} It&apos;s written from what&apos;s on the file. Anything in [brackets] wasn&apos;t there: fill it in or leave it for the reader. Read it, change what you like, and save it as a PDF on your letterhead.</p>
          <form action={makeLetterAction.bind(null, id, kind)} className="mlo-grid">
            <label className="mlo-field"><span>Title</span><input name="title" className="mlo-input" defaultValue={d.title} maxLength={140} required /></label>
            <label className="mlo-field"><span>The letter</span><textarea name="body" className="mlo-textarea" rows={24} defaultValue={d.body} required style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }} /></label>
            <div className="mlo-row-form">
              <button type="submit" className="mlo-btn">Save as PDF on this loan</button>
              <Link href={`${back}#letters`} className="mlo-btn mlo-btn--ghost">Cancel</Link>
            </div>
          </form>
        </section>
      </div>
    </PageShell>
  );
}
