import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { listImports, type ImportRun } from "@/lib/contacts/imports";
import { undoOpen, UNDO_DAYS } from "@/lib/contacts/reimport";
import { contactsImportCopy } from "@/lib/content/contacts-import";
import { FlashBox } from "../../../MloChrome";
import { undoImportAction } from "../../actions";
import SkippedDownload from "./SkippedDownload";
import "../../../mlo.css";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Import history", robots: { index: false, follow: false } };

const h = contactsImportCopy.history;
const TZ = "America/Los_Angeles";
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
const n = (x: number) => x.toLocaleString("en-US");

/** /mlo/contacts/import/history — every import into the book: what it did, who ran it, skipped rows, and undo for 30 days (D75). */
export default async function ImportHistory({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const runs = me ? await listImports(me) : [];
  const now = new Date();
  const status = (r: ImportRun) =>
    r.undone ? h.undoneOn(day(r.undone.at), r.undone.by === me?.email ? h.byYou : r.undone.by, r.undone) : !r.finishedAt ? h.stopped : undoOpen(r.at, now) ? h.canUndo(day(new Date(Date.parse(r.at) + UNDO_DAYS * 86_400_000).toISOString())) : h.expired;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow"><Link href="/mlo/contacts">← Contacts</Link></p>
        <h1 className="tagline text-4xl">{h.title}</h1>
        <FlashBox flash={decodeFlash(f)} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to see your imports.</p></section>
        ) : (
          <>
            <nav className="cc-tabs-inline" aria-label="Import">
              <Link href="/mlo/contacts/import">Import</Link>
              <Link href="/mlo/contacts/import/history" aria-current="page">{h.title}</Link>
            </nav>
            <section className="mlo-section">
              <p className="mlo-note">{h.lead}</p>
              {!runs.length ? (
                <p className="mlo-note">{h.none} <Link href="/mlo/contacts/import">{h.importLink}</Link>.</p>
              ) : (
                <ul className="im-history">
                  {runs.map((r) => {
                    const people = `/mlo/contacts?${new URLSearchParams({ ...(r.kind === "agents" ? { kind: "agent" } : {}), import: r.id })}`;
                    const open = !r.undone && undoOpen(r.at, now);
                    return (
                      <li key={r.id} className="cc-card im-history__run" data-undone={r.undone ? "" : undefined}>
                        <div className="im-history__head">
                          <p className="cc-card__title">{when(r.at)}</p>
                          <p className="im-history__files">{r.files.join(", ")}</p>
                        </div>
                        <dl className="im-history__nums">
                          <div><dt>{h.cols.created}</dt><dd>{n(r.counts.created)}</dd></div>
                          <div><dt>{h.cols.updated}</dt><dd>{n(r.counts.updated)}<span className="mlo-note"> of {n(r.counts.merged)}</span></dd></div>
                          <div><dt>{h.cols.skipped}</dt><dd>{n(r.counts.skipped)}</dd></div>
                          <div><dt>{h.cols.by}</dt><dd>{r.by === me.email ? h.whoYou : r.byName || r.by}</dd></div>
                        </dl>
                        <p className="mlo-note">{status(r)}</p>
                        <div className="mlo-actions">
                          {!r.undone ? <Link href={people} className="mlo-btn mlo-btn--ghost">{h.see}</Link> : null}
                          {r.skippedCsv ? <SkippedDownload id={r.id} day={r.at.slice(0, 10)} /> : r.counts.skipped ? null : <span className="mlo-note">{h.noSkipped}</span>}
                        </div>
                        {open ? (
                          <details className="mlo-details">
                            <summary>{h.undo}</summary>
                            <p className="mlo-note">{h.undoHow}</p>
                            <form action={undoImportAction.bind(null, r.id)} className="mlo-row-form">
                              <label className="mlo-field"><span>{h.confirmLabel}</span><input name="confirm" required autoComplete="off" maxLength={10} /></label>
                              <button type="submit" className="mlo-btn mlo-btn--ghost">{h.undo}</button>
                            </form>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
