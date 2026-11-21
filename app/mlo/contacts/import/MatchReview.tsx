"use client";

import type { ImportRecord } from "@/lib/contacts/mapping";
import type { ExistingCheck } from "@/lib/contacts/imports";
import type { ReimportMode } from "@/lib/contacts/reimport";
import type { MergePair } from "@/lib/contacts/smart";
import { formatPhone } from "@/lib/contacts/normalize";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import type { Existing } from "./ImportWizard";

const rc = ic.reimport;
const SHOWN = 100;

/** D75: "X new · Y already in your contacts", overall and per list (refs start with the list's id). */
export function existingCounts(existing: Existing, refs: readonly string[], mode: ReimportMode, itemId?: string) {
  const by = existing && typeof existing === "object" ? existing.by : null;
  let fresh = 0;
  let already = 0;
  let change = 0;
  for (const ref of refs) {
    if (itemId && !ref.startsWith(`${itemId}:`)) continue;
    const r = by?.[ref];
    if (r && (r.kind === "existing" || r.kind === "possible")) {
      already++;
      if ((r.kind === "possible" ? r.fill : r[mode]).length) change++;
    } else fresh++;
  }
  return { ready: !!by, fresh, already, change };
}

const maskEmail = (v: string) => (/^[^\s@]+@[^\s@]+$/.test(v) ? `${v[0]}•••@${v.split("@")[1]}` : v);
const shown = (p: MergePair) => (p.shared === "email" ? maskEmail(p.value) : formatPhone(p.value));

/**
 * Step 3's "People you already have" (D75): what to do with people already
 * in the book (fill blanks, or take the newer information), every merge
 * inside the files with "Keep separate", and everyone matched in the book
 * with the choice of who they are. Nothing here is saved until Import.
 */
export default function MatchReview(props: {
  records: ImportRecord[];
  refs: string[];
  pairs: MergePair[];
  existing: Existing;
  mode: ReimportMode;
  setMode: (m: ReimportMode) => void;
  setPair: (key: string, together: boolean) => void;
  matchTo: Record<string, string>;
  setMatchTo: (ref: string, to: string | null) => void;
}) {
  const { records, refs, pairs, existing, mode } = props;
  const by = existing && typeof existing === "object" ? existing.by : null;
  const c = existingCounts(existing, refs, mode);
  const rows = refs
    .map((ref, i) => ({ ref, r: records[i], x: by?.[ref] }))
    .filter((v): v is { ref: string; r: ImportRecord; x: ExistingCheck } => !!v.x && v.x.matches.length > 0)
    .sort((a, b) => rank(a.x) - rank(b.x));
  const toCheck = rows.filter((v) => v.x.kind === "possible" || v.x.kind === "shares").length + pairs.filter((p) => p.possible).length;

  return (
    <section className="mlo-section" id="im-existing" aria-live="polite">
      <h2>{rc.title}</h2>
      <p className="mlo-note">
        {existing === "checking" ? rc.checking : existing === "failed" ? rc.checkFailed : by ? rc.preview({ fresh: c.fresh, existing: c.already, inFile: pairs.filter((p) => p.merged).length }) : rc.checking}
        {toCheck ? <> · <strong>{rc.seePossible(toCheck)}</strong></> : null}
      </p>
      {c.already ? (
        <fieldset className="im-mode">
          <legend className="cc-card__title">{rc.modeLabel}</legend>
          {(["fill", "newer"] as const).map((m) => (
            <label key={m} className="mlo-check">
              <input type="radio" name="im-mode" checked={mode === m} onChange={() => props.setMode(m)} />
              <span>{rc.modes[m]}</span>
            </label>
          ))}
          <p className="mlo-note">{rc.modeNotes[mode]}</p>
        </fieldset>
      ) : null}

      {pairs.length ? (
        <details className="mlo-details im-review" open={pairs.some((p) => p.possible) || undefined}>
          <summary>{rc.seeMerges(pairs.filter((p) => p.merged).length, pairs.filter((p) => !p.merged).length)}</summary>
          <p className="mlo-note">{rc.mergeNote}</p>
          <ul className="im-pairs">
            {pairs.slice(0, SHOWN).map((p) => (
              <li key={p.key} className="im-pair" data-state={p.merged ? "merged" : "separate"}>
                <div className="im-pair__who">
                  <strong>{p.a.name} + {p.b.name}</strong>
                  <span className="im-pair__meta">{rc.row(p.a.file, p.a.row)} · {rc.row(p.b.file, p.b.row)}</span>
                  <span className="im-pair__meta">{rc.shared(p.shared, shown(p))}</span>
                </div>
                <div className="im-pair__act">
                  <span className={`im-chip ${p.merged ? "im-chip--sure" : p.possible ? "im-chip--check" : "im-chip--none"}`}>{p.merged ? rc.merged : p.possible ? rc.possible : rc.separate}</span>
                  <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => props.setPair(p.key, !p.merged)}>{p.merged ? rc.keepSeparate : rc.mergeThem}</button>
                </div>
              </li>
            ))}
          </ul>
          {pairs.length > SHOWN ? <p className="mlo-note">{rc.more(pairs.length - SHOWN)}</p> : null}
        </details>
      ) : null}

      {rows.length ? (
        <details className="mlo-details im-review" open={rows.some((v) => v.x.kind === "possible") || undefined}>
          <summary>{rc.seeExisting(rows.length)}</summary>
          <p className="mlo-note">{rc.existingNote}</p>
          <ul className="im-pairs">
            {rows.slice(0, SHOWN).map(({ ref, r, x }) => {
              const pick = props.matchTo[ref] ?? (x.kind === "shares" || x.kind === "new" ? "new" : x.kind === "possible" ? null : x.matches[0].id);
              const name = `${r.firstName} ${r.lastName}`.trim() || "(no name)";
              return (
                <li key={ref} className="im-pair" data-state={x.kind}>
                  <div className="im-pair__who">
                    <strong>{name}</strong>
                    {r.sourceFile ? <span className="im-pair__meta">{rc.row(r.sourceFile, r.sourceRow ?? null)}</span> : null}
                    <span className="im-pair__text">
                      {x.kind === "possible" ? rc.matchesTwo(x.matches.map((m) => m.name)) : x.kind === "shares" ? rc.sharesPhone(x.matches[0].name) : x.kind === "new" ? rc.addSeparately : rc.inBook(x.matches[0].name)}
                    </span>
                    {x.kind === "existing" || x.kind === "possible" ? <span className="im-pair__meta">{rc.wouldChange(x.kind === "possible" ? x.fill : x[mode])}</span> : null}
                  </div>
                  <div className="im-pair__act" role="group" aria-label={x.kind === "possible" ? rc.pickOne : name}>
                    {x.matches.map((m) => (
                      <button key={m.id} type="button" className="mlo-btn mlo-btn--ghost im-choice" aria-pressed={pick === m.id} onClick={() => props.setMatchTo(ref, m.id)}>{rc.mergeInto(m.name)}</button>
                    ))}
                    <button type="button" className="mlo-btn mlo-btn--ghost im-choice" aria-pressed={pick === "new"} onClick={() => props.setMatchTo(ref, "new")}>{rc.addSeparately}</button>
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > SHOWN ? <p className="mlo-note">{rc.more(rows.length - SHOWN)}</p> : null}
        </details>
      ) : null}
    </section>
  );
}

const rank = (x: ExistingCheck) => (x.kind === "possible" ? 0 : x.kind === "shares" ? 1 : x.kind === "new" ? 2 : 3);
