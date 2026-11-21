import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { loanFor } from "@/lib/journey/engine";
import { fileFor, PARTY_LABELS } from "@/lib/loa/service";
import { FORM_KIND_LABELS, FORM_KINDS, LETTERS } from "@/lib/forms/catalog";
import { libraryFor, loanForms } from "@/lib/forms/service";
import { FlashBox } from "../../../MloChrome";
import { addFormAction, removeFormAction, sendFormsAction } from "./actions";
import "../../../mlo.css";
import "../../../loa/loa.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Loan forms", robots: { index: false, follow: false } };

const SOURCE = { upload: "Dropped in", filled: "Filled from the file", letter: "Letter" } as const;
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** /mlo/pipeline/[id]/forms — the LOA's forms side on one loan (D66): letters from the file, fillable forms, and sending them. */
export default async function LoanFormsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string }> }) {
  const [{ id }, { f }] = await Promise.all([params, searchParams]);
  const v = await requireViewer();
  if (!v.user) notFound();
  const loan = await loanFor(v.user, id);
  if (!loan) notFound();
  const [forms, library, ctx] = await Promise.all([loanForms(v.user, loan.id), libraryFor(v.user), fileFor(v.user, loan.id)]);
  const parties = (ctx?.file.parties ?? []).filter((p) => p.email);
  const fillable = library.filter((x) => x.fields.length);
  const base = `/mlo/pipeline/${encodeURIComponent(loan.id)}/forms`;
  return (
    <PageShell>
      <div className="mlo-wrap loa-forms">
        <p className="eyebrow">MLO Command Center · <Link href={`/mlo/pipeline/${encodeURIComponent(loan.id)}#loa`}>{loan.borrowerName || loan.externalId}</Link></p>
        <h1 className="tagline text-4xl">Forms for this loan</h1>
        <FlashBox flash={decodeFlash(f)} />
        <p className="mlo-note" style={{ maxWidth: 720 }}>Your LOA writes the letters escrow and title need from what&apos;s on the file, fills your fillable forms, and sends them for you. You read every one first. Disclosures stay in your loan system. Social Security numbers, birth dates, account numbers and signatures are always left for the borrower.</p>

        <section className="mlo-section" id="forms">
          <h2>On this loan ({forms.length})</h2>
          {forms.length ? (
            <ul className="loa-items loa-items--stack">
              {forms.map((x) => (
                <li key={x.id}>
                  <span><span className="loa-tag">{FORM_KIND_LABELS[x.kind]}</span><a href={`/api/cc/forms/${encodeURIComponent(x.id)}`} target="_blank" rel="noopener">{x.name}</a> · {SOURCE[x.source]} · {kb(x.bytes)}</span>
                  <span className="mlo-row-form">
                    {x.fields.length ? <Link href={`${base}/fill/${encodeURIComponent(x.id)}`} className="mlo-btn mlo-btn--ghost">Fill again</Link> : null}
                    <form action={removeFormAction.bind(null, loan.id, x.id)}><button type="submit" className="mlo-btn mlo-btn--ghost">Remove</button></form>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="mlo-note">Nothing yet. Write a letter, fill a form from your library, or drop one in below.</p>}
        </section>

        <section className="mlo-section" id="letters">
          <h2>Write a letter from the file</h2>
          <ul className="loa-items loa-items--stack">
            {LETTERS.map((l) => (
              <li key={l.kind}>
                <span><strong>{l.label}</strong> · <span className="mlo-note">{l.about}</span></span>
                <Link href={`${base}/letter/${l.kind}`} className="mlo-btn mlo-btn--ghost">Write it</Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mlo-section" id="fill">
          <h2>Fill a form from your library</h2>
          {fillable.length ? (
            <ul className="loa-items loa-items--stack">
              {fillable.map((x) => (
                <li key={x.id}>
                  <span><span className="loa-tag">{FORM_KIND_LABELS[x.kind]}</span>{x.name} · {x.fields.length} fields</span>
                  <Link href={`${base}/fill/${encodeURIComponent(x.id)}`} className="mlo-btn mlo-btn--ghost">Fill for this loan</Link>
                </li>
              ))}
            </ul>
          ) : <p className="mlo-note">No fillable forms in your library yet. Add the blank ones you use (Form 1005, 1006, 4506-C, your title company&apos;s order form) on <Link href="/mlo/loa#forms">Your LOA</Link>.</p>}
        </section>

        <section className="mlo-section" id="drop">
          <h2>Drop a form on this loan</h2>
          <p className="mlo-note">A PDF up to 4 MB: a form from ARIVE or your loan system, or one escrow or title sent you. Keep signed borrower documents with Social Security numbers in your loan system.</p>
          <form action={addFormAction.bind(null, loan.id)} className="mlo-grid">
            <div className="mlo-row-form">
              <select name="kind" className="mlo-select" aria-label="What kind of form">{FORM_KINDS.map((k) => <option key={k} value={k}>{FORM_KIND_LABELS[k]}</option>)}</select>
              <input name="name" className="mlo-input" placeholder="Name (optional)" aria-label="Name" maxLength={90} />
            </div>
            <input type="file" name="doc" accept="application/pdf" className="mlo-input" required aria-label="The PDF" />
            <button type="submit" className="mlo-btn">Keep it on this loan</button>
          </form>
        </section>

        <section className="mlo-section" id="send">
          <h2>Send forms</h2>
          {forms.length ? (
            <form action={sendFormsAction.bind(null, loan.id)} className="mlo-grid">
              <fieldset className="mlo-grid" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="mlo-note">Attach (up to 3 MB in one email)</legend>
                {forms.map((x) => (
                  <label key={x.id} className="mlo-check"><input type="checkbox" name="form" value={x.id} /> {x.name}</label>
                ))}
              </fieldset>
              <label className="mlo-field"><span>To</span>
                <select name="to" className="mlo-select" defaultValue={parties[0]?.email ?? ""}>
                  {parties.map((p) => <option key={p.role} value={p.email}>{PARTY_LABELS[p.role]}: {p.name || p.company} ({p.email})</option>)}
                  <option value="">Someone else (type the address below)</option>
                </select>
              </label>
              <input name="to_other" type="email" className="mlo-input" placeholder="Or type an email address" aria-label="Another email address" />
              <input name="subject" className="mlo-input" required maxLength={120} defaultValue={`Forms for ${loan.borrowerName || loan.externalId}`} aria-label="Subject" />
              <textarea name="body" className="mlo-textarea" rows={4} required defaultValue={"Hello,\n\nThe forms for this file are attached. Please let me know if you need anything else.\n\nThank you,"} aria-label="Message" />
              <button type="submit" className="mlo-btn">Send</button>
              <p className="mlo-note">It goes from your own mailbox when it&apos;s connected (<Link href="/mlo/email">Email</Link>), with your signature, and is noted on the LOA&apos;s file.</p>
            </form>
          ) : <p className="mlo-note">Save a form on this loan first.</p>}
        </section>
      </div>
    </PageShell>
  );
}
