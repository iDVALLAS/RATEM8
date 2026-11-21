"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseCsv, MAX_ROWS, type Csv } from "@/lib/contacts/csv";
import { buildRecords, fieldsFor, guardOptOuts, RELATIONSHIP_LABELS, stopsEverything, type Field, type ImportKind, type ImportRecord, type Mapping, type RowProblem } from "@/lib/contacts/mapping";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import { formatPhone } from "@/lib/contacts/normalize";
import { mergeRecords, parseVcf, relationshipFromName, shapes, smartMap, toCleanCsv, toTable } from "@/lib/contacts/smart";
import { browserInflate, readXlsx } from "@/lib/contacts/xlsx";
import { aiMapAction, importBatchAction } from "../actions";
import type { Provenance } from "@/lib/contacts/store";
import { importedTag, MAX_IMPORT_TAGS, tagHref } from "@/lib/contacts/tags";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";
import TagInput from "../TagInput";

const SOURCES: [Provenance, string][] = [
  ["personal", "My own relationships (my phone, my email, people I know)"],
  ["own_closings", "My own closed loans (from my records or public records)"],
  ["agent_partner", "Agents I work with"],
  ["prior_employer", "Exported from a previous employer's system"],
  ["unknown", "Not sure"],
];

const BATCH = 500;
const MAX_TOTAL = 50_000;
const MAX_FILE = 25 * 1024 * 1024;

type Item = { id: string; name: string; table: Csv; mapping: Mapping; rel: string | null; by: "names" | "m8"; tags: string[] };

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

/**
 * The one-drop import (D42): drop any number of files (Excel with every
 * sheet, CSV, tab-separated text, phone contact cards), or paste rows.
 * Columns are matched by their names and contents, and by M8 from headers
 * and value shapes only. Duplicates across files are merged. Files are
 * read in the browser; only the cleaned rows are sent, in batches.
 */
export default function ImportWizard({ initialKind, knownTags = [] }: { initialKind: ImportKind; knownTags?: string[] }) {
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [provenance, setProvenance] = useState<Provenance | "">(initialKind === "agents" ? "agent_partner" : "");
  const [items, setItems] = useState<Item[]>([]);
  const [reading, setReading] = useState(false);
  const [paste, setPaste] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; merged: number; skipped: number; optedOut: number } | null>(null);
  // D69: where a stopped import picks up again (the first person not yet sent), and what was already done.
  const [resume, setResume] = useState<{ at: number; sum: { created: number; merged: number; skipped: number; optedOut: number } } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  // D73: tags for everyone in this import, starting with the day of the run ("Imported Nov 21, 2026"; removable).
  // Shown only once files are added (in the browser), so the date is the loan officer's own.
  const [importTags, setImportTags] = useState<string[]>(() => [importedTag(new Date())]);
  const [doneTag, setDoneTag] = useState<string | null>(null);

  const fields = fieldsFor(kind);
  const built = useMemo(() => {
    const per = items.map((it) => ({ it, ...buildRecords(it.table, it.mapping, kind, { defaultRelationship: it.rel, fileName: it.name, extraTags: [...importTags, ...it.tags] }) }));
    const merged = mergeRecords(per.map((p) => p.records));
    const problems: (RowProblem & { file: string })[] = per.flatMap((p) => p.problems.map((x) => ({ ...x, file: p.it.name })));
    const warns = per.flatMap((p) => p.warnings);
    const warnings = { zip: warns.filter((w) => w.reason.startsWith("ZIP")).length, date: warns.filter((w) => w.reason.startsWith("date")).length, tags: warns.filter((w) => w.reason.startsWith("tags")).length };
    const records = merged.records.slice(0, MAX_TOTAL);
    // D69: people whose file says stop, for the notice before import.
    const stopAll = records.filter((r) => stopsEverything(r)).length;
    const stopPhone = records.filter((r) => r.optOuts && !stopsEverything(r) && (r.optOuts.text || r.optOuts.call)).length;
    const stopEmail = records.filter((r) => r.optOuts && !stopsEverything(r) && r.optOuts.email).length;
    return { per, records, merged: merged.merged, problems, warnings, stopAll, stopPhone, stopEmail, over: merged.records.length > MAX_TOTAL };
  }, [items, kind, importTags]);

  const addTables = async (tables: { name: string; table: Csv }[]) => {
    const next: Item[] = [];
    for (const t of tables) {
      const base: Item = { id: uid(), name: t.name, table: { headers: t.table.headers, rows: t.table.rows.slice(0, MAX_ROWS) }, mapping: smartMap(t.table, kind), rel: kind === "agents" ? null : relationshipFromName(t.name), by: "names", tags: [] };
      if (kind === "contacts") {
        // M8 sees headers and value shapes only ("Aaa Aaa", "(999) 999-9999"), never the values.
        const ai = await aiMapAction({ fileName: t.name, kind, columns: shapes(base.table) }).catch(() => null);
        if (ai?.ok) {
          const m: Mapping = { ...ai.mapping };
          const used = new Set(Object.values(m));
          for (const [f, col] of Object.entries(base.mapping) as [Field, number][]) if (m[f] === undefined && !used.has(col)) m[f] = col;
          if (m.firstName !== undefined && m.lastName !== undefined) delete m.fullName;
          next.push({ ...base, mapping: guardOptOuts(base.table.headers, m), rel: base.rel ?? ai.relationship, by: "m8" });
          continue;
        }
      }
      next.push(base);
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
    setItems((cur) => cur.map((it) => ({ ...it, mapping: smartMap(it.table, k), rel: k === "agents" ? null : relationshipFromName(it.name), by: "names" })));
  };

  const download = () => {
    const blob = new Blob([toCleanCsv(built.records)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `loanm8-contacts-cleaned-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const run = async () => {
    if (!provenance) return setErrors([ic.pickSource]);
    setErrors([]);
    const records: ImportRecord[] = built.records;
    const total = records.length;
    // D69: resuming starts where the last run stopped, keeping what it already counted.
    const start = resume && resume.at < total ? resume.at : 0;
    const sum = start && resume ? { ...resume.sum } : { created: 0, merged: built.merged, skipped: built.problems.length, optedOut: 0 };
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
    setResult(sum);
    setDoneTag(importTags[0] ?? null);
    setItems([]);
  };

  if (result) {
    return (
      <section className="mlo-section" role="status">
        <h2>Imported</h2>
        <p className="mlo-note">{result.created.toLocaleString("en-US")} new · {result.merged.toLocaleString("en-US")} merged (duplicates in your files, or people you already had) · {result.skipped.toLocaleString("en-US")} skipped (no way to reach them).</p>
        <p className="mlo-note">Everyone starts as <strong>relationship only</strong>: you can call them yourself, but M8 won&apos;t text or call anyone until their permission is recorded with proof.</p>
        {result.optedOut ? <p className="mlo-note">{ic.resultOptedOut(result.optedOut)}</p> : null}
        {provenance === "prior_employer" ? <p className="mlo-note">Because these came from a previous employer&apos;s system, they&apos;re <strong>on hold</strong> until you confirm on the Contacts page that you&apos;re allowed to use the list.</p> : null}
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
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="mlo-section">
        <div className="mlo-row-form" role="radiogroup" aria-label="Import type">
          {(["contacts", "agents"] as const).map((k) => (
            <label key={k} className="mlo-check">
              <input type="radio" name="kind" checked={kind === k} onChange={() => switchKind(k)} />
              <span>{k === "contacts" ? "Clients and contacts" : "Real estate agents"}</span>
            </label>
          ))}
        </div>
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
        {kind === "agents" ? <p className="mlo-note" style={{ marginTop: 8 }}>RETR&apos;s terms (updated September 2026) don&apos;t allow its data to be used with AI or automated tools, so agent lists are matched without M8, and M8 never sees agents&apos; production.</p> : null}
        {errors.map((e, i) => <div key={i} className="mlo-flash mlo-flash--err" role="alert">{e}</div>)}
      </section>

      {items.length ? (
        <>
          <section className="mlo-section" aria-live="polite">
            <h2>{built.records.length.toLocaleString("en-US")} people ready</h2>
            <p className="mlo-note">
              From {items.length} {items.length === 1 ? "list" : "lists"} · {built.merged.toLocaleString("en-US")} duplicates merged (same phone or email) · {built.problems.length.toLocaleString("en-US")} rows skipped
              {built.problems.length ? ` (for example ${built.problems[0].file}, row ${built.problems[0].row}: ${built.problems[0].reason})` : ""}. Phones, emails, states and dates are cleaned; names are split; people are sorted by last name.
              {built.over ? ` Only the first ${MAX_TOTAL.toLocaleString("en-US")} are imported at once; import the rest after.` : ""}
            </p>
            {built.stopAll || built.stopPhone || built.stopEmail ? (
              <div className="mlo-flash mlo-flash--ok" role="status">
                {built.stopAll ? <p>{ic.optOutAll(built.stopAll)}</p> : null}
                {built.stopPhone ? <p>{ic.optOutPhone(built.stopPhone)}</p> : null}
                {built.stopEmail ? <p>{ic.optOutEmail(built.stopEmail)}</p> : null}
              </div>
            ) : null}
            {built.warnings.zip || built.warnings.date || built.warnings.tags ? <p className="mlo-note">{ic.warnings(built.warnings)}</p> : null}
            <div className="im-tags" role="group" aria-labelledby="im-tags-title">
              <h3 id="im-tags-title" className="cc-card__title">{tc.importTitle}</h3>
              <p className="mlo-note">{tc.importNote}</p>
              <TagInput value={importTags} onChange={setImportTags} suggestions={knownTags} max={MAX_IMPORT_TAGS} label={tc.importTitle} />
            </div>
            <ol className="im-files">
              {built.per.map(({ it, records, problems }) => (
                <li key={it.id} className="cc-card">
                  <p className="cc-card__title">{it.name} · {records.length.toLocaleString("en-US")} {records.length === 1 ? "person" : "people"}{problems.length ? ` · ${problems.length} skipped` : ""} · matched by {it.by === "m8" ? "M8 (from column names and shapes only)" : "column names and contents"}</p>
                  <p className="mlo-note">{(Object.entries(it.mapping) as [Field, number][]).filter(([f]) => f in fields).sort((a, b) => a[1] - b[1]).map(([f, col]) => `${it.table.headers[col]} → ${fields[f as keyof typeof fields]}`).join(" · ") || "Nothing matched yet."}</p>
                  {kind === "contacts" ? (
                    <label className="mlo-field" style={{ maxWidth: 360, marginTop: 6 }}>
                      <span>Anyone the file doesn&apos;t label is a</span>
                      <select className="mlo-select" value={it.rel ?? ""} onChange={(e) => setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, rel: e.target.value || null } : x)))}>
                        <option value="">Other / not sure</option>
                        {(["past_client", "lead", "sphere", "agent"] as const).map((r) => <option key={r} value={r}>{RELATIONSHIP_LABELS[r]}</option>)}
                      </select>
                    </label>
                  ) : null}
                  <div className="im-tags im-tags--list" role="group" aria-label={`${tc.listLabel}: ${it.name}`}>
                    <p className="im-tags__label">{tc.listLabel}</p>
                    <TagInput value={it.tags} onChange={(tags) => setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, tags } : x)))} suggestions={knownTags.filter((t) => !importTags.includes(t))} max={MAX_IMPORT_TAGS} label={`${tc.listLabel}: ${it.name}`} />
                    {it.mapping.tags !== undefined ? <p className="mlo-note">{tc.fileColumn}</p> : null}
                  </div>
                  <details className="mlo-details">
                    <summary>Change matches</summary>
                    <div className="mlo-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))" }}>
                      {(Object.entries(fields) as [Field, string][]).map(([f, label]) => (
                        <label key={f} className="mlo-field">
                          <span>{label}</span>
                          <select className="mlo-select" value={it.mapping[f] ?? ""} onChange={(e) => setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, mapping: guardOptOuts(x.table.headers, { ...x.mapping, [f]: e.target.value === "" ? undefined : Number(e.target.value) }) } : x)))}>
                            <option value="">Not in this file</option>
                            {it.table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>
                  <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => { setItems((cur) => cur.filter((x) => x.id !== it.id)); setResume(null); }}>Remove this list</button>
                </li>
              ))}
            </ol>
            <div className="mlo-scroll">
              <table className="mlo-table" style={{ marginTop: 12 }}>
                <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>State</th><th>{kind === "agents" ? "Brokerage" : "Relationship"}</th><th>{tc.previewTags}</th></tr></thead>
                <tbody>
                  {built.records.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      <th scope="row">{`${r.firstName} ${r.lastName}`.trim() || "(no name)"}</th>
                      <td>{formatPhone(r.phone)}</td>
                      <td>{r.email ?? ""}</td>
                      <td>{r.state ?? ""}</td>
                      <td>{kind === "agents" ? r.agent?.brokerage ?? "" : RELATIONSHIP_LABELS[r.relationship]}</td>
                      <td>
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
            {kind === "contacts" && built.records.some((r) => r.attestedOptIns.length) ? <p className="mlo-note" style={{ marginTop: 8 }}>Some files have opt-in columns. Those are recorded as <strong>your word</strong> that they opted in, not as proof.</p> : null}
          </section>

          <section className="mlo-section">
            <h2>Where did these lists come from?</h2>
            <p className="mlo-note">This decides what Command Center may do with them. Lists exported from a previous employer&apos;s system are put on hold until you confirm you&apos;re allowed to use them.</p>
            <div className="mlo-grid">
              {SOURCES.map(([k, label]) => (
                <label key={k} className="mlo-check">
                  <input type="radio" name="provenance" checked={provenance === k} onChange={() => setProvenance(k)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="mlo-row-form" style={{ marginTop: 12 }}>
              <button type="button" className="mlo-btn" disabled={!built.records.length || !!progress || !provenance} onClick={run} aria-describedby={!provenance ? "im-pick-source" : undefined}>
                {progress
                  ? `Importing… ${progress.done.toLocaleString("en-US")} of ${progress.total.toLocaleString("en-US")}`
                  : resume && resume.at < built.records.length
                    ? ic.resume(resume.at + 1)
                    : `Import ${built.records.length.toLocaleString("en-US")} people`}
              </button>
              <button type="button" className="mlo-btn mlo-btn--ghost" disabled={!built.records.length} onClick={download}>Download cleaned CSV</button>
            </div>
            {!provenance && built.records.length ? <p id="im-pick-source" className="mlo-note" style={{ marginTop: 8 }}>{ic.pickSource}</p> : null}
            {resume && !progress && resume.at > 0 && resume.at < built.records.length ? <p className="mlo-note" style={{ marginTop: 8 }}>{ic.resumeNote(resume.at)}</p> : null}
          </section>
        </>
      ) : null}
    </>
  );
}
