import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import PageHead from "@/app/mlo/PageHead";
import { FlashBox } from "@/app/mlo/MloChrome";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { contactCleanupCopy as cc } from "@/lib/content/contact-cleanup";
import { RULES, cleanupUndoOpen, CLEANUP_UNDO_DAYS, type Suggestion } from "@/lib/contacts/cleanup";
import { peopleFor, recentRuns, scanFor } from "@/lib/contacts/cleanup-service";
import { nameOf } from "@/lib/contacts/merge";
import { formatPhone } from "@/lib/contacts/normalize";
import { RELATIONSHIP_LABELS } from "@/lib/contacts/mapping";
import { tagHref } from "@/lib/contacts/tags";
import type { Contact } from "@/lib/contacts/store";
import { approveCleanupAction, approvePickedAction, groupLabelsAction, keepSeparateAction, mergePairAction, rescanCleanupAction, skipCleanupAction, undoCleanupAction } from "./actions";
import "../../mlo.css";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Clean up your contacts", robots: { index: false, follow: false } };

/** People listed in one review (Approve on the main page covers everyone in a bigger group). */
const REVIEW_MAX = 300;
const TZ = "America/Los_Angeles";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
const n = (x: number) => x.toLocaleString("en-US");
const line = (c: Contact) => [formatPhone(c.phone) || c.email, c.state, c.kind === "agent" ? "Agent" : RELATIONSHIP_LABELS[c.relationship]].filter(Boolean).join(" · ");

function Variants({ s }: { s: Suggestion }) {
  if (!s.variants?.length) return null;
  return (
    <p className="mlo-note cc-clean__variants">
      {cc.alsoWritten}: {s.variants.map((v) => `${v.where === "tag" && s.fix === "one_source" ? `${cc.tagWord} ` : ""}“${v.label}” (${n(v.count)})`).join(" · ")}
    </p>
  );
}

/** /mlo/contacts/cleanup — the Concierge's suggestions for tidying the book (D88). Reads the whole book on every view. */
export default async function Cleanup({ searchParams }: { searchParams: Promise<{ f?: string; g?: string }> }) {
  const sp = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  const now = new Date();
  const scan = me ? await scanFor(me, now) : null;
  const runs = me && scan ? await recentRuns(me) : [];
  const open = sp.g && scan ? scan.suggestions.find((s) => s.id === sp.g) ?? null : null;
  const reviewPeople = open ? await peopleFor(me!, open.fix === "merge_pairs" ? [...new Set(open.pairs!.flatMap((p) => [p.a, p.b]))] : open.people.slice(0, REVIEW_MAX)) : [];
  const byId = new Map(reviewPeople.map((c) => [c.id, c]));

  const actions = (s: Suggestion) => (
    <form action={approveCleanupAction.bind(null, s.id, s.fingerprint)} className="cc-clean__form">
      {s.needsInput === "leadSource" ? (
        <label className="mlo-field cc-clean__src">
          <span>{cc.leadSourceLabel}</span>
          <input name="leadSource" required maxLength={120} autoComplete="off" placeholder={cc.leadSourcePlaceholder} />
        </label>
      ) : null}
      <div className="mlo-actions">
        {s.fix !== "merge_pairs" ? <button type="submit" className="mlo-btn" aria-label={cc.approveFor(cc.titleOf(s))}>{cc.approve}</button> : null}
        <Link href={`/mlo/contacts/cleanup?g=${encodeURIComponent(s.id)}`} className={`mlo-btn ${s.fix === "merge_pairs" ? "" : "mlo-btn--ghost"}`} aria-label={cc.reviewFor(cc.titleOf(s))}>{cc.review}</Link>
        <button type="submit" formAction={skipCleanupAction.bind(null, s.id, s.fingerprint)} formNoValidate className="mlo-btn mlo-btn--ghost" aria-label={cc.skipFor(cc.titleOf(s))}>{cc.skip}</button>
        {s.fix === "tag" && s.target ? <Link href={tagHref(s.target)} className="cc-tap">{cc.seeThem}</Link> : null}
      </div>
    </form>
  );

  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead
          k="cleanup"
          eyebrow={<Link href="/mlo/contacts">← Contacts</Link>}
          title={open ? cc.reviewTitle : cc.title}
          sub={open ? cc.titleOf(open) : cc.sub}
          how={open ? undefined : cc.how}
          action={me && !open ? <form action={rescanCleanupAction}><button type="submit" className="mlo-btn mlo-btn--ghost">{cc.checkAgain}</button></form> : undefined}
        />
        <FlashBox flash={decodeFlash(sp.f)} />
        {!me ? (
          <section className="mlo-section"><p className="mlo-note"><Link href="/sign-in">{cc.signInLink}</Link> {cc.signIn}</p></section>
        ) : !scan ? (
          <section className="mlo-section"><p className="mlo-note">{cc.noBook}</p></section>
        ) : sp.g ? (
          !open ? (
            <section className="mlo-section">
              <p className="mlo-note">{cc.gone}</p>
              <div className="mlo-actions"><Link href="/mlo/contacts/cleanup" className="mlo-btn mlo-btn--ghost">{cc.back}</Link></div>
            </section>
          ) : open.fix === "merge_pairs" ? (
            <section className="mlo-section" id="review" data-id={open.id}>
              <p className="mlo-note">{cc.pairs.lead}</p>
              <p className="mlo-note">{cc.pairs.noUndo}</p>
              <ul className="cc-clean__list">
                {open.pairs!.map((p) => {
                  const a = byId.get(p.a);
                  const b = byId.get(p.b);
                  if (!a || !b) return null;
                  return (
                    <li key={`${p.a}|${p.b}`} className="cc-card cc-clean__pair">
                      <p className="cc-card__title">{nameOf(a)} + {nameOf(b)}</p>
                      <p className="mlo-note">{cc.pairBy[p.by]}</p>
                      <p className="mlo-note">{nameOf(a)}: {line(a)}</p>
                      <p className="mlo-note">{nameOf(b)}: {line(b)}</p>
                      <p className="mlo-note"><Link href={`/mlo/contacts/${p.a}?merge=${p.b}#merge`} className="cc-tap">{cc.pairs.preview}</Link></p>
                      <form action={mergePairAction.bind(null, p.a, p.b)}>
                        <label className="mlo-check"><input type="checkbox" name="same" value="yes" required /><span>{cc.pairs.same}</span></label>
                        <div className="mlo-actions">
                          <button type="submit" className="mlo-btn">{cc.pairs.keep(nameOf(a))}</button>
                          <button type="submit" formAction={mergePairAction.bind(null, p.b, p.a)} className="mlo-btn mlo-btn--ghost">{cc.pairs.keep(nameOf(b))}</button>
                          <button type="submit" formAction={keepSeparateAction.bind(null, p.a, p.b)} formNoValidate className="mlo-btn mlo-btn--ghost">{cc.pairs.separate}</button>
                        </div>
                      </form>
                    </li>
                  );
                })}
              </ul>
              <div className="mlo-actions"><Link href="/mlo/contacts/cleanup" className="mlo-btn mlo-btn--ghost">{cc.back}</Link></div>
            </section>
          ) : (
            <section className="mlo-section" id="review" data-id={open.id}>
              <p className="mlo-note">{cc.does(open)}</p>
              <Variants s={open} />
              <p className="mlo-note">{cc.reviewLead}</p>
              {open.count > reviewPeople.length ? <p className="mlo-note">{cc.firstOf(reviewPeople.length, open.count)}</p> : null}
              <form action={approvePickedAction.bind(null, open.id, open.fingerprint)}>
                <ul className="cc-clean__people">
                  {reviewPeople.map((c) => (
                    <li key={c.id} className="cc-clean__person">
                      <label className="mlo-check">
                        <input type="checkbox" name="ids" value={c.id} defaultChecked />
                        <span><strong className="cc-clean__name">{nameOf(c)}</strong><span className="mlo-note"> {line(c)}</span>{open.reasons?.[c.id] ? <span className="mlo-note cc-clean__why"> · {cc.reasons(open.reasons[c.id])}</span> : null}</span>
                      </label>
                      {open.rule === "reach" || open.rule === "basics" ? <Link href={`/mlo/contacts/${c.id}?tab=details`} className="cc-tap">{cc.open}</Link> : null}
                    </li>
                  ))}
                </ul>
                {open.needsInput === "leadSource" ? (
                  <label className="mlo-field cc-clean__src">
                    <span>{cc.leadSourceLabel}</span>
                    <input name="leadSource" required maxLength={120} autoComplete="off" placeholder={cc.leadSourcePlaceholder} />
                  </label>
                ) : null}
                <p className="mlo-note">{cc.pickedNote}</p>
                <div className="mlo-actions">
                  <button type="submit" className="mlo-btn">{cc.approvePicked}</button>
                  <button type="submit" formAction={skipCleanupAction.bind(null, open.id, open.fingerprint)} formNoValidate className="mlo-btn mlo-btn--ghost">{cc.skip}</button>
                  <Link href="/mlo/contacts/cleanup" className="mlo-btn mlo-btn--ghost">{cc.back}</Link>
                </div>
              </form>
            </section>
          )
        ) : (
          <>
            <p className="mlo-note cc-clean__never">{cc.never}</p>
            {scan.capped ? <p className="mlo-note">{cc.capped(scan.read, scan.total)}</p> : null}
            {!scan.suggestions.length ? (
              <section className="mlo-section" id="suggestions"><p className="mlo-note">{cc.none}</p></section>
            ) : (
              RULES.filter((r) => scan.suggestions.some((s) => s.rule === r)).map((r) => (
                <section key={r} className="mlo-section" id={`rule-${r}`} aria-labelledby={`rule-${r}-h`}>
                  <h2 id={`rule-${r}-h`}>{cc.rules[r]}</h2>
                  <ul className="cc-clean__list">
                    {scan.suggestions.filter((s) => s.rule === r).map((s) => (
                      <li key={s.id} className="cc-card cc-clean__item" data-id={s.id}>
                        <p className="cc-card__title">{cc.titleOf(s)}{s.ai ? <span className="cc-clean__mark">{cc.aiMark}</span> : null}</p>
                        <p className="mlo-note">{cc.does(s)}</p>
                        <Variants s={s} />
                        {s.examples.length ? <p className="mlo-note">{cc.examples}: {s.examples.join(", ")}{s.count > s.examples.length ? "…" : ""}</p> : null}
                        {actions(s)}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
            {scan.skipped ? <p className="mlo-note">{cc.skippedNote(scan.skipped)}</p> : null}
            <section className="mlo-section" id="m8" aria-labelledby="m8-h">
              <h2 id="m8-h">{cc.ai.heading}</h2>
              <p className="mlo-note">{cc.ai.disclosure}</p>
              <form action={groupLabelsAction} className="mlo-actions">
                <button type="submit" className="mlo-btn mlo-btn--ghost">{cc.ai.button}</button>
              </form>
            </section>
            <section className="mlo-section" id="history" aria-labelledby="history-h">
              <h2 id="history-h">{cc.history}</h2>
              {!runs.length ? (
                <p className="mlo-note">{cc.historyNone}</p>
              ) : (
                <ul className="cc-clean__list">
                  {runs.map((r) => {
                    const canUndo = r.undoable && !r.undone && cleanupUndoOpen(r.at, now);
                    return (
                      <li key={r.id} className="cc-card cc-clean__run" data-undone={r.undone ? "" : undefined}>
                        <p className="cc-card__title">{r.title}</p>
                        <p className="mlo-note">{day(r.at)} · {cc.runLine(r.by === me.email ? cc.byYou : r.by, r.count, r.ended)}</p>
                        <p className="mlo-note">{r.undone ? cc.runUndone(day(r.undone.at)) : !r.undoable ? cc.runMerge : canUndo ? cc.runCanUndo(day(new Date(Date.parse(r.at) + CLEANUP_UNDO_DAYS * 86_400_000).toISOString())) : cc.runExpired}</p>
                        {canUndo ? (
                          <details className="mlo-details">
                            <summary>{cc.undo}</summary>
                            <p className="mlo-note">{cc.undoHow}</p>
                            <form action={undoCleanupAction.bind(null, r.id)} className="mlo-row-form">
                              <label className="mlo-field"><span>{cc.undoLabel}</span><input name="confirm" required autoComplete="off" maxLength={10} /></label>
                              <button type="submit" className="mlo-btn mlo-btn--ghost">{cc.undo}</button>
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
