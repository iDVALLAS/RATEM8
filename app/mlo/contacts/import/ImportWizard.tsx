"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseCsv, MAX_ROWS, type Csv } from "@/lib/contacts/csv";
import { autoMap, buildRecords, fieldsFor, RELATIONSHIP_LABELS, type Field, type ImportKind, type Mapping } from "@/lib/contacts/mapping";
import { formatPhone } from "@/lib/contacts/normalize";
import { importBatchAction } from "../actions";
import type { Provenance } from "@/lib/contacts/store";

const SOURCES: [Provenance, string][] = [
  ["personal", "My own relationships (my phone, my email, people I know)"],
  ["own_closings", "My own closed loans (from my records or public records)"],
  ["agent_partner", "Agents I work with"],
  ["prior_employer", "Exported from a previous employer's system"],
  ["unknown", "Not sure"],
];

const BATCH = 500;

/**
 * The import wizard (D2): pick the file → check the column matches →
 * import. The file is read here in the browser; only the cleaned rows are
 * sent, in batches, and the file itself is never uploaded or kept.
 */
export default function ImportWizard({ initialKind }: { initialKind: ImportKind }) {
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [provenance, setProvenance] = useState<Provenance | "">(initialKind === "agents" ? "agent_partner" : "");
  const [csv, setCsv] = useState<Csv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; merged: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const built = useMemo(() => (csv ? buildRecords(csv, mapping, kind) : null), [csv, mapping, kind]);
  const fields = fieldsFor(kind);

  const onFile = async (f: File | undefined) => {
    setError(null);
    setResult(null);
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return setError("That file is over 10 MB. Split it into smaller files.");
    const parsed = parseCsv(await f.text());
    if (!parsed.headers.length || !parsed.rows.length) return setError("That file has no rows. Export it as CSV with a header row.");
    setCsv(parsed);
    setFileName(f.name);
    setMapping(autoMap(parsed.headers, kind));
  };

  const switchKind = (k: ImportKind) => {
    setKind(k);
    if (csv) setMapping(autoMap(csv.headers, k));
  };

  const run = async () => {
    if (!built) return;
    if (!provenance) return setError("Pick where this list came from first.");
    setError(null);
    const total = built.records.length;
    const sum = { created: 0, merged: 0, skipped: built.problems.length };
    setProgress({ done: 0, total });
    for (let i = 0; i < total; i += BATCH) {
      const res = await importBatchAction({ kind, source: fileName, provenance, records: built.records.slice(i, i + BATCH) });
      if (!res.ok) {
        setError(res.error);
        setProgress(null);
        return;
      }
      sum.created += res.result.created;
      sum.merged += res.result.merged;
      sum.skipped += res.result.skipped;
      setProgress({ done: Math.min(i + BATCH, total), total });
    }
    setProgress(null);
    setResult(sum);
    setCsv(null);
  };

  if (result) {
    return (
      <section className="mlo-section" role="status">
        <h2>Imported</h2>
        <p className="mlo-note">
          {result.created} new · {result.merged} merged into people you already had · {result.skipped} skipped (no way to reach them).
        </p>
        <p className="mlo-note">
          Everyone starts as <strong>relationship only</strong>: you can call them yourself, but M8 won&apos;t text or call anyone until their permission is recorded with proof.
        </p>
        {provenance === "prior_employer" ? (
          <p className="mlo-note">
            Because this list came from a previous employer&apos;s system, these people are <strong>on hold</strong>: nothing will be sent to them until you confirm on the Contacts page that you&apos;re allowed to use the list.
          </p>
        ) : null}
        <p style={{ marginTop: 12 }}>
          <Link href={kind === "agents" ? "/mlo/contacts?kind=agent" : "/mlo/contacts"} className="mlo-btn">See them</Link>
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="mlo-section">
        <h2>1 · What are you importing?</h2>
        <div className="mlo-row-form" role="radiogroup" aria-label="Import type">
          {(["contacts", "agents"] as const).map((k) => (
            <label key={k} className="mlo-check">
              <input type="radio" name="kind" checked={kind === k} onChange={() => switchKind(k)} />
              <span>{k === "contacts" ? "Clients and contacts (from Bonzo, Total Expert, Jungo, Salesforce, Google, Outlook or a spreadsheet)" : "Real estate agents (a RETR export or any agent list)"}</span>
            </label>
          ))}
        </div>
        <label className="mlo-field" style={{ marginTop: 12 }}>
          <span>CSV file (up to {MAX_ROWS.toLocaleString("en-US")} rows). It stays on this computer; only the cleaned rows are sent.</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="mlo-input" />
        </label>
        {kind === "agents" ? (
          <p className="mlo-note" style={{ marginTop: 8 }}>
            RETR&apos;s terms (updated September 2026) don&apos;t allow its data to be used with AI or automated tools. Command Center only shows an agent&apos;s production to you on their page; M8 and Today&apos;s suggestions never use it.
          </p>
        ) : null}
        {error ? <div className="mlo-flash mlo-flash--err" role="alert">{error}</div> : null}
      </section>

      {csv && built ? (
        <>
          <section className="mlo-section">
            <h2>2 · Where did this list come from?</h2>
            <p className="mlo-note">This decides what Command Center may do with it. Lists exported from a previous employer&apos;s system are put on hold until you confirm you&apos;re allowed to use them.</p>
            <div className="mlo-grid">
              {SOURCES.map(([k, label]) => (
                <label key={k} className="mlo-check">
                  <input type="radio" name="provenance" checked={provenance === k} onChange={() => setProvenance(k)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="mlo-section">
            <h2>3 · Check the matches</h2>
            <p className="mlo-note">We matched what we could from {fileName}. Fix anything that&apos;s wrong; leave a field as “Not in my file” to skip it.</p>
            <div className="mlo-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
              {(Object.entries(fields) as [Field, string][]).map(([f, label]) => (
                <label key={f} className="mlo-field">
                  <span>{label}</span>
                  <select
                    className="mlo-select"
                    value={mapping[f] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                  >
                    <option value="">Not in my file</option>
                    {csv.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="mlo-section">
            <h2>4 · Preview</h2>
            <p className="mlo-note">
              {built.records.length.toLocaleString("en-US")} people ready · {built.problems.length} rows will be skipped
              {built.problems.length ? ` (for example row ${built.problems[0].row}: ${built.problems[0].reason})` : ""}. Duplicates of people you already have are merged, by phone or email.
            </p>
            <table className="mlo-table">
              <tbody>
                {built.records.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <th scope="row">{`${r.firstName} ${r.lastName}`.trim() || "(no name)"}</th>
                    <td>{formatPhone(r.phone)}</td>
                    <td>{r.email ?? ""}</td>
                    <td>{r.state ?? ""}</td>
                    <td>{kind === "agents" ? r.agent?.brokerage ?? "" : RELATIONSHIP_LABELS[r.relationship]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {kind === "contacts" && built.records.some((r) => r.attestedOptIns.length) ? (
              <p className="mlo-note" style={{ marginTop: 8 }}>
                Your file has opt-in columns. Those are recorded as <strong>your word</strong> that they opted in, not as proof. M8 calls and marketing texts still need proof (a signed form, a recording or a text reply).
              </p>
            ) : null}
            <button type="button" className="mlo-btn" disabled={!built.records.length || !!progress || !provenance} onClick={run}>
              {progress ? `Importing… ${progress.done.toLocaleString("en-US")} of ${progress.total.toLocaleString("en-US")}` : `Import ${built.records.length.toLocaleString("en-US")} people`}
            </button>
          </section>
        </>
      ) : null}
    </>
  );
}
