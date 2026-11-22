"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { cleanRule, describeRule, type ListRule } from "@/lib/contacts/filter";
import { RELATIONSHIP_LABELS, type ImportKind, type ImportRecord } from "@/lib/contacts/mapping";
import { checkSuggestion, countRule, importCounts, mergeSuggestions, type Suggestion } from "@/lib/contacts/suggest";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { askRuleAction, suggestListsAction } from "../actions";
import { without } from "../AskList";

const sc = lc.suggest;

/** What the loan officer did with the suggestions (kept in the wizard so going Back and forth keeps it). */
export type ListPicks = {
  /** M8's lists (null: not asked yet; [] when the AI is off or answered nothing). */
  m8: { name: string; rule: ListRule }[] | null;
  /** Lists the loan officer described ("Describe another list"). */
  asked: { name: string; rule: ListRule }[];
  /** Per suggestion key: checked or not, a new name, a changed rule. */
  edits: Record<string, { on?: boolean; name?: string; rule?: ListRule }>;
};
export const emptyPicks = (): ListPicks => ({ m8: null, asked: [], edits: {} });

export type Shown = Suggestion & { edited: boolean };

/** The step's rows: M8's (checked here), the fixed ones, the described ones, with the loan officer's changes. */
export function shownLists(picks: ListPicks, records: readonly ImportRecord[], kind: ImportKind, now: Date): Shown[] {
  const base = mergeSuggestions(picks.m8 ?? [], records, kind, now);
  for (const a of picks.asked) {
    const s = checkSuggestion(a.name, a.rule, records, kind, now, "asked", true);
    if (s && !base.some((b) => b.key === s.key)) base.push(s);
  }
  return base.map((s) => {
    const e = picks.edits[s.key];
    if (!e) return { ...s, edited: false };
    const rule = e.rule ? cleanRule(e.rule) : s.rule;
    return { ...s, on: e.on ?? s.on, name: (e.name ?? s.name).slice(0, 60), rule, count: e.rule ? countRule(records, kind, rule, now) : s.count, edited: true };
  });
}

/** The lists to save after the import: the checked ones with a name and a rule. */
export const chosenLists = (shown: Shown[]) => shown.filter((s) => s.on && s.name.trim() && Object.keys(s.rule).length).map((s) => ({ name: s.name.trim(), rule: s.rule }));

/**
 * D80, step 3: "M8 found lists in your files". The counts are worked out
 * here, on this device (how many per loan type, per year, per rate band,
 * per state); only those numbers and the column names go to M8, never a
 * name, phone, email or row. Agent lists never go to M8 (RETR's terms): they
 * get the fixed suggestions only. Each list is a checkbox row with its rule
 * and how many people in these files fit it; chosen lists are saved as live
 * lists when the import finishes.
 */
export default function ListsStep({ kind, records, columns, picks, setPicks }: { kind: ImportKind; records: ImportRecord[]; columns: string[]; picks: ListPicks; setPicks: (fn: (p: ListPicks) => ListPicks) => void }) {
  const now = useMemo(() => new Date(), []);
  const counts = useMemo(() => importCounts(records, kind), [records, kind]);
  const shown = useMemo(() => shownLists(picks, records, kind, now), [picks, records, kind, now]);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Ask M8 once per import (contacts only): column names and these counts, nothing else.
  const asking = kind === "contacts" && picks.m8 === null && records.length > 0;
  useEffect(() => {
    if (!asking) return;
    let live = true;
    void suggestListsAction({ kind, columns: columns.slice(0, 200).map((c) => c.slice(0, 120)), counts })
      .catch(() => ({ ok: false as const }))
      .then((r) => {
        if (live) setPicks((p) => ({ ...p, m8: r.ok ? r.lists : [] }));
      });
    return () => {
      live = false;
    };
    // Asked once; later edits to the files recount the same lists here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking]);

  const edit = (key: string, e: { on?: boolean; name?: string; rule?: ListRule }) => setPicks((p) => ({ ...p, edits: { ...p.edits, [key]: { ...p.edits[key], ...e } } }));
  const byM8 = (picks.m8?.length ?? 0) > 0 && shown.some((s) => s.by === "m8");
  const on = shown.filter((s) => s.on).length;

  const describe = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const req = text.trim();
    if (!req) return setError(lc.ask.empty);
    start(async () => {
      const r = await askRuleAction(req).catch(() => null);
      if (!r) return setError(lc.failed);
      if (!r.ok) return setError(r.error);
      const s = checkSuggestion(req, r.rule, records, kind, now, "asked", true);
      if (!s) return setError(sc.none);
      setPicks((p) => ({ ...p, asked: [...p.asked, { name: req.slice(0, 60), rule: r.rule }] }));
      setText("");
    });
  };

  return (
    <section className="mlo-section im-lists" aria-labelledby="im-lists-title">
      <h2 id="im-lists-title">{byM8 ? sc.title : sc.titleWords}</h2>
      <p className="mlo-note">{sc.note}</p>
      {shown.length ? (
        <ul className="im-lists__rows">
          {shown.map((s) => {
            const chips = describeRule(s.rule, { relationship: RELATIONSHIP_LABELS, permission: lc.permissionLabels, chip: lc.chip });
            const ruleText = s.rule.kind === "agent" && chips.length === 0 ? lc.chip.kindAgent : [s.rule.kind === "agent" ? lc.chip.kindAgent : "", ...chips.map((c) => c.label)].filter(Boolean).join(" · ");
            const id = `im-l-${s.key.replace(/[^a-z0-9]/gi, "").slice(0, 40)}`;
            return (
              <li key={s.key} className="cc-card im-lists__row" data-on={s.on ? "" : undefined}>
                <label className="mlo-check im-lists__pick">
                  <input type="checkbox" checked={s.on} onChange={(e) => edit(s.key, { on: e.target.checked })} aria-describedby={`${id}-rule`} />
                  <span><strong>{s.name}</strong><span className="sr-only"> {sc.makeOne(s.name)}</span></span>
                </label>
                <p id={`${id}-rule`} className="mlo-note im-lists__rule">{sc.rule(ruleText)}</p>
                <p className="im-lists__count">{sc.inFile(s.count)}</p>
                <button type="button" className="cc-linkbtn im-lists__edit" aria-expanded={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)}>{sc.rename}</button>
                {open === s.key ? (
                  <div className="im-lists__editor">
                    <label className="mlo-field"><span>{sc.nameLabel}</span><input className="mlo-input" value={s.name} maxLength={60} onChange={(e) => edit(s.key, { name: e.target.value })} autoComplete="off" /></label>
                    {chips.length > 1 ? (
                      <ul className="cc-ask__chips">
                        {chips.map((c) => (
                          <li key={`${c.key}|${c.label}`} className="cc-ask__chip">
                            <span className="cc-tag">{c.label}</span>
                            <button type="button" className="cc-ask__x" aria-label={sc.removePart(c.label)} onClick={() => edit(s.key, { rule: without(s.rule, c.key, c.label) })}>×</button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : asking ? null : <p className="mlo-note">{sc.none}</p>}
      <form className="im-lists__ask" onSubmit={describe}>
        <label htmlFor="im-lists-ask" className="cc-card__title">{sc.another}</label>
        <div className="mlo-row-form">
          <input id="im-lists-ask" className="mlo-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={sc.anotherPlaceholder} maxLength={300} autoComplete="off" disabled={pending} />
          <button type="submit" className="mlo-btn mlo-btn--ghost" disabled={pending}>{pending ? lc.ask.working : sc.addList}</button>
        </div>
      </form>
      {error ? <p className="cc-ask__error" role="alert">{error}</p> : null}
      <div className="im-lists__info">
        <div className="cc-card">
          <p className="cc-card__title">{sc.how}</p>
          <p className="mlo-note">{kind === "agents" ? sc.howRetr : byM8 ? sc.howNote : sc.howWords}</p>
        </div>
        {kind === "contacts" && counts.agents ? (
          <div className="cc-card">
            <p className="cc-card__title">{sc.agentsTitle}</p>
            <p className="mlo-note">{sc.agents(counts.agents)}</p>
          </div>
        ) : null}
      </div>
      <p className="mlo-note im-lists__total" role="status">{sc.count(on)}</p>
    </section>
  );
}
