import { SAMPLE_DOC, SAMPLE_FIELDS, type SampleFieldId } from "./sample";

/**
 * SampleDoc — the paper Loan Estimate mock (fictional data).
 *
 * `fieldState` drives the reading/found highlight per field.
 * `scan` turns on the green scan line (.scanline.is-on).
 */
export type FieldState = "idle" | "reading" | "found";

type SampleDocProps = {
  fieldState: Partial<Record<SampleFieldId, FieldState>>;
  scan?: boolean;
  className?: string;
};

function Field({ id, label, value, state }: { id: SampleFieldId; label: string; value: string; state: FieldState }) {
  const cls = state === "reading" ? "is-reading" : state === "found" ? "is-found" : "";
  return (
    <div className={`doc__row doc__field ${cls}`} data-field={id}>
      <span>{label}</span>
      <b>{value}</b>
      {state !== "idle" ? (
        <span className="doc__tag" aria-hidden="true">
          {state === "reading" ? "reading…" : "found"}
        </span>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="doc__row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export default function SampleDoc({ fieldState, scan = false, className = "" }: SampleDocProps) {
  const f = (id: SampleFieldId) => SAMPLE_FIELDS.find((x) => x.id === id)!;
  const st = (id: SampleFieldId): FieldState => fieldState[id] ?? "idle";
  return (
    <div className={`doc sl-doc ${className}`} aria-hidden="true">
      <div className={`scanline ${scan ? "is-on" : ""}`} />
      <div className="sl-doc__head">
        <span className="sl-doc__title">Loan Estimate</span>
        <span className="sl-doc__meta">Sample · page 1 of 3</span>
      </div>
      <Row label="Applicant" value={SAMPLE_DOC.borrower} />
      <Row label="Property" value={SAMPLE_DOC.property} />
      <Row label="Loan amount" value={SAMPLE_DOC.loanAmount} />
      <Row label="Loan term" value={SAMPLE_DOC.term} />

      <div className="doc__section">Loan terms</div>
      <Field {...f("rate")} state={st("rate")} />
      <Field {...f("apr")} state={st("apr")} />

      <div className="doc__section">A. Origination charges</div>
      <Field {...f("points")} state={st("points")} />
      <Field {...f("sectionA")} state={st("sectionA")} />

      <div className="doc__section">B + C. Services</div>
      <Field {...f("sectionBC")} state={st("sectionBC")} />

      <div className="doc__section">J. Total closing costs</div>
      <Field {...f("lenderCredits")} state={st("lenderCredits")} />
      <Field {...f("cashToClose")} state={st("cashToClose")} />

      <p className="sl-doc__note">Sample — illustrative only, not an offer. Fictional borrower, fictional figures.</p>
    </div>
  );
}
