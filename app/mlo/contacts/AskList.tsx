"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cleanRule, describeRule, ruleQuery, type ListRule, type RuleChip } from "@/lib/contacts/filter";
import { LOAN_PROGRAMS, LOAN_PURPOSES, RATE_TYPES, type LoanProgram, type LoanPurpose, type RateType } from "@/lib/contacts/loan";
import { RELATIONSHIP_LABELS } from "@/lib/contacts/mapping";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { US_STATES } from "@/lib/us-states";
import { askListAction } from "./actions";

const a = lc.ask;
type Group = "rate" | "closed" | "amount" | "program" | "rateType" | "arm" | "purpose" | "lender" | "hasClosed" | "relationship" | "state" | "tag";
/** Which editor a chip opens (others can only be removed; the Filters fold changes them). */
const GROUP_OF: Record<string, Group> = { "rmin,rmax": "rate", "cfrom,cto": "closed", "amin,amax": "amount", prog: "program", rtype: "rateType", armdays: "arm", purpose: "purpose", lender: "lender", closed: "hasClosed", rel: "relationship", state: "state", tag: "tag" };
const LOAN_GROUPS: Group[] = ["rate", "closed", "program", "rateType", "arm", "purpose", "lender", "amount", "hasClosed"];
const ARM_DAYS = [90, 180, 365, 730];

/** The rule without the parts a chip stands for. */
export function without(rule: ListRule, key: string, label: string): ListRule {
  const r: ListRule = { ...cleanRule(rule) };
  for (const k of key.split(",")) {
    switch (k) {
      case "q": delete r.q; break;
      case "rel": delete r.relationship; break;
      case "tag": r.tagsAny = (r.tagsAny ?? []).filter((t) => lc.chip.tag(t) !== label); break;
      case "tagall": r.tagsAll = (r.tagsAll ?? []).filter((t) => lc.chip.loan.tagAll(t) !== label); break;
      case "state": delete r.state; break;
      case "perm": delete r.permission; break;
      case "added": delete r.addedWithinDays; break;
      case "import": delete r.importId; break;
      case "contacted": delete r.contactedWithinDays; delete r.quietDays; delete r.neverContacted; break;
      case "noreply": delete r.neverReplied; break;
      case "cfrom": delete r.closedFrom; break;
      case "cto": delete r.closedTo; break;
      case "closed": delete r.hasClosedDate; break;
      case "rmin": delete r.rateMin; break;
      case "rmax": delete r.rateMax; break;
      case "amin": delete r.amountMin; break;
      case "amax": delete r.amountMax; break;
      case "prog": delete r.program; break;
      case "rtype": delete r.rateType; break;
      case "armdays": delete r.armChangeWithinDays; break;
      case "purpose": delete r.purpose; break;
      case "lender": delete r.lender; break;
    }
  }
  return cleanRule(r);
}

/**
 * D80 "Ask M8 for a list", at the top of Contacts. The loan officer types a
 * request; the server reads it into a rule (M8 sees only the request, never
 * a contact; without the AI, simple word matching) and the page shows the
 * people. The rule is shown as chips: tap one to change it, × to drop it,
 * "+ Add a rule" for another. Every change is a new address, so the filter
 * always runs on the server, in the viewer's own book.
 */
export default function AskList({ rule, asked }: { rule: ListRule; asked: "m8" | "words" | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Group | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const kind = rule.kind ?? "contact";
  const chips = describeRule(rule, { relationship: RELATIONSHIP_LABELS, permission: lc.permissionLabels, chip: lc.chip });

  const go = (r: ListRule, by: "m8" | "words" | null = asked) => {
    const q = ruleQuery(cleanRule(r));
    const parts = [q, by ? `asked=${by}` : ""].filter(Boolean).join("&");
    setEdit(null);
    setAdding(false);
    router.push(parts ? `/mlo/contacts?${parts}` : "/mlo/contacts");
  };

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const req = text.trim();
    if (!req) return setError(a.empty);
    start(async () => {
      const r = await askListAction(req).catch(() => null);
      if (!r) return setError(lc.failed);
      if (!r.ok) return setError(r.error);
      setEdit(null);
      setAdding(false);
      router.push(`/mlo/contacts?${r.query ? `${r.query}&` : ""}asked=${r.by}`);
    });
  };

  const groups = (kind === "agent" ? (["state", "tag"] as Group[]) : (["relationship", ...LOAN_GROUPS, "state", "tag"] as Group[]));
  return (
    <section className="cc-ask" aria-labelledby="cc-ask-title">
      <form className="cc-ask__form" onSubmit={ask}>
        <label id="cc-ask-title" htmlFor="cc-ask-input" className="cc-ask__title">{a.title}</label>
        <div className="mlo-row-form cc-ask__row">
          <input id="cc-ask-input" className="mlo-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={a.placeholder} maxLength={300} autoComplete="off" aria-describedby="cc-ask-try" disabled={pending} />
          <button type="submit" className="mlo-btn" disabled={pending}>{pending ? a.working : a.go}</button>
        </div>
      </form>
      {error ? <p className="cc-ask__error" role="alert">{error}</p> : null}
      {chips.length || asked ? (
        <div className="cc-ask__read">
          <span className="cc-ask__as">{asked === "m8" ? a.readAs : asked === "words" ? a.readAsWords : a.filters}</span>
          <ul className="cc-ask__chips" aria-label={asked ? a.readAs : a.filters}>
            {chips.map((c: RuleChip) => {
              const g = GROUP_OF[c.key];
              return (
                <li key={`${c.key}|${c.label}`} className="cc-ask__chip">
                  {g ? (
                    <button type="button" className="cc-tag" aria-expanded={edit === g} aria-label={a.edit(c.label)} onClick={() => { setAdding(false); setEdit(edit === g ? null : g); }}>{c.label}</button>
                  ) : (
                    <span className="cc-tag">{c.label}</span>
                  )}
                  <button type="button" className="cc-ask__x" aria-label={a.remove(c.label)} onClick={() => go(without(rule, c.key, c.label))}>×</button>
                </li>
              );
            })}
            <li>
              <button type="button" className="cc-linkbtn cc-ask__add" aria-expanded={adding} onClick={() => { setEdit(null); setAdding(!adding); }}>{a.addRule}</button>
            </li>
          </ul>
        </div>
      ) : null}
      {adding ? (
        <label className="mlo-field cc-ask__pick">
          <span>{a.pickRule}</span>
          <select className="mlo-select" value="" onChange={(e) => { if (e.target.value) { setAdding(false); setEdit(e.target.value as Group); } }}>
            <option value="">…</option>
            {groups.map((g) => <option key={g} value={g}>{a.fields[g]}</option>)}
          </select>
        </label>
      ) : null}
      {edit ? <Editor key={edit} group={edit} rule={rule} onApply={(r) => go(r)} onCancel={() => setEdit(null)} /> : null}
      {asked === "words" ? <p className="mlo-note cc-ask__note">{a.noAi}</p> : null}
      <p id="cc-ask-try" className="mlo-note cc-ask__note">{a.tryLine}</p>
    </section>
  );
}

/** One rule's editor: the values, then Show them. */
function Editor({ group, rule, onApply, onCancel }: { group: Group; rule: ListRule; onApply: (r: ListRule) => void; onCancel: () => void }) {
  const [lo, setLo] = useState(() => (group === "rate" ? String(rule.rateMin ?? "") : group === "amount" ? String(rule.amountMin ?? "") : group === "closed" ? rule.closedFrom ?? "" : ""));
  const [hi, setHi] = useState(() => (group === "rate" ? String(rule.rateMax ?? "") : group === "amount" ? String(rule.amountMax ?? "") : group === "closed" ? rule.closedTo ?? "" : ""));
  const [progs, setProgs] = useState<LoanProgram[]>(rule.program ?? []);
  const [one, setOne] = useState<string>(() => {
    switch (group) {
      case "rateType": return rule.rateType ?? "arm";
      case "arm": return String(rule.armChangeWithinDays ?? 365);
      case "purpose": return rule.purpose ?? "purchase";
      case "lender": return rule.lender ?? "";
      case "hasClosed": return rule.hasClosedDate === false ? "0" : "1";
      case "relationship": return rule.relationship ?? "past_client";
      case "state": return rule.state ?? "WA";
      case "tag": return rule.tagsAny?.[0] ?? "";
      default: return "";
    }
  });
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const r: ListRule = { ...rule };
    switch (group) {
      case "rate": r.rateMin = num(lo); r.rateMax = num(hi); break;
      case "amount": r.amountMin = num(lo); r.amountMax = num(hi); break;
      case "closed": r.closedFrom = lo || undefined; r.closedTo = hi || undefined; delete r.hasClosedDate; break;
      case "program": r.program = progs.length ? progs : undefined; break;
      case "rateType": r.rateType = one as RateType; break;
      case "arm": r.armChangeWithinDays = Number(one); r.rateType = "arm"; break;
      case "purpose": r.purpose = one as LoanPurpose; break;
      case "lender": r.lender = one.trim() || undefined; break;
      case "hasClosed": r.hasClosedDate = one === "1"; if (one === "0") { delete r.closedFrom; delete r.closedTo; } break;
      case "relationship": r.relationship = one as ListRule["relationship"]; break;
      case "state": r.state = one; break;
      case "tag": r.tagsAny = one.trim() ? [one.trim(), ...(rule.tagsAny ?? []).slice(1)] : (rule.tagsAny ?? []).slice(1); break;
    }
    onApply(r);
  };
  const title = a.fields[group];
  return (
    <form className="cc-card cc-ask__edit" onSubmit={apply} aria-label={title}>
      <p className="cc-card__title">{title}</p>
      <div className="cc-ask__fields">
        {group === "rate" || group === "amount" || group === "closed" ? (
          <>
            <label className="mlo-field"><span>{a.min}</span><input className="mlo-input" type={group === "closed" ? "date" : "number"} step={group === "rate" ? "0.001" : group === "amount" ? "1000" : undefined} min={group === "closed" ? undefined : "0"} inputMode={group === "closed" ? undefined : "decimal"} value={lo} onChange={(e) => setLo(e.target.value)} /></label>
            <label className="mlo-field"><span>{a.max}</span><input className="mlo-input" type={group === "closed" ? "date" : "number"} step={group === "rate" ? "0.001" : group === "amount" ? "1000" : undefined} min={group === "closed" ? undefined : "0"} inputMode={group === "closed" ? undefined : "decimal"} value={hi} onChange={(e) => setHi(e.target.value)} /></label>
          </>
        ) : group === "program" ? (
          <fieldset className="cc-ask__set">
            <legend className="sr-only">{title}</legend>
            {LOAN_PROGRAMS.map((p) => (
              <label key={p} className="mlo-check">
                <input type="checkbox" checked={progs.includes(p)} onChange={(e) => setProgs((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))} />
                <span>{lc.loan.programs[p]}</span>
              </label>
            ))}
          </fieldset>
        ) : group === "lender" || group === "tag" ? (
          <label className="mlo-field"><span>{title}</span><input className="mlo-input" value={one} onChange={(e) => setOne(e.target.value)} maxLength={60} autoComplete="off" /></label>
        ) : (
          <label className="mlo-field">
            <span>{group === "arm" ? a.withinDays : title}</span>
            <select className="mlo-select" value={one} onChange={(e) => setOne(e.target.value)}>
              {group === "rateType" ? RATE_TYPES.map((t) => <option key={t} value={t}>{lc.loan.rateTypes[t]}</option>) : null}
              {group === "arm" ? ARM_DAYS.map((d) => <option key={d} value={String(d)}>{lc.chip.loan.armChange(d)}</option>) : null}
              {group === "purpose" ? LOAN_PURPOSES.map((p) => <option key={p} value={p}>{lc.loan.purposes[p]}</option>) : null}
              {group === "hasClosed" ? <><option value="1">{lc.chip.loan.hasClosed}</option><option value="0">{lc.chip.loan.noClosed}</option></> : null}
              {group === "relationship" ? Object.entries(RELATIONSHIP_LABELS).filter(([k]) => k !== "agent").map(([k, l]) => <option key={k} value={k}>{l}</option>) : null}
              {group === "state" ? US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>) : null}
            </select>
          </label>
        )}
      </div>
      <div className="mlo-actions">
        <button type="submit" className="mlo-btn">{a.apply}</button>
        <button type="button" className="mlo-btn mlo-btn--ghost" onClick={onCancel}>{a.cancel}</button>
      </div>
    </form>
  );
}
