import { Fragment } from "react";
import Link from "next/link";
import type { Loan } from "@/lib/pipeline/store";
import type { Journey } from "@/lib/journey/store";
import { DOC_KINDS, DOC_LABELS } from "@/lib/loa/readers";
import { CHECKS, PARTY_ROLES, type Condition, type LoaFile } from "@/lib/loa/store";
import { emailConfirmed, PARTY_LABELS, recompute, toLabel } from "@/lib/loa/service";
import { AUTO_BY, whenLong } from "@/lib/loa/autopilot";
import { daysUntil } from "@/lib/loa/dates";
import { gaps as gapsOf, loanRows, type Purpose, type SwitchSettings } from "@/lib/loa/autonomy";
import { FACT_WORDS, loaAutoWords as aw, loaLoan as w, type FactKey } from "@/lib/content/loa";
import { LoanSwitches } from "./AutonomyGrid";
import { checkAction, conditionAction, correctionAction, sendSoonAction, stopQueuedAction, confirmPartyAction, discardDraftAction, factAction, hoaAction, makeDraftAction, partyAction, pauseLoanAction, purposeAction, readDocAction, reviewAction, sendDraftAction, titleItemAction } from "./actions";
import "./loa.css";

const money = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const OWNER: Record<Condition["owner"], string> = { borrower: "From the borrower", third_party: "From third parties", loan_officer: "For you", lender: "The lender's own" };
const NEXT: Record<Condition["status"], Condition["status"] | null> = { open: "requested", requested: "received", received: "cleared", cleared: null };
const NEXT_LABEL: Record<Condition["status"], string> = { open: "Requested", requested: "Received", received: "Cleared", cleared: "" };

/** D70: one question from "What the contract didn't answer". */
function GapQuestion({ loanId, k, unlocks, current }: { loanId: string; k: FactKey; unlocks: string[]; current: string }) {
  const q = FACT_WORDS[k];
  return (
    <li className="loa-gap">
      <span className="loa-gap__q">{q.ask}</span>
      {k === "hoa" ? (
        <div className="mlo-row-form">
          <form action={hoaAction.bind(null, loanId, true)}><button type="submit" className="mlo-btn mlo-btn--ghost">{FACT_WORDS.hoa.yes}</button></form>
          <form action={hoaAction.bind(null, loanId, false)}><button type="submit" className="mlo-btn mlo-btn--ghost">{FACT_WORDS.hoa.no}</button></form>
        </div>
      ) : (
        <form action={factAction.bind(null, loanId, k)} className="mlo-row-form loa-gap__form">
          <input name="value" className="mlo-input" type={k.endsWith("email") ? "email" : "text"} defaultValue={current} placeholder={"placeholder" in q ? q.placeholder : ""} aria-label={q.ask} required maxLength={120} />
          <button type="submit" className="mlo-btn">{w.saveAnswer}</button>
        </form>
      )}
      {"note" in q ? <span className="mlo-note">{q.note}</span> : null}
      <span className="mlo-note">{w.unlocks}: {unlocks.join(", ")}.</span>
    </li>
  );
}

/** D62: the LOA's work on one loan, on the Loan Journey page. D70 adds the switches, the safe-recipient checks and the questions the contract left open. */
export default function LoaPanel({ loan, file, journey, settings, purpose, canEdit, agentOk, undoMinutes = 15, now = new Date() }: { loan: Loan; file: LoaFile; journey: Journey; settings: SwitchSettings; purpose: Purpose | null; canEdit: boolean; agentOk: boolean; undoMinutes?: number; now?: Date }) {
  const f = recompute(file, loan, journey, now);
  const rows = loanRows({ file: f, purpose, agentOk }, settings, now);
  const live = rows.filter((r) => r.applies);
  const nAuto = live.filter((r) => r.mode === "auto").length;
  const nAsk = live.filter((r) => r.mode === "approve").length;
  const g = gapsOf(rows);
  const party = (role: string) => f.parties.find((p) => p.role === role);
  const currentFor = (k: FactKey) => {
    const m: Partial<Record<FactKey, string | undefined>> = { escrow_company: party("escrow")?.company, escrow_email: party("escrow")?.email, title_company: party("title")?.company, title_email: party("title")?.email, insurance_email: party("insurance")?.email, lender: party("lender")?.company };
    return m[k] ?? "";
  };
  const showGaps = !!f.contract || purpose === "refi";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  const c = f.contract;
  const drafts = f.drafts.filter((d) => d.status === "draft");
  const sent = f.drafts.filter((d) => d.status === "sent");
  const queued = f.drafts.filter((d) => d.status === "queued");
  const autoLog = [...(f.auto ?? [])].reverse().slice(0, 25);
  const byId = new Map(f.drafts.map((d) => [d.id, d]));
  const payoffsOpen = (f.title?.items ?? []).some((x) => x.payoff && x.status === "open");
  return (
    <section className="mlo-section loa-panel" id="loa">
      <h2>Your LOA on this file</h2>
      <div className="loa-strip" id="autopilot-loan">
        {purpose ? (
          <p className="loa-strip__line"><strong>{w.strip}:</strong> {purpose === "refi" ? w.refi : w.purchase}{f.paused ? null : <> · {w.onTheirOwn(nAuto)} · {w.askYou(nAsk)}</>}</p>
        ) : (
          <div className="loa-strip__line">
            <strong>{w.unknownPurpose}</strong>
            <form action={purposeAction.bind(null, loan.id, "purchase")}><button type="submit" className="mlo-btn mlo-btn--ghost">{w.purchase}</button></form>
            <form action={purposeAction.bind(null, loan.id, "refi")}><button type="submit" className="mlo-btn mlo-btn--ghost">{w.refi}</button></form>
          </div>
        )}
        {f.paused ? <p className="mlo-note">{w.paused}</p> : null}
        <div className="loa-strip__acts">
          {canEdit ? <form action={pauseLoanAction.bind(null, loan.id, !f.paused)}><button type="submit" className="mlo-btn mlo-btn--ghost">{f.paused ? w.resume : w.pause}</button></form> : null}
          {purpose ? (
            <details className="loa-strip__more">
              <summary className="mlo-btn mlo-btn--ghost">{w.change}</summary>
              <LoanSwitches loanId={loan.id} rows={rows} overrides={f.autonomy ?? {}} officer={settings.modes} purpose={purpose} canEdit={canEdit} />
            </details>
          ) : null}
        </div>
      </div>
      {f.hold ? (
        <div className="loa-hold" role="alert">
          <strong>{w.holdTitle(PARTY_LABELS[f.hold.role].replace(/ officer$/, ""))}</strong>
          <span>{w.holdNote}</span>
        </div>
      ) : null}
      {f.review?.length ? (
        <div className="loa-review">
          <h3>{w.reviewHeading}</h3>
          <p className="mlo-note">{w.reviewNote}</p>
          <ul className="loa-items loa-items--stack">
            {f.review.map((r) => (
              <li key={r.id}>
                <span><strong>{r.label}</strong>: {r.was} → {r.now}</span>
                <span className="mlo-row-form">
                  <form action={reviewAction.bind(null, loan.id, r.id, true)}><button type="submit" className="mlo-btn mlo-btn--ghost">{w.useNew}</button></form>
                  <form action={reviewAction.bind(null, loan.id, r.id, false)}><button type="submit" className="mlo-btn mlo-btn--ghost">{w.keepMine}</button></form>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mlo-note">Drop a document and your LOA reads it into the file. It keeps the dates, drafts the emails to escrow and title for you to send, and chases what&apos;s open. <Link href={`/mlo/loa?loan=${encodeURIComponent(loan.id)}#talk`}>Ask your LOA about this loan</Link>, or open <Link href={`/mlo/pipeline/${encodeURIComponent(loan.id)}/forms`}>Forms</Link> for letters to escrow and title, fillable forms and sending them.</p>

      <form action={readDocAction.bind(null, loan.id)} className="mlo-grid">
        <div className="mlo-row-form">
          <select name="kind" className="mlo-select" aria-label="What it is" defaultValue={c ? (f.title ? (f.approvalReceivedAt ? "escrow_fees" : "conditional_approval") : "title_commitment") : "purchase_agreement"}>
            {DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_LABELS[k]}</option>)}
          </select>
          <input type="file" name="doc" accept="application/pdf" className="mlo-input" aria-label="The PDF" style={{ flex: 1, minWidth: 0 }} />
          <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Read it</button>
        </div>
        <details><summary className="mlo-note">No PDF? Paste the text instead</summary><textarea name="text" rows={4} className="mlo-textarea" aria-label="The document's text" /></details>
      </form>

      <h3>Deadlines</h3>
      {f.deadlines.length ? (
        <ul className="loa-dl">
          {f.deadlines.map((d) => {
            const n = daysUntil(d.date, today);
            return <li key={d.key} className={d.done ? "is-done" : n >= 0 && n <= 3 ? "is-soon" : ""}><span>{d.done ? "✓ " : ""}{d.label}</span><span>{d.date}{!d.done ? (n < 0 ? " · past" : n === 0 ? " · today" : ` · ${n}d`) : ""}</span></li>;
          })}
        </ul>
      ) : <p className="mlo-note">Dates appear once the purchase agreement is read, or the loan system sends the application and closing dates.</p>}

      {c ? (
        <>
          <h3>The contract</h3>
          <dl className="loa-kv">
            <dt>Property</dt><dd>{c.property ? `${c.property.street}, ${c.property.city}, ${c.property.state} ${c.property.zip}` : "—"}</dd>
            <dt>Price</dt><dd>{money(c.price)}</dd>
            <dt>Seller credits</dt><dd>{money(c.sellerCredits)}</dd>
            <dt>Earnest money</dt><dd>{money(c.earnestMoney)}</dd>
            <dt>Mutual acceptance</dt><dd>{c.mutualAcceptance ?? "—"}</dd>
            <dt>Possession</dt><dd>{c.possession ?? "—"}</dd>
          </dl>
          {c.notes.length ? <ul className="mlo-note" style={{ paddingLeft: 18 }}>{c.notes.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
        </>
      ) : null}

      {showGaps ? (
        <div className="loa-gaps" id="gaps">
          <h3>{w.gapsHeading}</h3>
          {g.auto.length ? (
            <>
              <p className="mlo-note">{w.gapsNote}</p>
              <ul className="loa-gaplist">{g.auto.map((x) => <GapQuestion key={x.key} loanId={loan.id} k={x.key} unlocks={x.unlocks.map((c) => c.label)} current={currentFor(x.key)} />)}</ul>
            </>
          ) : <p className="mlo-note">{w.gapsNone}</p>}
          {g.other.length ? (
            <details className="loa-gaps__other">
              <summary className="mlo-note">{w.gapsOther} ({g.other.length})</summary>
              <ul className="loa-gaplist">{g.other.map((x) => <GapQuestion key={x.key} loanId={loan.id} k={x.key} unlocks={x.unlocks.map((c) => c.label)} current={currentFor(x.key)} />)}</ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <h3>Who&apos;s on the deal</h3>
      {f.parties.length ? (
        <>
          <dl className="loa-kv">
            {f.parties.map((p) => (
              <Fragment key={p.role}>
                <dt>{PARTY_LABELS[p.role]}</dt>
                <dd className="loa-party">
                  <span>{[p.name, p.company].filter(Boolean).join(", ") || "—"}{p.email ? ` · ${p.email}` : ""}{p.phone ? ` · ${p.phone}` : ""}</span>
                  {p.email ? (emailConfirmed(p) ? <span className="loa-tag loa-tag--ok">{w.confirmed}</span> : (
                    <span className="loa-party__confirm">
                      <span className="loa-tag">{w.fromDocument}</span>
                      <form action={confirmPartyAction.bind(null, loan.id, p.role)}><button type="submit" className="mlo-btn mlo-btn--ghost loa-btn-sm" aria-label={`${w.confirm} ${p.email}`}>{w.confirm}</button></form>
                    </span>
                  )) : null}
                </dd>
              </Fragment>
            ))}
          </dl>
          {f.parties.some((p) => p.email && !emailConfirmed(p)) ? <p className="mlo-note">{w.confirmNote}</p> : null}
        </>
      ) : <p className="mlo-note">Read from the purchase agreement, or add them below.</p>}
      <details>
        <summary className="mlo-note">Add or change someone</summary>
        <form action={partyAction.bind(null, loan.id)} className="mlo-grid">
          <div className="mlo-row-form">
            <select name="role" className="mlo-select" aria-label="Who">{PARTY_ROLES.map((r) => <option key={r} value={r}>{PARTY_LABELS[r]}</option>)}</select>
            <input name="name" className="mlo-input" placeholder="Name" aria-label="Name" />
            <input name="company" className="mlo-input" placeholder="Company" aria-label="Company" />
          </div>
          <div className="mlo-row-form">
            <input name="email" type="email" className="mlo-input" placeholder="Email" aria-label="Email" />
            <input name="phone" type="tel" className="mlo-input" placeholder="Phone" aria-label="Phone" />
            <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Save</button>
          </div>
        </form>
      </details>

      <h3 id="drafts">Emails to escrow and title</h3>
      <div className="mlo-row-form">
        <form action={makeDraftAction.bind(null, loan.id, "escrow_fees")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Draft: ask escrow for fees</button></form>
        <form action={makeDraftAction.bind(null, loan.id, "open_escrow")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Draft: open escrow</button></form>
        <form action={makeDraftAction.bind(null, loan.id, "open_title")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Draft: open title</button></form>
        {payoffsOpen ? <form action={makeDraftAction.bind(null, loan.id, "payoffs")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Draft: payoffs to escrow</button></form> : null}
      </div>
      {drafts.map((d) => (
        <form key={d.id} action={sendDraftAction.bind(null, loan.id, d.id)} className="loa-draft" style={{ marginTop: 10 }}>
          <span className="mlo-note">To the {toLabel(d.to)}</span>
          {d.autoReason ? <span className="mlo-note loa-why">{aw.asksBecause}: {d.autoReason}.</span> : null}
          <input name="to" type="email" className="mlo-input" defaultValue={d.toEmail} placeholder="Their email" aria-label="To" required />
          <input name="subject" className="mlo-input" defaultValue={d.subject} aria-label="Subject" required />
          <textarea name="body" rows={7} className="mlo-textarea" defaultValue={d.body} aria-label="Message" required />
          <div className="mlo-row-form">
            <button type="submit" className="mlo-btn" style={{ marginTop: 0 }}>Send</button>
            <button type="submit" formAction={discardDraftAction.bind(null, loan.id, d.id)} className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} formNoValidate>Set aside</button>
            <span className="mlo-note">Goes from your own mailbox when it&apos;s connected, with your signature.</span>
          </div>
        </form>
      ))}
      {sent.length ? <p className="mlo-note">Sent: {sent.map((d) => `${d.subject || `Text to the ${toLabel(d.to)}`} (${d.sentAt?.slice(0, 10)})`).join("; ")}.</p> : null}

      <div className="loa-autolog" id="autolog">
        <h3>{aw.queuedHeading}</h3>
        {queued.length ? (
          <ul className="loa-queue">
            {queued.map((d) => (
              <li key={d.id} className="loa-queue__item--auto">
                <div className="loa-queue__what">
                  <span>{d.channel === "text" ? `Text to the ${toLabel(d.to)}` : d.subject}</span>
                  <span className="loa-when">{whenLong(d, now)}</span>
                  <details className="loa-queue__body"><summary className="mlo-note">Read it</summary><pre>{d.body}</pre></details>
                </div>
                <div className="loa-queue__acts">
                  <form action={stopQueuedAction.bind(null, loan.id, d.id, "loan")}><button type="submit" className="mlo-btn">{aw.stop}</button></form>
                  {d.when !== "soon" ? <form action={sendSoonAction.bind(null, loan.id, d.id, "loan")}><button type="submit" className="mlo-btn mlo-btn--ghost">{aw.soon(undoMinutes)}</button></form> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mlo-note">{aw.queuedEmpty}</p>}
        <h3>{aw.logHeading}</h3>
        {autoLog.length ? (
          <ul className="loa-did">
            {autoLog.map((e, i) => {
              const d = e.ref ? byId.get(e.ref) : undefined;
              const canCorrect = e.status === "sent" && d?.status === "sent" && d.approvedBy === AUTO_BY && d.channel !== "text";
              return (
                <li key={`${e.at}-${i}`}>
                  <span className={`loa-did__tag loa-did__tag--${e.status}`}>{aw.status[e.status]}</span>
                  <span className="loa-did__what">
                    <span>{e.action}{e.toRole !== "lo" ? ` · ${aw.to[e.toRole] ?? toLabel(e.toRole as never)}` : ""}</span>
                    <span className="mlo-note">{new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(e.at))} PT{e.reason ? ` · ${e.reason}` : ""}</span>
                  </span>
                  {canCorrect ? <form action={correctionAction.bind(null, loan.id, d!.id)}><button type="submit" className="mlo-btn mlo-btn--ghost loa-btn-sm">{aw.correction}</button></form> : <span />}
                </li>
              );
            })}
          </ul>
        ) : <p className="mlo-note">{aw.logEmpty}</p>}
        {autoLog.some((e) => e.status === "sent") ? <p className="mlo-note">{aw.correctionNote}</p> : null}
      </div>

      {f.title ? (
        <>
          <h3>Title{f.title.commitmentDate ? ` (commitment ${f.title.commitmentDate})` : ""}</h3>
          {f.title.vesting ? <p className="mlo-note">Vesting: {f.title.vesting}</p> : null}
          <ul className="loa-items">
            {f.title.items.map((x) => (
              <li key={x.id}>
                <span><span className="loa-tag">{x.kind}</span>{x.payoff ? <span className="loa-tag">pay off</span> : null}{x.text}</span>
                {x.payoff ? (
                  x.status === "cleared" ? <span className="mlo-note">Cleared</span> : <form action={titleItemAction.bind(null, loan.id, x.id, x.status === "open" ? "payoff_requested" : "cleared")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>{x.status === "open" ? "Payoff requested" : "Cleared"}</button></form>
                ) : <span />}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {f.conditions.length ? (
        <>
          <h3>Conditions ({f.conditions.filter((x) => x.status === "cleared").length} of {f.conditions.length} cleared)</h3>
          {(["loan_officer", "borrower", "third_party", "lender"] as const).map((o) => {
            const list = f.conditions.filter((x) => x.owner === o);
            if (!list.length) return null;
            return (
              <div key={o}>
                <p className="mlo-note" style={{ margin: "8px 0 4px" }}>{OWNER[o]}{o === "borrower" ? " (also on the document checklist below, for the upload request)" : ""}</p>
                <ul className="loa-items">
                  {list.map((x) => (
                    <li key={x.id}>
                      <span><span className="loa-tag">{x.status}</span>{x.text} <span className="mlo-note">· prior to {x.priorTo}</span></span>
                      {NEXT[x.status] ? <form action={conditionAction.bind(null, loan.id, x.id, NEXT[x.status]!)}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>{NEXT_LABEL[x.status]}</button></form> : <span className="mlo-note">✓</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      ) : null}

      {f.escrowFees ? (
        <>
          <h3>Escrow fees{f.escrowFees.from ? ` from ${f.escrowFees.from}` : ""}: {money(f.escrowFees.total)}</h3>
          <ul className="mlo-note" style={{ paddingLeft: 18 }}>{f.escrowFees.lines.map((l, i) => <li key={i}>{l.label}: {money(l.amount)}</li>)}</ul>
        </>
      ) : null}

      <h3>The LOA&apos;s checklist</h3>
      <ul className="loa-checks">
        {CHECKS.map((k) => {
          const s = f.checks[k.key];
          return (
            <li key={k.key} className={s?.done ? "is-done" : ""}>
              <form action={checkAction.bind(null, loan.id, k.key, !s?.done)}><button type="submit" aria-label={`${s?.done ? "Untick" : "Tick"}: ${k.label}`}>{s?.done ? "✓" : ""}</button></form>
              <span>{k.label}{s?.done && s.by === "LOA" ? <span className="mlo-note"> · from the file</span> : null}</span>
            </li>
          );
        })}
      </ul>

      {f.log.length ? <details style={{ marginTop: 12 }}><summary className="mlo-note">What your LOA has done on this file</summary><ul className="mlo-note" style={{ paddingLeft: 18 }}>{[...f.log].reverse().slice(0, 20).map((l, i) => <li key={i}>{l.at.slice(0, 10)}: {l.text}</li>)}</ul></details> : null}
    </section>
  );
}
