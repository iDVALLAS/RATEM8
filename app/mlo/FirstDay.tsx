import Link from "next/link";
import type { FirstDayStep } from "@/lib/pilot/service";
import { firstDayAction } from "./pilot-actions";
import { Icon } from "./icons";

/** D44: "Your first day" — six steps, checked against the real state. */
export default function FirstDay({ steps, done, pilot, canHide = true }: { steps: FirstDayStep[]; done: number; pilot: boolean; canHide?: boolean }) {
  const pct = Math.round((done / steps.length) * 100);
  return (
    <details id="first-day" className="cc-panel cc-first cc-fold" open={done < steps.length}>
      <summary className="cc-sechead">
        <h2 id="first-day-h">Your first day <span className="mlo-note">· {done} of {steps.length}</span></h2>
        <span className="cc-fold__arrow" aria-hidden="true" />
      </summary>
      <div className="cc-first__bar" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="First-day steps done"><span style={{ width: `${pct}%` }} /></div>
      <ol className="cc-first__steps">
        {steps.map((s) => (
          <li key={s.id}>
            <Link href={s.href} className={`cc-first__step ${s.done ? "is-done" : ""}`}>
              <span className="cc-first__dot" aria-hidden="true">{s.done ? <Icon name="check" size={16} /> : null}</span>
              <span>
                <span className="cc-first__label">{s.label}</span>
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                <span className="cc-first__why" style={{ display: "block" }}>{s.why}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="mlo-note" style={{ margin: 0 }}>Stuck on a step? <Link href="/mlo/setup-help">Ask the setup assistant</Link>, or see <Link href="/mlo/welcome">{pilot ? "about the pilot" : "getting started"}</Link>.</p>
      {canHide ? (
        <form action={firstDayAction.bind(null, true)}>
          <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }}>Hide this from Home</button>
        </form>
      ) : null}
    </details>
  );
}
