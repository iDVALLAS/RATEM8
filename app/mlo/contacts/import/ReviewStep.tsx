"use client";

import { useEffect, useState } from "react";
import DetailSheet from "@/components/ui/DetailSheet";
import { fieldsFor, RELATIONSHIP_LABELS, type Field, type ImportKind, type ImportRecord } from "@/lib/contacts/mapping";
import { formatPhone, type DateOrder } from "@/lib/contacts/normalize";
import { FIX_LABELS, skipReason, skippedCsv, type SkippedRow } from "@/lib/contacts/review";
import { MAX_IMPORT_TAGS } from "@/lib/contacts/tags";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";
import TagInput from "../TagInput";
import FixWithM8, { FixEditor } from "./FixWithM8";
import type { Item, Look } from "./types";

const rv = ic.review;
const LOOK_SHOWN = 100;
const SKIPPED_SHOWN = 50;
const READY_SHOWN = 25;

type Tab = "ready" | "look" | "skipped";
export type ReachSuggestion = { itemId: string; col: number; field: Field; header: string };

/** Phones get the sheet; wider screens edit in the row. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const f = () => setNarrow(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return narrow;
}

export function downloadText(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * Step 3 (D74): Ready, Needs a look and Skipped, Fix with M8, then the tags
 * from D73. Every value that was read as blank is listed with what the file
 * said; every skipped row can be seen and downloaded with its reason.
 */
export default function ReviewStep(props: {
  kind: ImportKind;
  items: Item[];
  records: ImportRecord[];
  merged: number;
  over: number | null;
  looks: Look[];
  skipped: (SkippedRow & { itemId: string })[];
  suggestions: ReachSuggestion[];
  stops: { all: number; phone: number; email: number };
  importTags: string[];
  setImportTags: (t: string[]) => void;
  knownTags: string[];
  dateOrderOf: (itemId: string) => DateOrder | undefined;
  onFix: (l: Look, value: string) => void;
  onUseColumn: (s: ReachSuggestion) => void;
  update: (id: string, fn: (it: Item) => Item) => void;
}) {
  const { kind, items, records, looks, skipped } = props;
  const [tab, setTab] = useState<Tab>(looks.length ? "look" : "ready");
  const [fixing, setFixing] = useState(false);
  const narrow = useNarrow();
  const fields = fieldsFor(kind) as Record<string, string>;
  const people = new Set(looks.map((l) => `${l.itemId}:${l.at}`)).size;
  const readyN = Math.max(0, records.length - people);
  const tabs: [Tab, string, number][] = [["ready", rv.tabs.ready, readyN], ["look", rv.tabs.look, looks.length], ["skipped", rv.tabs.skipped, skipped.length]];
  const skip = (l: Look) => props.onFix(l, l.keep ?? "");

  return (
    <>
      <section className="mlo-section" aria-live="polite">
        <h2>{rv.ready(records.length)}</h2>
        <p className="mlo-note">
          {rv.from(items.length, props.merged, skipped.length)}
          {props.over ? ` ${rv.over(props.over)}` : ""}
        </p>
        {props.stops.all || props.stops.phone || props.stops.email ? (
          <div className="mlo-flash mlo-flash--ok" role="status">
            {props.stops.all ? <p>{ic.optOutAll(props.stops.all)}</p> : null}
            {props.stops.phone ? <p>{ic.optOutPhone(props.stops.phone)}</p> : null}
            {props.stops.email ? <p>{ic.optOutEmail(props.stops.email)}</p> : null}
          </div>
        ) : null}
        <div className="cc-tabs-inline" role="tablist" aria-label={rv.tabsLabel}>
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" role="tab" id={`im-tab-${k}`} aria-controls={`im-panel-${k}`} aria-selected={tab === k} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}
              onKeyDown={(e) => {
                const i = tabs.findIndex(([t]) => t === k);
                const to = e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length][0] : e.key === "ArrowLeft" ? tabs[(i + tabs.length - 1) % tabs.length][0] : null;
                if (to) { e.preventDefault(); setTab(to); document.getElementById(`im-tab-${to}`)?.focus(); }
              }}>
              {label} ({n.toLocaleString("en-US")})
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`im-panel-${tab}`} aria-labelledby={`im-tab-${tab}`} className="im-panel">
          {tab === "ready" ? (
            <>
              <div className="mlo-scroll">
                <table className="mlo-table mlo-table--cards im-ready">
                  <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>State</th><th>{kind === "agents" ? "Brokerage" : "Relationship"}</th><th>{tc.previewTags}</th></tr></thead>
                  <tbody>
                    {records.slice(0, READY_SHOWN).map((r, i) => (
                      <tr key={i}>
                        <th scope="row">{`${r.firstName} ${r.lastName}`.trim() || "(no name)"}</th>
                        <td data-label="Phone">{formatPhone(r.phone)}</td>
                        <td data-label="Email">{r.email ?? ""}</td>
                        <td data-label="State">{r.state ?? ""}</td>
                        <td data-label={kind === "agents" ? "Brokerage" : "Relationship"}>{kind === "agents" ? r.agent?.brokerage ?? "" : RELATIONSHIP_LABELS[r.relationship]}</td>
                        <td data-label={tc.previewTags}>
                          {r.tags.length ? (
                            <span className="cc-tags">
                              {r.tags.slice(0, 3).map((t) => <span key={t} className="cc-tag cc-tag--sm">{t}</span>)}
                              {r.tags.length > 3 ? <span className="cc-tag cc-tag--sm cc-tag--more">{tc.more(r.tags.length - 3)}</span> : null}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rv.readyNote(READY_SHOWN, records.length) ? <p className="mlo-note">{rv.readyNote(READY_SHOWN, records.length)}</p> : null}
              {kind === "contacts" && records.some((r) => r.attestedOptIns.length) ? <p className="mlo-note">Some files have opt-in columns. Those are recorded as <strong>your word</strong> that they opted in, not as proof.</p> : null}
            </>
          ) : tab === "look" ? (
            looks.length || fixing ? (
              <>
                {fixing ? (
                  <FixWithM8 looks={looks} kind={kind} dateOrderOf={props.dateOrderOf} onSave={props.onFix} onSkip={skip} onClose={() => setFixing(false)} />
                ) : (
                  <div className="mlo-actions">
                    <button type="button" className="mlo-btn" onClick={() => setFixing(true)}>{ic.fix.open}</button>
                  </div>
                )}
                {looks.length ? <p className="mlo-note">{rv.lookNote}</p> : null}
                <ul className="im-look">
                  {looks.slice(0, LOOK_SHOWN).map((l) => (
                    <li key={l.key} className="im-look__row">
                      <div className="im-look__who">
                        <strong>{l.name}</strong>
                        <span className="im-look__field">{FIX_LABELS[l.field]}{items.length > 1 ? ` · ${l.file}, row ${l.row}` : ` · row ${l.row}`}</span>
                        <span className="im-look__raw">{l.raw ? <>“{l.raw}” {l.reason}</> : l.reason}</span>
                      </div>
                      {narrow ? (
                        <DetailSheet label={rv.fix} title={`${FIX_LABELS[l.field]} · ${l.name}`} buttonClassName="mlo-btn mlo-btn--ghost" className="cc-dsheet" closeLabel={ic.fix.close}>
                          <FixEditor look={l} dateOrder={props.dateOrderOf(l.itemId)} saveLabel={rv.save} onSave={(v) => props.onFix(l, v)} onSkip={() => skip(l)} autoFocus />
                        </DetailSheet>
                      ) : (
                        <FixEditor look={l} dateOrder={props.dateOrderOf(l.itemId)} saveLabel={rv.save} onSave={(v) => props.onFix(l, v)} onSkip={() => skip(l)} />
                      )}
                    </li>
                  ))}
                </ul>
                {looks.length > LOOK_SHOWN ? <p className="mlo-note">{rv.lookMore(looks.length - LOOK_SHOWN)}</p> : null}
              </>
            ) : (
              <p className="mlo-note">{rv.lookNone}</p>
            )
          ) : skipped.length ? (
            <>
              <p className="mlo-note">{rv.skippedNote}</p>
              {props.suggestions.map((s) => (
                <div key={`${s.itemId}-${s.col}`} className="mlo-flash im-suggest">
                  <p>{rv.suggest(s.header, fields[s.field] ?? s.field)}</p>
                  <div className="mlo-row-form">
                    <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => props.onUseColumn(s)}>{rv.useIt}</button>
                  </div>
                </div>
              ))}
              <div className="mlo-scroll">
                <table className="mlo-table mlo-table--cards">
                  <thead><tr><th>{rv.cols.name}</th><th>{rv.cols.file}</th><th>{rv.cols.row}</th><th>{rv.cols.reason}</th></tr></thead>
                  <tbody>
                    {skipped.slice(0, SKIPPED_SHOWN).map((p) => (
                      <tr key={`${p.itemId}-${p.row}`}>
                        <th scope="row">{p.name ?? "(no name)"}</th>
                        <td data-label={rv.cols.file}>{p.file}</td>
                        <td data-label={rv.cols.row}>{p.row}</td>
                        <td data-label={rv.cols.reason}>{skipReason(p.reason)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {skipped.length > SKIPPED_SHOWN ? <p className="mlo-note">{rv.skippedMore(skipped.length - SKIPPED_SHOWN)}</p> : null}
              <div className="mlo-actions">
                <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => downloadText(skippedCsv(skipped), `loanm8-skipped-rows-${new Date().toISOString().slice(0, 10)}.csv`)}>{rv.download}</button>
              </div>
            </>
          ) : (
            <p className="mlo-note">{rv.skippedNone}</p>
          )}
        </div>
      </section>

      <section className="mlo-section">
        <h2>{rv.tagsTitle}</h2>
        <div className="im-tags" role="group" aria-labelledby="im-tags-title">
          <h3 id="im-tags-title" className="cc-card__title">{tc.importTitle}</h3>
          <p className="mlo-note">{tc.importNote}</p>
          <TagInput value={props.importTags} onChange={props.setImportTags} suggestions={props.knownTags} max={MAX_IMPORT_TAGS} label={tc.importTitle} />
        </div>
        <ol className="im-files">
          {items.map((it) => (
            <li key={it.id} className="cc-card">
              <div className="im-tags im-tags--list" role="group" aria-label={`${tc.listLabel}: ${it.name}`}>
                <p className="cc-card__title">{it.name}</p>
                <p className="im-tags__label">{tc.listLabel}</p>
                <TagInput value={it.tags} onChange={(tags) => props.update(it.id, (x) => ({ ...x, tags }))} suggestions={props.knownTags.filter((t) => !props.importTags.includes(t))} max={MAX_IMPORT_TAGS} label={`${tc.listLabel}: ${it.name}`} />
                {it.mapping.tags !== undefined ? <p className="mlo-note">{tc.fileColumn}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
