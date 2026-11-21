import AutonomyToggle, { type ToggleValue } from "../AutonomyToggle";
import { Icon } from "../icons";
import { CAPS, GROUP_ORDER, LOCKED, officerMode, PRESETS, PURPOSES, type Cap, type CapRow, type Mode, type Modes, type Purpose } from "@/lib/loa/autonomy";
import { CAP_GROUPS, loaAutoWords, loaLoan, loaSwitches, MODE_WORDS } from "@/lib/content/loa";
import { loaAutoOn } from "@/lib/loa/autonomy";
import { loanAutonomyAction, presetAction, saveAutonomyAction } from "./actions";

const WORD: Record<Purpose, string> = { purchase: loaSwitches.purchase, refi: loaSwitches.refi };

/** The options a task can't take on this loan type, each with its reason. */
function limits(c: Cap, t: Purpose): Partial<Record<ToggleValue, string>> {
  const why = c.maxWhy?.[t];
  if (c.max[t] === "approve") return { auto: why ?? "Always asks you." };
  if (c.max[t] === "off") return { auto: why ?? "Doesn't apply.", approve: why ?? "Doesn't apply." };
  return {};
}

function Legend() {
  return (
    <ul className="loa-legend">
      {loaSwitches.legend.map((l) => (
        <li key={l.mode}><span className={`loa-legend__dot loa-legend__dot--${l.mode}`} aria-hidden="true" />{l.text}</li>
      ))}
    </ul>
  );
}

function Locked() {
  return (
    <div className="loa-auto-group">
      <h3>{loaSwitches.lockedHeading}</h3>
      <p className="mlo-note">{loaSwitches.lockedNote}</p>
      <ul className="loa-locked">
        {LOCKED.map((l) => (
          <li key={l.label}><span className="loa-locked__icon" aria-hidden="true"><Icon name="lock" size={18} /></span><span><strong>{l.label}</strong><span className="mlo-note">{l.reason}</span></span></li>
        ))}
      </ul>
    </div>
  );
}

/**
 * D70: the officer's switches on /mlo/loa#autopilot. One row per task, a
 * column each for purchase and refinance (stacked under each other on
 * phones), grouped as on the capability table, with "Always you" last.
 */
export default function AutonomyGrid({ modes, canEdit }: { modes: Modes; canEdit: boolean }) {
  const viewOnly = canEdit ? undefined : loaSwitches.viewOnly;
  return (
    <>
      <Legend />
      {/* D71: Full-auto works now; the kill switch turns it back into LO-Auth for everyone. */}
      <p className="mlo-note">{loaAutoOn() ? loaAutoWords.live : loaAutoWords.killed}</p>
      {canEdit ? (
        <div className="loa-presets">
          <span className="mlo-note">{loaSwitches.presetsLabel}</span>
          {PRESETS.map((p) => (
            <form key={p} action={presetAction.bind(null, p)}><button type="submit" className="mlo-btn mlo-btn--ghost">{loaSwitches.presets[p]}</button></form>
          ))}
        </div>
      ) : <p className="mlo-note loa-viewonly">{loaSwitches.viewOnly}</p>}
      <form action={saveAutonomyAction} className="loa-auto-form">
        {GROUP_ORDER.map((g) => {
          const caps = CAPS.filter((c) => c.group === g);
          return (
            <div key={g} className="loa-auto-group">
              <h3>{CAP_GROUPS[g].label}</h3>
              {CAP_GROUPS[g].note ? <p className="mlo-note">{CAP_GROUPS[g].note}</p> : null}
              <div className="loa-auto">
                <div className="loa-auto__head" aria-hidden="true"><span /><span>{loaSwitches.purchase}</span><span>{loaSwitches.refi}</span></div>
                {caps.map((c) => (
                  <div key={c.key} className="loa-auto__row">
                    <div className="loa-auto__label">
                      <span className="loa-auto__name">{c.label}</span>
                      <span className="mlo-note">{c.help}</span>
                      {c.needChip ? <span className="loa-chip">{c.needChip}</span> : null}
                    </div>
                    {PURPOSES.map((t) => (
                      <div key={t} className="loa-auto__cell">
                        <span className="loa-auto__ph">{WORD[t]}</span>
                        {c.applies[t] ? (
                          <AutonomyToggle name={`${t}.${c.key}`} label={`${c.label}, ${WORD[t].toLowerCase()}`} value={officerMode(c, t, modes)} disabled={limits(c, t)} readOnly={viewOnly} idBase={`auto-${t}-${c.key}`} />
                        ) : (
                          <span className="loa-auto__na"><span aria-hidden="true">—</span><span className="sr-only">{loaSwitches.notApplicable}</span></span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {canEdit ? (
          <div className="loa-savebar">
            <span className="mlo-note">{loaSwitches.saveNote}</span>
            <button type="submit" className="mlo-btn">{loaSwitches.save}</button>
          </div>
        ) : null}
      </form>
      <Locked />
    </>
  );
}

/**
 * D70: the per-loan fold, "Change for this loan": this loan's type only,
 * plus "Use my setting". Saved as just this loan's overrides.
 */
export function LoanSwitches({ loanId, rows, overrides, officer, purpose, canEdit }: { loanId: string; rows: CapRow[]; overrides: Partial<Record<string, Mode>>; officer: Modes; purpose: Purpose; canEdit: boolean }) {
  const shown = rows.filter((r) => r.applies);
  return (
    <form action={loanAutonomyAction.bind(null, loanId)} className="loa-auto-form loa-auto-form--loan">
      <p className="mlo-note">{canEdit ? loaLoan.justThisLoan : loaLoan.viewOnly}</p>
      <div className="loa-auto loa-auto--loan">
        {shown.map((r) => (
          <div key={r.cap.key} className="loa-auto__row">
            <div className="loa-auto__label">
              <span className="loa-auto__name">{r.cap.label}</span>
              {r.need ? <span className="loa-chip">{loaLoan.needs([r.need])}{r.mode === "auto" ? ` · ${loaLoan.waits}` : ""}</span> : null}
            </div>
            <div className="loa-auto__cell">
              <AutonomyToggle
                name={`loan.${r.cap.key}`}
                label={`${r.cap.label}, just this loan`}
                value={overrides[r.cap.key] ?? "inherit"}
                inherit
                inheritHint={MODE_WORDS[officerMode(r.cap, purpose, officer)]}
                disabled={limits(r.cap, purpose)}
                readOnly={canEdit ? undefined : loaLoan.viewOnly}
                idBase={`loan-${loanId}-${r.cap.key}`}
              />
            </div>
          </div>
        ))}
      </div>
      {canEdit ? <div className="loa-savebar loa-savebar--loan"><button type="submit" className="mlo-btn">{loaLoan.saveLoan}</button></div> : null}
    </form>
  );
}
