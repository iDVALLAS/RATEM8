"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseCsv, MAX_ROWS, type Csv } from "@/lib/contacts/csv";
import { autoMap, buildRecords, guardOptOuts, stopsEverything, type Field, type ImportKind, type ImportRecord, type Mapping } from "@/lib/contacts/mapping";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import { cleanEmail, toE164 } from "@/lib/contacts/normalize";
import { buildAnswers, columnCards, consentSummary, extraColumns, fileQuestions, matchFlags, skippedCsv, unanswered } from "@/lib/contacts/review";
import { mergeRecords, parseVcf, relationshipFromName, shapes, smartMap, toCleanCsv, toTable } from "@/lib/contacts/smart";
import { browserInflate, readXlsx } from "@/lib/contacts/xlsx";
import { aiMapAction, importBatchAction } from "../actions";
import type { Provenance } from "@/lib/contacts/store";
import { importedTag, tagHref } from "@/lib/contacts/tags";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";
import ColumnsStep from "./ColumnsStep";
import ReviewStep, { downloadText, type ReachSuggestion } from "./ReviewStep";
import { lookKey, setFix, setTarget, type Item, type Look } from "./types";

const SOURCES: [Provenance, string][] = [
  ["personal", "My own relationships (my phone, my email, people I know)"],
  ["own_closings", "My own closed loans (from my records or public records)"],
  ["agent_partner", "Agents I work with"],
  // D74: bought leads and web-form leads are their own source.
  ["lead_vendor", "Leads I bought or got from a web form (Zillow, Bankrate, LeadPOPs…)"],
  ["prior_employer", "Exported from a previous employer's system"],
  ["unknown", "Not sure"],
];

const BATCH = 500;
const MAX_TOTAL = 50_000;
const MAX_FILE = 25 * 1024 * 1024;

type Step = 1 | 2 | 3 | 4;
type Sum = { created: number; merged: number; skipped: number; optedOut: number };

const uid = () => Math.random().toString(36).slice(2, 10);

/** A table from any file the loan officer drops. Everything is read here, in the browser. */
async function readFile(f: File): Promise<{ name: string; table: Csv }[] | string> {
  const lower = f.name.toLowerCase();
  if (f.size > MAX_FILE) return `${f.name} is over 25 MB. Split it into smaller files.`;
  if (/\.(xls|numbers|ods)$/.test(lower)) return `${f.name}: open it and save it as .xlsx or .csv first (this older format can't be read in the browser).`;
  try {
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
      const sheets = await readXlsx(new Uint8Array(await f.arrayBuffer()), browserInflate);
      const out = sheets.filter((s) => s.rows.length > 1).map((s) => ({ name: sheets.length > 1 ? `${f.name} · ${s.name}` : f.name, table: toTable(s.rows) }));
      return out.length ? out : `${f.name} has no rows.`;
    }
    const text = await f.text();
    if (lower.endsWith(".vcf") || /^BEGIN:VCARD/im.test(text.slice(0, 200))) {
      const t = parseVcf(text);
      return t.rows.length ? [{ name: f.name, table: t }] : `${f.name} has no contact cards.`;
    }
    const c = parseCsv(text);
    const t = toTable([c.headers, ...c.rows]);
    return t.rows.length ? [{ name: f.name, table: t }] : `${f.name} has no rows.`;
  } catch {
    return `${f.name} couldn't be read. If it's a spreadsheet, save it as .xlsx or .csv and try again.`;
  }
}

/** A list as first read: matched by names and contents, every review answer empty. */
function freshItem(id: string, name: string, table: Csv, kind: ImportKind): Item {
  const mapping = smartMap(table, kind);
  return withPanel({ id, name, table, mapping, rel: kind === "agents" ? null : relationshipFromName(name), by: "names", tags: [], choice: {}, flags: matchFlags(table, autoMap(table.headers, kind), mapping, null), ok: [], answers: {}, fixes: {}, expanded: null }, kind);
}

/** D74: the columns panel starts open when a column needs checking (2+ unmatched columns always do), and stays as it is after. */
function withPanel(it: Item, kind: ImportKind): Item {
  const open = fileQuestions(it.table, it.mapping, kind).map((q) => q.col);
  return { ...it, expanded: columnCards(it.table, it.mapping, kind, it.choice, { flags: it.flags }, open).some((c) => c.status === "check") };
}

/**
 * The one-drop import (D42), reviewed in four steps (D74): add files (and
 * say what they are and where they're from), check how each column was read
 * and answer any format question, fix what needs a look and tag them, then
 * confirm the consent summary and import. Files are read in the browser;
 * M8 sees column names and value shapes only; only the cleaned rows are
 * sent, in batches.
 */
export default function ImportWizard({ initialKind, knownTags = [] }: { initialKind: ImportKind; knownTags?: string[] }) {
  const [step, setStep] = useState<Step>(1);
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [provenance, setProvenance] = useState<Provenance | "">(initialKind === "agents" ? "agent_partner" : "");
  const [autoSource, setAutoSource] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [reading, setReading] = useState(false);
  const [paste, setPaste] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<(Sum & { inFile: number; total: number; skippedCsv: string | null; tags: string[] }) | null>(null);
  // D69: where a stopped import picks up again (the first person not yet sent), and what was already done.
  const [resume, setResume] = useState<{ at: number; sum: Sum } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // D73: tags for everyone in this import, starting with the day of the run ("Imported Nov 21, 2026"; removable).
  const [importTags, setImportTags] = useState<string[]>(() => [importedTag(new Date())]);
  const top = useRef<HTMLOListElement>(null);
  const firstStep = useRef(true);

  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  }, [step]);

  const update = (id: string, fn: (it: Item) => Item) => {
    setItems((cur) => cur.map((x) => (x.id === id ? fn(x) : x)));
    setResume(null);
  };

  const views = useMemo(
    () =>
      items.map((it) => {
        const questions = fileQuestions(it.table, it.mapping, kind);
        const open = questions.filter((q) => q.kind !== "optout" && unanswered([q], it.answers) > 0).map((q) => q.col);
        const cards = columnCards(it.table, it.mapping, kind, it.choice, { flags: it.flags, ok: it.ok, optOutOk: it.answers.optOutOk }, open);
        return { it, cards, questions, pending: unanswered(questions, it.answers) };
      }),
    [items, kind],
  );
  const pending = views.reduce((n, v) => n + v.pending, 0);

  const built = useMemo(() => {
    const per = items.map((it) => ({
      it,
      ...buildRecords(it.table, it.mapping, kind, {
        defaultRelationship: it.rel,
        fileName: it.name,
        extraTags: [...importTags, ...it.tags],
        columns: extraColumns(it.table, it.mapping, it.choice),
        ...buildAnswers(it.table, it.mapping, it.answers),
        fixes: it.fixes,
      }),
    }));
    const merged = mergeRecords(per.map((p) => p.records));
    const looks: Look[] = per.flatMap((p) => p.warnings.map((w) => ({ ...w, itemId: p.it.id, file: p.it.name, key: lookKey(p.it.id, w.at, w.field) })));
    const skipped = per.flatMap((p) => p.problems.map((x) => ({ ...x, file: p.it.name, headers: p.it.table.headers, itemId: p.it.id })));
    const records = merged.records.slice(0, MAX_TOTAL);
    // D69: people whose file says stop, for the notice before import.
    const stops = {
      all: records.filter((r) => stopsEverything(r)).length,
      phone: records.filter((r) => r.optOuts && !stopsEverything(r) && (r.optOuts.text || r.optOuts.call)).length,
      email: records.filter((r) => r.optOuts && !stopsEverything(r) && r.optOuts.email).length,
    };
    return { per, records, merged: merged.merged, looks, skipped, stops, over: merged.records.length > MAX_TOTAL ? MAX_TOTAL : null };
  }, [items, kind, importTags]);

  // D74: "Use column 'Home #' as Other phone?" when a column in notes could reach a skipped row.
  const suggestions = useMemo<ReachSuggestion[]>(
    () =>
      views.flatMap(({ it, cards }) =>
        cards
          .filter((c) => c.suggest && built.skipped.some((p) => p.itemId === it.id && (c.suggest === "email" ? cleanEmail(p.cells?.[c.col]) : toE164(p.cells?.[c.col]))))
          .map((c) => ({ itemId: it.id, col: c.col, field: c.suggest as Field, header: c.header })),
      ),
    [views, built.skipped],
  );

  const dateOrderOf = (itemId: string) => {
    const it = items.find((x) => x.id === itemId);
    return it ? buildAnswers(it.table, it.mapping, it.answers).dateOrder : undefined;
  };

  const addTables = async (tables: { name: string; table: Csv }[]) => {
    const next: Item[] = [];
    for (const t of tables) {
      const table = { headers: t.table.headers, rows: t.table.rows.slice(0, MAX_ROWS) };
      const base = freshItem(uid(), t.name, table, kind);
      if (kind === "contacts") {
        // M8 sees headers and value shapes only ("Aaa Aaa", "(999) 999-9999"), never the values.
        const ai = await aiMapAction({ fileName: t.name, kind, columns: shapes(base.table) }).catch(() => null);
        if (ai?.ok) {
          const m: Mapping = { ...ai.mapping };
          const used = new Set(Object.values(m));
          for (const [f, col] of Object.entries(base.mapping) as [Field, number][]) if (m[f] === undefined && !used.has(col)) m[f] = col;
          if (m.firstName !== undefined && m.lastName !== undefined) delete m.fullName;
          const flags = matchFlags(table, autoMap(table.headers, kind), base.mapping, { fields: ai.fields ?? [], unsure: ai.unsure ?? [] });
          next.push(withPanel({ ...base, mapping: guardOptOuts(base.table.headers, m), rel: base.rel ?? ai.relationship, by: "m8", flags }, kind));
          continue;
        }
      }
      next.push(base);
    }
    // D74: a file named like a lead list ("Zillow leads.csv") picks "Leads I bought…" when no source is picked yet.
    if (!provenance && kind === "contacts" && next.some((it) => relationshipFromName(it.name) === "lead")) {
      setProvenance("lead_vendor");
      setAutoSource(true);
    }
    setItems((cur) => [...cur, ...next]);
    setResume(null);
  };

  const onFiles = async (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    setResult(null);
    setReading(true);
    const errs: string[] = [];
    const tables: { name: string; table: Csv }[] = [];
    for (const f of Array.from(list).slice(0, 20)) {
      const r = await readFile(f);
      if (typeof r === "string") errs.push(r);
      else tables.push(...r);
    }
    await addTables(tables);
    setErrors(errs);
    setReading(false);
  };

  const onPaste = async () => {
    const c = parseCsv(paste);
    const t = toTable([c.headers, ...c.rows]);
    if (!t.rows.length) return setErrors(["Paste at least a header row and one row of people (copy the cells straight from Excel or Google Sheets)."]);
    setReading(true);
    await addTables([{ name: "Pasted rows", table: t }]);
    setPaste("");
    setReading(false);
  };

  const switchKind = (k: ImportKind) => {
    setKind(k);
    setItems((cur) => cur.map((it) => ({ ...freshItem(it.id, it.name, it.table, k), tags: it.tags })));
  };

  const run = async () => {
    if (!provenance) return setErrors([ic.pickSource]);
    setErrors([]);
    const records: ImportRecord[] = built.records;
    const total = records.length;
    // D69: resuming starts where the last run stopped, keeping what it already counted.
    const start = resume && resume.at < total ? resume.at : 0;
    const sum: Sum = start && resume ? { ...resume.sum } : { created: 0, merged: 0, skipped: built.skipped.length, optedOut: 0 };
    setProgress({ done: start, total });
    const source = items.length === 1 ? items[0].name : `${items.length} files`;
    for (let i = start; i < total; i += BATCH) {
      const res = await importBatchAction({ kind, source, provenance, records: records.slice(i, i + BATCH), offset: i });
      if (!res.ok) {
        setErrors([res.error]);
        setProgress(null);
        setResume({ at: i, sum: { ...sum } });
        return;
      }
      sum.created += res.result.created;
      sum.merged += res.result.merged;
      sum.skipped += res.result.skipped;
      sum.optedOut += res.result.optedOut;
      setProgress({ done: Math.min(i + BATCH, total), total });
    }
    setProgress(null);
    setResume(null);
    setResult({ ...sum, inFile: built.merged, total: sum.created + sum.merged, skippedCsv: built.skipped.length ? skippedCsv(built.skipped) : null, tags: [...importTags] });
    setItems([]);
    setStep(1);
  };

  if (result) {
    const d = ic.done;
    const doneTag = result.tags[0] ?? null;
    const stats: [number, string, React.ReactNode?][] = [
      [result.created, d.stats.created],
      [result.merged, d.stats.merged],
      [result.inFile, d.stats.inFile],
      [result.skipped, d.stats.skipped, result.skippedCsv ? <button type="button" className="cc-linkbtn" onClick={() => downloadText(result.skippedCsv!, `loanm8-skipped-rows-${new Date().toISOString().slice(0, 10)}.csv`)}>{d.downloadSkipped}</button> : null],
      [result.optedOut, d.stats.optedOut],
    ];
    return (
      <section className="mlo-section" role="status">
        <h2>{d.title}</h2>
        <p className="mlo-note">{d.lead(result.total, result.tags)}</p>
        <ul className="im-stats">
          {stats.map(([n, label, extra]) => (
            <li key={label} className="cc-card">
              <strong className="im-stats__n">{n.toLocaleString("en-US")}</strong>
              <span>{label}</span>
              {extra}
            </li>
          ))}
        </ul>
        <p className="mlo-note">{d.everyone}</p>
        {provenance === "prior_employer" ? <p className="mlo-note">{ic.source.held}</p> : null}
        <div className="mlo-actions">
          {doneTag ? (
            <>
              <Link href={tagHref(doneTag, kind === "agents" ? "agent" : "contact")} className="mlo-btn">{tc.seeImport}</Link>
              <Link href={tagHref(doneTag, kind === "agents" ? "agent" : "contact", { select: "all" })} className="mlo-btn mlo-btn--ghost">{tc.tagImport}</Link>
            </>
          ) : (
            <Link href={kind === "agents" ? "/mlo/contacts?kind=agent" : "/mlo/contacts"} className="mlo-btn">See them</Link>
          )}
          {kind === "contacts" ? <Link href="/mlo/contacts/permission" className="mlo-btn mlo-btn--ghost">Record the permission you hold</Link> : null}
          <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => { setResult(null); setConfirmed(false); setImportTags([importedTag(new Date())]); }}>{d.another}</button>
        </div>
      </section>
    );
  }

  const cs = consentSummary(built.records);
  const needConfirm = kind === "contacts" && cs.anyIn > 0;
  const sourceRadios = (
    <div className="mlo-grid" role="radiogroup" aria-label={ic.sourceTitle}>
      {SOURCES.map(([k, label]) => (
        <label key={k} className="mlo-check">
          <input type="radio" name={`provenance-${step}`} checked={provenance === k} onChange={() => { setProvenance(k); setAutoSource(false); }} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <>
      <ol ref={top} className="im-steps" aria-label={ic.stepsLabel}>
        {ic.steps.map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? "step" : undefined} data-done={step > i + 1 ? "" : undefined}>
            <span className="im-steps__n" aria-hidden="true">{step > i + 1 ? "✓" : i + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="mlo-section">
          <h2>{ic.kindLabel}</h2>
          <div className="mlo-row-form" role="radiogroup" aria-label={ic.kindLabel}>
            {(["contacts", "agents"] as const).map((k) => (
              <label key={k} className="mlo-check">
                <input type="radio" name="kind" checked={kind === k} onChange={() => switchKind(k)} />
                <span>{ic.kinds[k]}</span>
              </label>
            ))}
          </div>
          <h3 className="cc-card__title im-sub">{ic.sourceTitle}</h3>
          <p className="mlo-note">{ic.sourceNote}</p>
          {sourceRadios}
          {autoSource && provenance === "lead_vendor" ? <p className="mlo-note">{ic.leadVendorPicked}</p> : null}
          <label
            className={`im-drop ${drag ? "im-drop--on" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void onFiles(e.dataTransfer.files); }}
          >
            <input type="file" multiple accept=".xlsx,.xlsm,.csv,.tsv,.txt,.vcf,text/csv,text/vcard" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} className="im-drop__input" />
            <span className="im-drop__title">{reading ? "Reading your files…" : "Drop your contact files here, or tap to choose"}</span>
            <span className="mlo-note">Excel (every sheet), CSV, or phone contacts (.vcf). Exports from Bonzo, Total Expert, Jungo, Salesforce, Google, Outlook, iPhone or Android all work. As many files as you like; they&apos;re combined and duplicates merged. Your files stay on this device; only the cleaned rows are sent.</span>
          </label>
          <details className="mlo-details">
            <summary>Or paste rows from a spreadsheet</summary>
            <textarea className="mlo-textarea" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Copy the cells (with the header row) and paste them here" />
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={onPaste} disabled={reading || paste.trim().length < 5}>Use these rows</button>
          </details>
          {kind === "agents" ? <p className="mlo-note im-gap">RETR&apos;s terms (updated September 2026) don&apos;t allow its data to be used with AI or automated tools, so agent lists are matched without M8, and M8 never sees agents&apos; production.</p> : null}
          {errors.map((e, i) => <div key={i} className="mlo-flash mlo-flash--err" role="alert">{e}</div>)}
          {items.length ? (
            <>
              <h3 className="cc-card__title im-sub">{ic.files(items.length)}</h3>
              <ul className="im-filelist">
                {items.map((it) => (
                  <li key={it.id} className="im-filelist__row">
                    <span className="im-filelist__name"><strong>{it.name}</strong> <span className="mlo-note">{ic.rowsCols(it.table.rows.length, it.table.headers.length)}</span></span>
                    <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => { setItems((cur) => cur.filter((x) => x.id !== it.id)); setResume(null); }} aria-label={`${ic.remove}: ${it.name}`}>{ic.remove}</button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="mlo-row-form im-nav">
            <button type="button" className="mlo-btn" disabled={!items.length || reading} onClick={() => setStep(2)} aria-describedby={!items.length ? "im-add-first" : undefined}>{ic.next}</button>
          </div>
          {!items.length ? <p id="im-add-first" className="mlo-note im-gap">{ic.addFirst}</p> : null}
        </section>
      ) : step === 2 ? (
        <>
          <ColumnsStep kind={kind} files={views} update={update} />
          <section className="mlo-section im-navsec">
            <div className="mlo-row-form im-nav">
              <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => setStep(1)}>{ic.back}</button>
              <button type="button" className="mlo-btn" disabled={pending > 0} onClick={() => setStep(3)} aria-describedby={pending ? "im-pending" : undefined}>{ic.columns.next}</button>
            </div>
            {pending ? <p id="im-pending" className="mlo-note im-gap">{ic.columns.pending(pending)}</p> : null}
          </section>
        </>
      ) : step === 3 ? (
        <>
          <ReviewStep
            kind={kind}
            items={items}
            records={built.records}
            merged={built.merged}
            over={built.over}
            looks={built.looks}
            skipped={built.skipped}
            suggestions={suggestions}
            stops={built.stops}
            importTags={importTags}
            setImportTags={setImportTags}
            knownTags={knownTags}
            dateOrderOf={dateOrderOf}
            onFix={(l, v) => update(l.itemId, (it) => setFix(it, l.at, l.field, v))}
            onUseColumn={(s) => update(s.itemId, (it) => setTarget(it, s.col, s.field))}
            update={update}
          />
          <section className="mlo-section im-navsec">
            <div className="mlo-row-form im-nav">
              <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => setStep(2)}>{ic.back}</button>
              <button type="button" className="mlo-btn" disabled={!built.records.length} onClick={() => setStep(4)}>{ic.review.next}</button>
            </div>
            {built.looks.length ? <p className="mlo-note im-gap">{ic.review.nextNote(built.looks.length)}</p> : null}
          </section>
        </>
      ) : (
        <section className="mlo-section">
          <h2>{ic.source.title}</h2>
          <p className="mlo-note">{ic.sourceNote}</p>
          {sourceRadios}
          {kind === "contacts" ? (
            <div className="mlo-flash mlo-flash--ok im-consent" role="status">
              {cs.anyIn ? <p>{ic.source.optIns(cs)}</p> : null}
              {cs.stops ? <p>{ic.source.stops(cs.stops)}</p> : null}
              {!cs.anyIn && !cs.stops ? <p>{ic.source.none}</p> : null}
            </div>
          ) : null}
          {needConfirm ? (
            <label className="mlo-check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>{ic.source.confirm}</span>
            </label>
          ) : null}
          {provenance === "prior_employer" ? <p className="mlo-note">{ic.source.held}</p> : null}
          <div className="mlo-row-form im-nav">
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => setStep(3)} disabled={!!progress}>{ic.back}</button>
            <button type="button" className="mlo-btn" disabled={!built.records.length || !!progress || !provenance || (needConfirm && !confirmed)} onClick={run} aria-describedby={!provenance ? "im-pick-source" : needConfirm && !confirmed ? "im-confirm-first" : undefined}>
              {progress ? ic.source.importing(progress.done, progress.total) : resume && resume.at < built.records.length ? ic.resume(resume.at + 1) : ic.source.import(built.records.length)}
            </button>
            <button type="button" className="mlo-btn mlo-btn--ghost" disabled={!built.records.length} onClick={() => downloadText(toCleanCsv(built.records), `loanm8-contacts-cleaned-${new Date().toISOString().slice(0, 10)}.csv`)}>{ic.source.cleaned}</button>
          </div>
          {!provenance && built.records.length ? <p id="im-pick-source" className="mlo-note im-gap">{ic.pickSource}</p> : null}
          {provenance && needConfirm && !confirmed ? <p id="im-confirm-first" className="mlo-note im-gap">{ic.source.confirmFirst}</p> : null}
          {resume && !progress && resume.at > 0 && resume.at < built.records.length ? <p className="mlo-note im-gap">{ic.resumeNote(resume.at)}</p> : null}
          {errors.map((e, i) => <div key={i} className="mlo-flash mlo-flash--err" role="alert">{e}</div>)}
        </section>
      )}
    </>
  );
}
