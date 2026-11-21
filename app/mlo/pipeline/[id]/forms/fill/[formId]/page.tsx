import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { FACT_LABELS } from "@/lib/forms/catalog";
import { fillPlan } from "@/lib/forms/service";
import { FlashBox } from "../../../../../MloChrome";
import { fillAction } from "../../actions";
import "../../../../../mlo.css";
import "../../../../../loa/loa.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fill a form", robots: { index: false, follow: false } };

/** A fillable form's fields with what the file suggests; the loan officer checks each and saves a filled copy on the loan (D66). */
export default async function FillPage({ params, searchParams }: { params: Promise<{ id: string; formId: string }>; searchParams: Promise<{ f?: string }> }) {
  const [{ id, formId }, { f }] = await Promise.all([params, searchParams]);
  const v = await requireViewer();
  if (!v.user) notFound();
  const plan = await fillPlan(v.user, formId, id).catch(() => null);
  if (!plan) notFound();
  const back = `/mlo/pipeline/${encodeURIComponent(id)}/forms`;
  const matched = plan.fields.filter((x) => x.from).length;
  return (
    <PageShell>
      <div className="mlo-wrap loa-forms">
        <PageHead k="pipeline" eyebrow={<><Link href={`${back}#fill`}>Forms for this loan</Link></>} title={plan.form.name} />
        <FlashBox flash={decodeFlash(f)} />
        <section className="mlo-section">
          <p className="mlo-note" style={{ maxWidth: 720 }}>{plan.fields.length} fields. Your LOA filled {matched} from the file; check each one and fill what it couldn&apos;t. Fields for Social Security numbers, birth dates, account numbers and signatures stay blank for the borrower. The copy stays fillable.</p>
          <form action={fillAction.bind(null, id, formId)} className="mlo-grid">
            <div className="loa-fill">
              {plan.fields.map((x, i) => (
                <label key={`${x.name}-${i}`} className="mlo-field">
                  <span>{x.name}{x.from ? <span className="mlo-note"> · from {FACT_LABELS[x.from]}</span> : null}</span>
                  {x.sensitive ? (
                    <input className="mlo-input" disabled value="" placeholder="The borrower fills this in" aria-label={`${x.name}: the borrower fills this in`} />
                  ) : x.kind === "check" ? (
                    <select name={`f:${x.name}`} className="mlo-select" defaultValue={x.value ? "yes" : ""}><option value="">Not ticked</option><option value="yes">Ticked</option></select>
                  ) : x.kind === "choice" ? (
                    <select name={`f:${x.name}`} className="mlo-select" defaultValue={x.value}><option value="">(leave blank)</option>{x.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                  ) : (
                    <input name={`f:${x.name}`} className="mlo-input" defaultValue={x.value} maxLength={x.maxLength ?? 500} />
                  )}
                </label>
              ))}
            </div>
            <div className="mlo-row-form">
              <button type="submit" className="mlo-btn">Save the filled copy on this loan</button>
              <a href={`/api/cc/forms/${encodeURIComponent(plan.form.id)}`} target="_blank" rel="noopener" className="mlo-btn mlo-btn--ghost">See the blank form</a>
            </div>
          </form>
        </section>
      </div>
    </PageShell>
  );
}
