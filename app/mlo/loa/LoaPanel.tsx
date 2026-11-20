import { Fragment } from "react";
import Link from "next/link";
import type { Loan } from "@/lib/pipeline/store";
import type { Journey } from "@/lib/journey/store";
import { DOC_KINDS, DOC_LABELS } from "@/lib/loa/readers";
import { CHECKS, PARTY_ROLES, type Condition, type LoaFile } from "@/lib/loa/store";
import { PARTY_LABELS, recompute } from "@/lib/loa/service";
import { daysUntil } from "@/lib/loa/dates";
import { checkAction, conditionAction, discardDraftAction, makeDraftAction, partyAction, readDocAction, sendDraftAction, titleItemAction } from "./actions";
import "./loa.css";

const money = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const OWNER: Record<Condition["owner"], string> = { borrower: "From the borrower", third_party: "From third parties", loan_officer: "For you", lender: "The lender's own" };
const NEXT: Record<Condition["status"], Condition["status"] | null> = { open: "requested", requested: "received", received: "cleared", cleared: null };
const NEXT_LABEL: Record<Condition["status"], string> = { open: "Requested", requested: "Received", received: "Cleared", cleared: "" };

/** D62: the LOA's work on one loan, on the Loan Journey page. */
export default function LoaPanel({ loan, file, journey, now = new Date() }: { loan: Loan; file: LoaFile; journey: Journey; now?: Date }) {
  const f = recompute(file, loan, journey, now);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  const c = f.contract;
  const drafts = f.drafts.filter((d) => d.status === "draft");
  const sent = f.drafts.filter((d) => d.status === "sent");
  const payoffsOpen = (f.title?.items ?? []).some((x) => x.payoff && x.status === "open");
  return (
    <section className="mlo-section loa-panel" id="loa">
      <h2>Your LOA on this file</h2>
      <p className="mlo-note">Drop a document and your LOA reads it into the file. It keeps the dates, drafts the emails to escrow and title for you to send, and chases what&apos;s open. <Link href={`/mlo/loa?loan=${encodeURIComponent(loan.id)}#talk`}>Ask your LOA about this loan</Link>.</p>

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

      <h3>Who&apos;s on the deal</h3>
      {f.parties.length ? (
        <dl className="loa-kv">{f.parties.map((p) => <Fragment key={p.role}><dt>{PARTY_LABELS[p.role]}</dt><dd>{[p.name, p.company].filter(Boolean).join(", ") || "—"}{p.email ? ` · ${p.email}` : ""}{p.phone ? ` · ${p.phone}` : ""}</dd></Fragment>)}</dl>
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
        <form action={makeDraftAction.bind(null, loan.id, "open_title")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Draft: open title</button></form>
        {payoffsOpen ? <form action={makeDraftAction.bind(null, loan.id, "payoffs")}><button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Draft: payoffs to escrow</button></form> : null}
      </div>
      {drafts.map((d) => (
        <form key={d.id} action={sendDraftAction.bind(null, loan.id, d.id)} className="loa-draft" style={{ marginTop: 10 }}>
          <span className="mlo-note">To the {PARTY_LABELS[d.to].toLowerCase()}</span>
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
      {sent.length ? <p className="mlo-note">Sent: {sent.map((d) => `${d.subject} (${d.sentAt?.slice(0, 10)})`).join("; ")}.</p> : null}

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
