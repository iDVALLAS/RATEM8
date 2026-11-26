"use client";

import { fieldsFor, readsOptOut, RELATIONSHIP_LABELS, type Field, type ImportKind } from "@/lib/contacts/mapping";
import { splitName, type NameOrder, type DateOrder } from "@/lib/contacts/normalize";
import { cardCounts, consentReadings, namePreview, OPT_IN_FIELDS, unanswered, type ColumnCard, type ColumnTarget, type Question } from "@/lib/contacts/review";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import { cardGuesses, nameGuess, type Guess } from "@/lib/contacts/guess";
import { setTarget, type Item } from "./types";

const c = ic.columns;
const q = ic.questions;

type FileView = { it: Item; cards: ColumnCard[]; questions: Question[] };

/**
 * Step 2 (D74): one card per column of each file, what it goes into and
 * whether it's Sure, Check this or Not imported, then the format questions
 * for that file. D93: each card carries the best guess for that column
 * (M8's, from a sample of the values, or the rules' on this device: a ZIP
 * that fits the State column, a co-borrower column, two people in one name)
 * with Sure or Check this, and a button to use the guess.
 */
export default function ColumnsStep({ kind, files, update }: { kind: ImportKind; files: FileView[]; update: (id: string, fn: (it: Item) => Item) => void }) {
  const fields = fieldsFor(kind) as Record<string, string>;
  return (
    <>
      {kind === "contacts" ? <p className="mlo-note im-hint">{c.optInHint}</p> : null}
      {files.map(({ it, cards, questions }) => {
        const counts = cardCounts(cards);
        const open = it.expanded ?? counts.check > 0;
        const guesses = cardGuesses(it.table, it.mapping, it.m8, (f) => fields[f] ?? f);
        return (
          <section key={it.id} className="mlo-section im-file" aria-labelledby={`im-f-${it.id}`}>
            <h2 id={`im-f-${it.id}`} className="im-file__name">{it.name}</h2>
            <p className="mlo-note">{ic.rowsCols(it.table.rows.length, it.table.headers.length)}</p>
            <p className="im-counts">
              {c.counts(counts).map((t, i) => {
                const k = (["sure", "check", "none"] as const)[i];
                return <span key={t} className={`im-chip im-chip--${counts[k] ? k : "none"}`}>{t}</span>;
              })}
            </p>
            <p className="mlo-note">{it.by === "m8" ? c.byM8 : c.byNames}</p>
            {kind === "contacts" ? (
              <label className="mlo-field im-file__rel">
                <span>{c.relationship}</span>
                <select className="mlo-select" value={it.rel ?? ""} onChange={(e) => update(it.id, (x) => ({ ...x, rel: e.target.value || null }))}>
                  <option value="">{c.relationshipOther}</option>
                  {(["past_client", "lead", "sphere", "agent"] as const).map((r) => <option key={r} value={r}>{RELATIONSHIP_LABELS[r]}</option>)}
                </select>
              </label>
            ) : null}
            <details className="mlo-details im-colpanel" open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) update(it.id, (x) => ({ ...x, expanded: o })); }}>
              <summary>{c.summary(cards.length)}</summary>
              <ol className="im-cols">
                {cards.map((card) => <Card key={card.col} it={it} card={card} fields={fields} update={update} guess={card.sensitive ? null : guesses[card.col] ?? null} />)}
              </ol>
            </details>
            {questions.length ? (
              <div className="im-qs">
                {questions.filter((x) => x.kind !== "optout").map((x) => <QuestionCard key={`${x.kind}-${x.col}`} it={it} q={x} update={update} />)}
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

function Card({ it, card, fields, update, guess }: { it: Item; card: ColumnCard; fields: Record<string, string>; update: (id: string, fn: (it: Item) => Item) => void; guess: Guess | null }) {
  const confirmed = it.answers.optOutOk?.includes(card.col) ?? false;
  const optOutField = card.optOut && !card.sensitive;
  const consent = OPT_IN_FIELDS.includes(card.target as (typeof OPT_IN_FIELDS)[number]) || (optOutField && card.target in fields);
  const readings = consent ? consentReadings(it.table, card.col, card.target as Field, it.answers.consent?.[card.target as (typeof OPT_IN_FIELDS)[number]], 6) : null;
  const stops = optOutField ? it.table.rows.filter((r) => readsOptOut(r[card.col])).length : 0;
  let noteText: string | null = null;
  if (card.note === "optout") noteText = c.notes.optout(stops);
  else if (card.note) noteText = c.notes[card.note];
  else if (optOutField && confirmed) noteText = c.notes.optoutDone;
  const id = `im-c-${it.id}-${card.col}`;
  // D93: the guess names a field this column isn't in yet (and may go in).
  const useGuess = !!guess?.field && guess.field !== card.target && card.options.includes(guess.field) && !card.optOut;
  return (
    <li className="cc-card im-col" data-status={card.status}>
      <div className="im-col__head">
        <strong id={id} className="im-col__h">{card.header}</strong>
        <span className={`im-chip im-chip--${card.status}`}>{c.status[card.status]}</span>
      </div>
      {card.samples.length && !card.sensitive ? <p className="im-col__ex">{c.examples}: {card.samples.join(" · ")}</p> : null}
      <label className="mlo-field">
        <span>{c.goesInto}</span>
        <select
          className="mlo-select"
          aria-describedby={id}
          value={card.target}
          disabled={card.sensitive}
          onChange={(e) => update(it.id, (x) => setTarget(x, card.col, e.target.value as ColumnTarget))}
        >
          {card.options.map((f) => <option key={f} value={f}>{fields[f] ?? f}</option>)}
          {optOutField ? null : (
            <>
              <option value="notes">{c.choices.notes}</option>
              <option value="tag">{c.choices.tag}</option>
              <option value="skip">{c.choices.skip}</option>
            </>
          )}
        </select>
      </label>
      {noteText ? <p className={`im-col__note${card.status === "check" ? " im-col__note--check" : ""}`}>{noteText}</p> : null}
      {guess ? <p className="im-col__guess"><strong>{guess.by === "m8" ? ic.guess.m8 : ic.guess.rules}</strong> {guess.text}</p> : null}
      {readings ? (
        <p className="im-col__ex">
          {readings.values.map((v) => `${v.value || c.blank} → ${optOutField && v.reading === "no" ? c.readings.noStop : c.readings[v.reading]}`).join(" · ")}
          {readings.more ? ` · +${readings.more}` : ""}
        </p>
      ) : null}
      {optOutField && card.target in fields ? (
        <label className="mlo-check">
          <input type="checkbox" checked={confirmed} onChange={(e) => update(it.id, (x) => ({ ...x, answers: { ...x.answers, optOutOk: e.target.checked ? [...new Set([...(x.answers.optOutOk ?? []), card.col])] : (x.answers.optOutOk ?? []).filter((n) => n !== card.col) } }))} />
          <span>{c.optOutConfirm}</span>
        </label>
      ) : null}
      {card.suggest || useGuess || (card.status === "check" && card.note && card.note !== "optout" && card.note !== "question") ? (
        <div className="mlo-row-form im-col__acts">
          {useGuess ? (
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => update(it.id, (x) => setTarget(x, card.col, guess!.field as Field))} aria-describedby={id}>{c.useGuess}</button>
          ) : null}
          {card.suggest ? (
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => update(it.id, (x) => setTarget(x, card.col, card.suggest as Field))}>{c.useAs(fields[card.suggest] ?? card.suggest)}</button>
          ) : null}
          {card.status === "check" && card.note && card.note !== "optout" && card.note !== "question" ? (
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => update(it.id, (x) => ({ ...x, ok: [...new Set([...x.ok, card.col])] }))}>{c.looksRight}</button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="mlo-btn mlo-btn--ghost im-choice" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

function QuestionCard({ it, q: x, update }: { it: Item; q: Question; update: (id: string, fn: (it: Item) => Item) => void }) {
  const left = unanswered([x], it.answers);
  const id = `im-q-${it.id}-${x.kind}-${x.col}`;
  const setAnswers = (a: Partial<Item["answers"]>) => update(it.id, (y) => ({ ...y, answers: { ...y.answers, ...a } }));
  // D93: the best guess for how names are written; the question still waits for the loan officer's answer.
  const named = x.kind === "name" ? nameGuess(it.table, it.mapping, it.m8) : null;
  return (
    <div className="im-q" role="group" aria-labelledby={id} data-open={left ? "" : undefined}>
      <p className="im-q__eyebrow">{q.title(x.header)}</p>
      {x.kind === "date" ? (
        <>
          <p id={id} className="im-q__ask">{q.date(x.example)}</p>
          <div className="mlo-row-form">
            {(["mdy", "dmy"] as DateOrder[]).map((o, i) => (
              <Choice key={o} on={it.answers.dateOrder === o} onClick={() => setAnswers({ dateOrder: o })}>{x.readings[i]}</Choice>
            ))}
          </div>
          <p className="mlo-note">{x.mixed ? q.dateMixed : q.dateNote}</p>
        </>
      ) : x.kind === "name" ? (
        <>
          <p id={id} className="im-q__ask">{q.name}</p>
          {named ? <p className="im-col__guess"><strong>{named.by === "m8" ? ic.guess.m8 : ic.guess.rules}</strong> {q.nameOrders[named.order]}. {named.text}</p> : null}
          <div className="mlo-row-form">
            {(["first_last", "last_first"] as NameOrder[]).map((o) => (
              <Choice key={o} on={it.answers.nameOrder === o} onClick={() => setAnswers({ nameOrder: o })}>{q.nameOrders[o]}{named?.order === o ? ` ${q.guessed}` : ""}</Choice>
            ))}
          </div>
          <ul className="im-q__preview" aria-label={q.preview}>
            {x.samples.map((s) => (
              <li key={s}>{it.answers.nameOrder ? q.previewAs(s, namePreview(s, it.answers.nameOrder)) : q.previewBoth(s, splitName(s, "first_last")[0], splitName(s, "last_first")[0])}</li>
            ))}
          </ul>
          <p className="mlo-note">{q.nameNote}</p>
        </>
      ) : x.kind === "consent" ? (
        <>
          <p id={id} className="im-q__ask">{q.consent(x.header)}</p>
          <ul className="im-q__values">
            {[...x.values.map((v) => ({ key: v.key, label: q.value(v.value, v.count) })), ...(x.other ? [{ key: "*", label: q.other(x.other) }] : [])].map((v) => {
              const cur = it.answers.consent?.[x.field]?.[v.key];
              const set = (yes: boolean) => setAnswers({ consent: { ...it.answers.consent, [x.field]: { ...it.answers.consent?.[x.field], [v.key]: yes } } });
              return (
                <li key={v.key} className="im-q__value">
                  <span>{v.label}</span>
                  <div className="mlo-row-form">
                    <Choice on={cur === true} onClick={() => set(true)}>{q.optedIn}</Choice>
                    <Choice on={cur === false} onClick={() => set(false)}>{q.notOptedIn}</Choice>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mlo-note">{q.consentNote}</p>
        </>
      ) : null}
    </div>
  );
}
