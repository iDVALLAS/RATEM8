"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseCsv, MAX_ROWS, type Csv } from "@/lib/contacts/csv";
import { autoMap, buildRecords, guardOptOuts, stopsEverything, type Field, type ImportKind, type ImportRecord } from "@/lib/contacts/mapping";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import { cleanEmail, toE164 } from "@/lib/contacts/normalize";
import { buildAnswers, columnCards, consentSummary, extraColumns, fieldOfColumn, fileQuestions, matchFlags, skippedCsv, unanswered } from "@/lib/contacts/review";
import { mergeRecords, parseVcf, relationshipFromName, smartMap, toCleanCsv, toTable } from "@/lib/contacts/smart";
import { browserInflate, readXlsx } from "@/lib/contacts/xlsx";
import { applyM8, confirmZip, finalSorts, isRetrFile, sortRows, type M8Read, type SortWhy } from "@/lib/contacts/guess";
import { readColumns, readRows } from "@/lib/contacts/ai-safe";
import { canGo, next as nextStep, STEPS, stepBlock, stepStatus, type Step, type StepGate } from "@/lib/contacts/import-steps";
import { aiReadAction, aiSortAction, checkExistingAction, finishImportAction, importBatchAction, saveSuggestedListsAction, startImportAction, undoImportAction } from "../actions";
import ListsStep, { chosenLists, emptyPicks, shownLists, type ListPicks } from "./ListsStep";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import type { Provenance } from "@/lib/contacts/store";
import type { ExistingCheck } from "@/lib/contacts/imports";
import type { ReimportMode } from "@/lib/contacts/reimport";
import { importedTag, mergedTag } from "@/lib/contacts/tags";
import ColumnsStep from "./ColumnsStep";
import ReviewStep, { downloadText, type ReachSuggestion, type SortRow } from "./ReviewStep";
import MatchReview, { existingCounts } from "./MatchReview";
import PermissionDialog from "./PermissionDialog";
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
const FIRST_ROW = 2;

type SavedLine = { name: string; ok: boolean; href: string | null; existing: boolean; as: string | null; error: string | null };
type Sum = { created: number; merged: number; updated: number; skipped: number; optedOut: number; possible: number };
type Kinds = { contacts: boolean; agents: boolean };
/** D75: who's already in the book, for the records as they were when checked. */
export type Existing = { sig: string; by: Record<string, ExistingCheck> } | "checking" | "failed" | null;

const uid = () => Math.random().toString(36).slice(2, 10);
const kindOf = (k: Kinds): ImportKind => (k.contacts ? "contacts" : "agents");

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
  // D93: a ZIP matched by contents that agrees with the State or City column reads Sure.
  const flags = confirmZip(table, mapping, matchFlags(table, autoMap(table.headers, kind), mapping, null));
  return withPanel({ id, name, table, mapping, rel: kind === "agents" ? null : relationshipFromName(name), by: "names", tags: [], choice: {}, flags, ok: [], answers: {}, fixes: {}, expanded: null, m8: null, retr: isRetrFile(name, table.headers), moves: {} }, kind);
}

/** D74: the columns panel starts open when a column needs checking (2+ unmatched columns always do), and stays as it is after. */
function withPanel(it: Item, kind: ImportKind): Item {
  const open = fileQuestions(it.table, it.mapping, kind).map((q) => q.col);
  return { ...it, expanded: columnCards(it.table, it.mapping, kind, it.choice, { flags: it.flags }, open).some((c) => c.status === "check") };
}

/** D93: M8's reading merged under the rules (the rules stay first; consent fields are never M8's). */
function withM8(it: Item, m8: M8Read): Item {
  const { mapping, flags } = applyM8(it.table.headers, it.mapping, it.flags, m8);
  return withPanel({ ...it, mapping: guardOptOuts(it.table.headers, mapping), flags, m8, by: "m8" }, "contacts");
}

/** D93: M8 reads a file's columns (a spread sample of real values; never private columns, agent lists or RETR files). */
async function readWithM8(it: Item): Promise<Item | null> {
  if (it.retr) return null;
  const ai = await aiReadAction({ fileName: it.name, kind: "contacts", headers: it.table.headers, columns: readColumns(it.table, (c) => fieldOfColumn(it.mapping, c)) }).catch(() => null);
  return ai?.ok ? withM8(it, { columns: ai.columns, nameOrder: ai.nameOrder, nameWhy: ai.nameWhy }) : null;
}

/**
 * The one-drop import (D42), reviewed in four steps (D74): add files (and
 * say what they are and where they're from), check how each column was read
 * and answer any format question, fix what needs a look and tag them, then
 * confirm the consent summary and import. D93: M8 reads a sample of each
 * column and gives its best guesses; a file can mix clients and agents; the
 * step pills go back (and forward again) without losing anything; and right
 * after an import the loan officer is asked about permission.
 */
export default function ImportWizard({ initialKind, knownTags = [], lookupPrice = 0.008 }: { initialKind: ImportKind; knownTags?: string[]; lookupPrice?: number }) {
  const [step, setStep] = useState<Step>(1);
  const [reached, setReached] = useState<Step>(1);
  const [kinds, setKinds] = useState<Kinds>({ contacts: initialKind === "contacts", agents: initialKind === "agents" });
  const kind = kindOf(kinds);
  const mixed = kinds.contacts && kinds.agents;
  const [provenance, setProvenance] = useState<Provenance | "">(initialKind === "agents" ? "agent_partner" : "");
  const [autoSource, setAutoSource] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [reading, setReading] = useState(false);
  const [paste, setPaste] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<(Sum & { inFile: number; total: number; skippedCsv: string | null; tags: string[]; importId: string | null; people: number; withPhone: number; files: string[]; mode: ReimportMode; lists: SavedLine[]; kind: ImportKind; mixed: boolean }) | null>(null);
  // D80: the lists suggested at step 3 (M8's from column names and counts only, or the fixed ones), and the loan officer's picks.
  const [listPicks, setListPicks] = useState<ListPicks>(emptyPicks);
  // D69: where a stopped import picks up again (the first person not yet sent), and what was already done. D75: and its run.
  const [resume, setResume] = useState<{ at: number; sum: Sum; importId: string | null } | null>(null);
  // D75: people already in the book: fill blanks (default) or take the newer information; the merge review's answers.
  const [mode, setMode] = useState<ReimportMode>("fill");
  const [decide, setDecide] = useState<Record<string, boolean>>({});
  const [matchTo, setMatchTo] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<Existing>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // D93: files M8 is still reading, and files it's sorting (mixed imports).
  const [m8Busy, setM8Busy] = useState<string[]>([]);
  const [sorting, setSorting] = useState<string[]>([]);
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

  // D93: in a mixed import, each file's rows sorted by the rules (then M8's sort and the loan officer's moves).
  const sorts = useMemo(() => new Map(mixed ? items.map((it) => [it.id, sortRows(it.table, it.mapping)]) : []), [items, mixed]);

  const built = useMemo(() => {
    const per = items.map((it) => {
      const rules = sorts.get(it.id);
      const sort = rules ? finalSorts(rules, it.retr ? undefined : it.m8Sorts, it.moves) : null;
      return {
        it,
        sort,
        ...buildRecords(it.table, it.mapping, kind, {
          defaultRelationship: it.rel,
          fileName: it.name,
          firstRow: FIRST_ROW,
          extraTags: [...importTags, ...it.tags],
          columns: extraColumns(it.table, it.mapping, it.choice),
          ...buildAnswers(it.table, it.mapping, it.answers),
          fixes: it.fixes,
          ...(sort ? { agentRows: sort.agent, brokerageCol: rules?.brokerageCol ?? undefined } : {}),
        }),
      };
    });
    const merged = mergeRecords(per.map((p) => p.records), { refs: per.map((p) => p.it.id), decide, mergedTag: mergedTag(new Date()) });
    const looks: Look[] = per.flatMap((p) => p.warnings.map((w) => ({ ...w, itemId: p.it.id, file: p.it.name, key: lookKey(p.it.id, w.at, w.field) })));
    const skipped = per.flatMap((p) => p.problems.map((x) => ({ ...x, file: p.it.name, headers: p.it.table.headers, itemId: p.it.id })));
    // D75: the loan officer's pick for anyone like a person already in the book.
    const refs = merged.refs.slice(0, MAX_TOTAL);
    const records = merged.records.slice(0, MAX_TOTAL).map((r, i) => (matchTo[refs[i]] ? { ...r, matchTo: matchTo[refs[i]] } : r));
    // D69: people whose file says stop, for the notice before import.
    const stops = {
      all: records.filter((r) => stopsEverything(r)).length,
      phone: records.filter((r) => r.optOuts && !stopsEverything(r) && (r.optOuts.text || r.optOuts.call)).length,
      email: records.filter((r) => r.optOuts && !stopsEverything(r) && r.optOuts.email).length,
    };
    // D93: every row that became a record, with how it was sorted (mixed imports only).
    const sortList: SortRow[] = per.flatMap((p) =>
      p.sort
        ? p.records.map((r) => {
            const at = (r.sourceRow ?? FIRST_ROW) - FIRST_ROW;
            const why: SortWhy = p.sort!.why[at] ?? null;
            return { itemId: p.it.id, at, name: `${r.firstName} ${r.lastName}`.trim() || "(no name)", file: p.it.name, row: r.sourceRow ?? at + FIRST_ROW, agent: p.sort!.agent.has(at), why };
          })
        : [],
    );
    const placeholders = per.reduce((n, p) => n + p.placeholders, 0);
    return { per, records, refs, pairs: merged.pairs, merged: merged.merged, looks, skipped, stops, sortList, placeholders, over: merged.records.length > MAX_TOTAL ? MAX_TOTAL : null };
  }, [items, kind, importTags, decide, matchTo, sorts]);

  const gate: StepGate = { files: items.length, reading, pending, records: built.records.length };
  const go = (target: Step) => {
    if (!canGo(target, step, reached, gate)) return;
    setStep(target);
  };
  const forward = () => {
    const n = nextStep({ step, reached }, gate);
    setStep(n.step);
    setReached(n.reached);
  };

  // D75: after the build, who's already in the book (the server's own matching rules; nothing is saved).
  const sig = useMemo(() => JSON.stringify(built.records.map((r) => [r.firstName, r.lastName, r.phone, r.phone2, r.email, r.street, r.city, r.state, r.zip, r.notes, r.loan, r.agent, r.coBorrower ?? null, r.relationship, r.matchTo ?? ""])), [built.records]);
  const checkedSig = existing && typeof existing === "object" ? existing.sig : null;
  useEffect(() => {
    if (step < 3 || !built.records.length || checkedSig === sig) return;
    let live = true;
    const t = setTimeout(async () => {
      setExisting((cur) => (cur && typeof cur === "object" ? cur : "checking"));
      const by: Record<string, ExistingCheck> = {};
      for (let i = 0; i < built.records.length; i += BATCH) {
        const res = await checkExistingAction({ records: built.records.slice(i, i + BATCH), ...(resume?.importId ? { importId: resume.importId } : {}) }).catch(() => null);
        if (!live) return;
        if (!res?.ok) return setExisting("failed");
        for (const r of res.results) by[built.refs[i + r.i]] = r;
      }
      if (live) setExisting({ sig, by });
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [step, sig, checkedSig, built.records, built.refs, resume?.importId]);

  // D93: in a mixed import, M8 sorts the rows the columns didn't decide (once per file; never a RETR file).
  useEffect(() => {
    if (!mixed || step < 3) return;
    const todo = items.filter((it) => !it.retr && !it.m8Sorts && !sorting.includes(it.id) && sorts.get(it.id)?.sorts.some((s) => s === "unsure"));
    for (const it of todo) {
      const rules = sorts.get(it.id)!;
      const unsure = rules.sorts.map((s, i) => (s === "unsure" ? i : -1)).filter((i) => i >= 0);
      const { cols, rows } = readRows(it.table, unsure);
      setSorting((cur) => [...cur, it.id]);
      aiSortAction({ fileName: it.name, kind: "contacts", headers: it.table.headers, columns: cols.map((c) => ({ col: c, header: it.table.headers[c] ?? "" })), rows })
        .catch(() => null)
        .then((r) => {
          setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, m8Sorts: r?.ok ? r.rows : {} } : x)));
          setSorting((cur) => cur.filter((x) => x !== it.id));
        });
    }
  }, [mixed, step, items, sorts, sorting]);

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

  // D93: what "Fix all with M8" may send: never a RETR file or an agent row, never an agent-only import.
  const m8Allowed = (l: Look) => {
    if (kind !== "contacts") return false;
    const it = items.find((x) => x.id === l.itemId);
    if (!it || it.retr) return false;
    return !built.per.find((p) => p.it.id === l.itemId)?.sort?.agent.has(l.at);
  };
  const contextOf = (l: Look): { file: string; headers: string[]; context: Record<string, string> } => {
    const it = items.find((x) => x.id === l.itemId);
    if (!it) return { file: "", headers: [], context: {} };
    const row = it.table.rows[l.at] ?? [];
    const val = (f: Field) => (it.mapping[f] !== undefined ? (row[it.mapping[f]!] ?? "").trim() : "");
    const context: Record<string, string> = { name: l.name, email: val("email"), phone: val("phone"), street: val("street"), city: val("city"), state: val("state"), zip: val("zip") };
    return { file: it.name, headers: it.table.headers, context: Object.fromEntries(Object.entries(context).filter(([, v]) => v)) };
  };

  const addTables = async (tables: { name: string; table: Csv }[]) => {
    const fresh: Item[] = [];
    for (const t of tables) {
      const table = { headers: t.table.headers, rows: t.table.rows.slice(0, MAX_ROWS) };
      fresh.push(freshItem(uid(), t.name, table, kind));
    }
    // D74: a file named like a lead list ("Zillow leads.csv") picks "Leads I bought…" when no source is picked yet.
    if (!provenance && kind === "contacts" && fresh.some((it) => relationshipFromName(it.name) === "lead")) {
      setProvenance("lead_vendor");
      setAutoSource(true);
    }
    // D93: M8 reads each new file's columns (clients only; never a RETR file).
    const read = kind === "contacts" ? await Promise.all(fresh.map((it) => readWithM8(it))) : [];
    setItems((cur) => [...cur, ...fresh.map((it, i) => read[i] ?? it)]);
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

  /** D93: clients, agents or both. Switching between clients and agents-only reads the columns again; adding agents to clients keeps every choice. */
  const setKind = (k: keyof Kinds, on: boolean) => {
    const nextKinds = { ...kinds, [k]: on };
    if (!nextKinds.contacts && !nextKinds.agents) return;
    setKinds(nextKinds);
    const to = kindOf(nextKinds);
    if (!nextKinds.contacts && provenance === "") setProvenance("agent_partner");
    if (to === kind) return;
    const reset = items.map((it) => ({ ...freshItem(it.id, it.name, it.table, to), tags: it.tags }));
    setItems(reset);
    setResume(null);
    if (to === "contacts") {
      setM8Busy(reset.filter((it) => !it.retr).map((it) => it.id));
      for (const it of reset) {
        void readWithM8(it).then((r) => {
          if (r) setItems((cur) => cur.map((x) => (x.id === it.id && !x.m8 && x.by === "names" && !x.ok.length ? r : x)));
          setM8Busy((cur) => cur.filter((x) => x !== it.id));
        });
      }
    }
  };

  const run = async () => {
    if (!provenance) return setErrors([ic.pickSource]);
    setErrors([]);
    const records: ImportRecord[] = built.records;
    const total = records.length;
    // D69: resuming starts where the last run stopped, keeping what it already counted.
    const start = resume && resume.at < total ? resume.at : 0;
    const sum: Sum = start && resume ? { ...resume.sum } : { created: 0, merged: 0, updated: 0, skipped: 0, optedOut: 0, possible: 0 };
    setProgress({ done: start, total });
    const files = items.map((it) => it.name);
    const source = items.length === 1 ? items[0].name : files.join(", ").slice(0, 160);
    // D75: one id for the run, kept when resuming, on everyone it creates (history and undo).
    let importId = start && resume ? resume.importId : null;
    if (!importId) {
      const started = await startImportAction({ kind, files, provenance, mode, tags: importTags }).catch(() => null);
      if (started && !started.ok) {
        setErrors([started.error]);
        setProgress(null);
        return;
      }
      importId = started?.ok ? started.id : null;
    }
    for (let i = start; i < total; i += BATCH) {
      const res = await importBatchAction({ kind, source, provenance, records: records.slice(i, i + BATCH), offset: i, mode, ...(importId ? { importId } : {}) });
      if (!res.ok) {
        setErrors([res.error]);
        setProgress(null);
        setResume({ at: i, sum: { ...sum }, importId });
        return;
      }
      for (const k of Object.keys(sum) as (keyof Sum)[]) sum[k] += res.result[k] ?? 0;
      setProgress({ done: Math.min(i + BATCH, total), total });
    }
    const csv = built.skipped.length ? skippedCsv(built.skipped) : null;
    const fin = importId ? await finishImportAction(importId, { inFile: built.merged, skipped: built.skipped.length, skippedCsv: csv && csv.length <= 256 * 1024 ? csv : null }).catch(() => null) : null;
    // D80: the lists the loan officer kept at step 3, saved as live lists now that everyone is in.
    const picked = chosenLists(shownLists(listPicks, records, kind, new Date()));
    const saved = picked.length ? await saveSuggestedListsAction(picked).catch(() => null) : null;
    const lists: SavedLine[] = saved?.ok ? saved.saved : picked.map((x) => ({ name: x.name, ok: false, href: null, existing: false, as: null, error: lc.failed }));
    setProgress(null);
    setResume(null);
    const people = fin?.ok ? fin.people : sum.created + sum.merged;
    setResult({ ...sum, skipped: sum.skipped + built.skipped.length, inFile: built.merged, total: sum.created + sum.merged, skippedCsv: csv, tags: [...importTags], importId, people, withPhone: fin?.ok ? fin.withPhone : records.filter((r) => r.phone).length, files, mode, lists, kind, mixed });
    setItems([]);
    setListPicks(emptyPicks());
    setDecide({});
    setMatchTo({});
    setExisting(null);
    setStep(1);
    setReached(1);
  };

  if (result) {
    const d = ic.done;
    const k = result.kind === "agents" ? "agent" : "contact";
    const imp = result.importId;
    const seeHref = imp ? `/mlo/contacts?${new URLSearchParams({ ...(k === "agent" ? { kind: "agent" } : {}), import: imp })}` : k === "agent" ? "/mlo/contacts?kind=agent" : "/mlo/contacts";
    const cost = `$${(Math.max(1, result.withPhone) * lookupPrice).toFixed(2)}`;
    const stats: [number, string, React.ReactNode?][] = [
      [result.created, d.stats.created],
      [result.merged, result.mode === "newer" ? d.stats.mergedNewer : d.stats.merged, result.merged && result.updated ? <span className="mlo-note">{d.updated(result.updated)}</span> : null],
      [result.inFile, d.stats.inFile],
      [result.skipped, d.stats.skipped, result.skippedCsv ? <button type="button" className="cc-linkbtn" onClick={() => downloadText(result.skippedCsv!, `loanm8-skipped-rows-${new Date().toISOString().slice(0, 10)}.csv`)}>{d.downloadSkipped}</button> : null],
      [result.optedOut, d.stats.optedOut],
      ...(result.possible ? [[result.possible, d.stats.possible] as [number, string]] : []),
    ];
    const again = () => { setResult(null); setConfirmed(false); setImportTags([importedTag(new Date())]); setMode("fill"); };
    return (
      <section className="mlo-section" role="status">
        <h2 id="im-done-title" tabIndex={-1}>{d.title}</h2>
        {imp && result.people > 0 && result.kind === "contacts" ? <PermissionDialog importId={imp} returnFocus="im-done-title" /> : null}
        <p className="mlo-note">{d.lead(result.total, result.tags)} {d.from(result.files, SOURCES.find(([p]) => p === provenance)?.[1] ?? "")}</p>
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
        <h3 className="cc-card__title im-sub">{d.next}</h3>
        {imp && result.withPhone ? (
          <Link href={`/mlo/contacts/permission?import=${encodeURIComponent(imp)}#dnc`} className="cc-card im-next__primary">
            <span className="im-next__text"><strong>{d.check(result.withPhone)}</strong><span className="mlo-note">{d.checkNote(cost)}</span></span>
            <span className="im-next__arrow" aria-hidden="true">→</span>
          </Link>
        ) : imp ? <p className="mlo-note">{d.checkNone}</p> : null}
        <ul className="im-next">
          <li><Link href={seeHref} className="cc-card im-next__tile"><strong>{d.see}</strong><span className="mlo-note">{d.seeNote}</span></Link></li>
          {result.mixed && imp ? <li><Link href={`/mlo/contacts?${new URLSearchParams({ kind: "agent", import: imp })}`} className="cc-card im-next__tile"><strong>{ic.sort.lists.agents}</strong><span className="mlo-note">{d.seeNote}</span></Link></li> : null}
          <li><Link href={imp ? `${seeHref}&select=all` : seeHref} className="cc-card im-next__tile"><strong>{d.tag}</strong><span className="mlo-note">{d.tagNote}</span></Link></li>
          {imp && result.people ? <li><Link href={`/mlo/campaigns?import=${encodeURIComponent(imp)}`} className="cc-card im-next__tile"><strong>{d.campaign(result.people)}</strong><span className="mlo-note">{d.campaignNote}</span></Link></li> : null}
          {result.kind === "contacts" ? <li><Link href={imp ? `/mlo/contacts/permission?import=${encodeURIComponent(imp)}#record` : "/mlo/contacts/permission"} className="cc-card im-next__tile"><strong>{d.permission}</strong><span className="mlo-note">{d.permissionNote}</span></Link></li> : null}
          <li><button type="button" className="cc-card im-next__tile" onClick={again}><strong>{d.another}</strong><span className="mlo-note">{d.anotherNote}</span></button></li>
          <li><Link href="/mlo/contacts/import/history" className="cc-card im-next__tile"><strong>{d.history}</strong><span className="mlo-note">{d.historyNote}</span></Link></li>
        </ul>
        {result.lists.length ? (
          <>
            <h3 className="cc-card__title im-sub">{lc.suggest.doneTitle}</h3>
            <ul className="im-next">
              {result.lists.map((l) => (
                <li key={l.name}>
                  {l.ok && l.href ? (
                    <Link href={l.href} className="cc-card im-next__tile"><strong>{l.existing && l.as ? lc.suggest.doneExisting(l.name, l.as) : lc.suggest.doneLine(l.name)}</strong><span className="mlo-note">{lc.liveLabel}</span></Link>
                  ) : (
                    <p className="cc-card im-next__tile mlo-note">{lc.suggest.doneFailed(l.name, l.error ?? lc.failed)}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {imp ? (
          <div className="cc-card im-undo">
            <p className="cc-card__title">{d.undoTitle}</p>
            <p className="mlo-note">{d.undoNote}</p>
            <details className="mlo-details">
              <summary>{ic.history.undo}</summary>
              <p className="mlo-note">{ic.history.undoHow}</p>
              <form action={undoImportAction.bind(null, imp)} className="mlo-row-form">
                <label className="mlo-field"><span>{ic.history.confirmLabel}</span><input name="confirm" required autoComplete="off" maxLength={10} /></label>
                <button type="submit" className="mlo-btn mlo-btn--ghost">{ic.history.undo}</button>
              </form>
            </details>
          </div>
        ) : null}
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
  const retrItems = items.filter((it) => it.retr && kind === "contacts");

  return (
    <>
      {/* D93: the steps are buttons: any step done (or the current one) opens with everything kept. */}
      <ol ref={top} className="im-steps" aria-label={ic.stepsLabel}>
        {ic.steps.map((label, i) => {
          const n = STEPS[i];
          const status = stepStatus(n, step, reached, gate);
          const block = status === "locked" && n <= reached ? stepBlock(n, gate) : null;
          return (
            <li key={label} data-done={status === "done" || (status === "open" && n < reached) ? "" : undefined} data-status={status}>
              <button
                type="button"
                className="im-steps__btn"
                aria-current={status === "current" ? "step" : undefined}
                aria-disabled={status === "locked" ? true : undefined}
                aria-describedby={block ? `im-step-why-${n}` : undefined}
                aria-label={ic.stepGo(label, n)}
                onClick={() => go(n)}
              >
                <span className="im-steps__n" aria-hidden="true">{status === "done" ? "✓" : n}</span>
                <span aria-hidden="true">{label}</span>
              </button>
              {block ? <span id={`im-step-why-${n}`} className="sr-only">{ic.stepLocked[block]}</span> : null}
            </li>
          );
        })}
      </ol>
      {reached > 1 && step < reached ? <p className="mlo-note im-kept">{ic.stepKept}</p> : null}

      {step === 1 ? (
        <section className="mlo-section">
          <h2 id="im-kinds">{ic.kindLabel}</h2>
          <div className="mlo-row-form" role="group" aria-labelledby="im-kinds" aria-describedby="im-kinds-note">
            {(["contacts", "agents"] as const).map((k) => (
              <label key={k} className="mlo-check">
                <input type="checkbox" name={`kind-${k}`} checked={kinds[k]} onChange={(e) => setKind(k, e.target.checked)} aria-describedby={kinds[k] && !kinds[k === "contacts" ? "agents" : "contacts"] ? "im-kinds-one" : undefined} />
                <span>{ic.kinds[k]}</span>
              </label>
            ))}
          </div>
          <p id="im-kinds-note" className="mlo-note">{ic.kindNote}</p>
          <span id="im-kinds-one" className="sr-only">{ic.kindOne}</span>
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
            <span className="im-drop__title">{reading ? ic.dropReading : ic.dropTitle}</span>
            <span className="mlo-note">{ic.dropNote}</span>
          </label>
          <details className="mlo-details">
            <summary>Or paste rows from a spreadsheet</summary>
            <textarea className="mlo-textarea" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Copy the cells (with the header row) and paste them here" aria-label="Rows to paste" />
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={onPaste} disabled={reading || paste.trim().length < 5}>Use these rows</button>
          </details>
          {kind === "agents" ? <p className="mlo-note im-gap">{ic.agentsOnly}</p> : null}
          {retrItems.map((it) => <p key={it.id} className="mlo-note im-gap">{ic.retrFile(it.name)}</p>)}
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
            <button type="button" className="mlo-btn" disabled={!items.length || reading} onClick={forward} aria-describedby={!items.length ? "im-add-first" : undefined}>{ic.next}</button>
          </div>
          {!items.length ? <p id="im-add-first" className="mlo-note im-gap">{ic.addFirst}</p> : null}
        </section>
      ) : step === 2 ? (
        <>
          {m8Busy.length ? <p className="mlo-note" role="status">{ic.guess.reading}</p> : null}
          <ColumnsStep kind={kind} files={views} update={update} />
          <section className="mlo-section im-navsec">
            <div className="mlo-row-form im-nav">
              <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => go(1)}>{ic.back}</button>
              <button type="button" className="mlo-btn" disabled={pending > 0} onClick={forward} aria-describedby={pending ? "im-pending" : undefined}>{ic.columns.next}</button>
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
            placeholders={built.placeholders}
            importTags={importTags}
            setImportTags={setImportTags}
            knownTags={knownTags}
            dateOrderOf={dateOrderOf}
            onFix={(l, v) => update(l.itemId, (it) => setFix(it, l.at, l.field, v))}
            onUseColumn={(s) => update(s.itemId, (it) => setTarget(it, s.col, s.field))}
            update={update}
            m8Allowed={m8Allowed}
            contextOf={contextOf}
            sortList={mixed ? built.sortList : null}
            sortingNow={sorting.length > 0}
            onMove={(r, to) => update(r.itemId, (it) => ({ ...it, moves: { ...it.moves, [r.at]: to } }))}
            preview={existingCounts(existing, built.refs, mode).ready ? ic.reimport.preview({ fresh: existingCounts(existing, built.refs, mode).fresh, existing: existingCounts(existing, built.refs, mode).already, inFile: built.merged }) : null}
            fileLine={(id) => {
              const c = existingCounts(existing, built.refs, mode, id);
              return c.ready && c.already ? ic.reimport.fileCard(c.already, c.change) : null;
            }}
            between={
              <MatchReview
                records={built.records}
                refs={built.refs}
                pairs={built.pairs}
                existing={existing}
                mode={mode}
                setMode={setMode}
                setPair={(key, together) => { setDecide((cur) => ({ ...cur, [key]: together })); setResume(null); }}
                matchTo={matchTo}
                setMatchTo={(ref, to) => { setMatchTo((cur) => { const n = { ...cur }; if (to) n[ref] = to; else delete n[ref]; return n; }); setResume(null); }}
              />
            }
          />
          <ListsStep kind={kind} records={built.records} columns={[...new Set(items.flatMap((it) => it.table.headers.map((h) => h.trim()).filter(Boolean)))]} picks={listPicks} setPicks={setListPicks} />
          <section className="mlo-section im-navsec">
            <div className="mlo-row-form im-nav">
              <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => go(2)}>{ic.back}</button>
              <button type="button" className="mlo-btn" disabled={!built.records.length} onClick={forward}>{ic.review.next}</button>
            </div>
            {built.looks.length ? <p className="mlo-note im-gap">{ic.review.nextNote(built.looks.length)}</p> : null}
          </section>
        </>
      ) : (
        <section className="mlo-section">
          <h2>{ic.source.title}</h2>
          <p className="mlo-note">{ic.sourceNote}</p>
          {sourceRadios}
          {mixed ? <p className="mlo-note">{ic.sort.counts(built.records.length - built.records.filter((r) => r.relationship === "agent").length, built.records.filter((r) => r.relationship === "agent").length)}</p> : null}
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
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => go(3)} disabled={!!progress}>{ic.back}</button>
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
