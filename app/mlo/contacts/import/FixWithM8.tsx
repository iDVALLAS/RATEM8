"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DateOrder } from "@/lib/contacts/normalize";
import type { ImportKind } from "@/lib/contacts/mapping";
import { checkValue, FIX_LABELS, fixPrompt, localSuggestion, reasonCode, skipLabel } from "@/lib/contacts/review";
import { shapeOf } from "@/lib/contacts/smart";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import { fixTipAction } from "../actions";
import type { Look } from "./types";

/**
 * One value to fix (D74): the value as written (or a likely fix worked out on
 * this device) in a box, re-checked as it's typed by the same functions the
 * import uses. Save keeps only a value that passes; the skip button leaves
 * it blank (or keeps "(no name)").
 */
export function FixEditor({ look, dateOrder, saveLabel, onSave, onSkip, children, autoFocus = false }: { look: Look; dateOrder?: DateOrder; saveLabel: string; onSave: (value: string) => void; onSkip: () => void; children?: React.ReactNode; autoFocus?: boolean }) {
  const suggestion = useMemo(() => localSuggestion(look.field, look.raw, { dateOrder }), [look.field, look.raw, dateOrder]);
  const [value, setValue] = useState(suggestion ?? look.raw);
  const check = checkValue(look.field, value, { dateOrder });
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) box.current?.focus();
  }, [autoFocus]);
  const first = look.name && look.name !== "(no name)" ? look.name.split(" ")[0] : "";
  return (
    <div className="im-fixed">
      <label className="mlo-field">
        <span>{first ? `${first}'s ${FIX_LABELS[look.field].toLowerCase()}` : FIX_LABELS[look.field]}</span>
        <input
          ref={box}
          className="mlo-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode={look.field === "phone" || look.field === "phone2" ? "tel" : look.field === "email" ? "email" : undefined}
          autoComplete="off"
          aria-describedby={`${id}-m`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && check.ok) {
              e.preventDefault();
              onSave(value.trim());
            }
          }}
        />
      </label>
      <p id={`${id}-m`} className={`im-fixed__msg${check.ok ? "" : " im-fixed__msg--bad"}`} aria-live="polite">{check.message}</p>
      {suggestion && value === suggestion ? <p className="mlo-note">{ic.fix.suggested}</p> : null}
      <div className="mlo-row-form">
        <button type="button" className="mlo-btn" disabled={!check.ok} onClick={() => onSave(value.trim())}>{saveLabel}</button>
        <button type="button" className="mlo-btn mlo-btn--ghost" onClick={onSkip}>{skipLabel(look.field)}</button>
        {children}
      </div>
    </div>
  );
}

/**
 * Fix with M8 (D74): walks the "Needs a look" rows one at a time. The
 * sentence ("Mary's phone 555-123-467 is one digit short…") and any likely
 * fix are made here on the device. M8 adds a tip from the field, the shape of
 * the value and a reason code only, never the row; without a key (or for an
 * agent list) the same step-through runs without the tip. Nothing is saved
 * without the loan officer's tap.
 */
export default function FixWithM8({ looks, kind, dateOrderOf, onSave, onSkip, onClose }: { looks: Look[]; kind: ImportKind; dateOrderOf: (itemId: string) => DateOrder | undefined; onSave: (l: Look, value: string) => void; onSkip: (l: Look) => void; onClose: () => void }) {
  // The rows as they were when it opened; a row that's been fixed drops out of `looks`.
  const [keys] = useState(() => looks.map((l) => l.key));
  const [pos, setPos] = useState(0);
  const [tips, setTips] = useState<Record<string, string | null>>({});
  const live = useMemo(() => new Map(looks.map((l) => [l.key, l])), [looks]);
  const index = keys.findIndex((k, i) => i >= pos && live.has(k));
  const cur = index >= 0 ? live.get(keys[index])! : null;
  const tipKey = cur ? `${cur.field}|${shapeOf(cur.raw)}|${reasonCode(cur)}` : "";
  const title = useId();

  useEffect(() => {
    if (!cur || kind !== "contacts" || tipKey in tips) return;
    let gone = false;
    setTips((t) => ({ ...t, [tipKey]: null }));
    fixTipAction({ kind, field: cur.field, shape: shapeOf(cur.raw), reason: reasonCode(cur) })
      .then((r) => { if (!gone) setTips((t) => ({ ...t, [tipKey]: r.ok ? r.tip : null })); })
      .catch(() => undefined);
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipKey, kind]);

  return (
    <div className="cc-card im-fix" role="region" aria-labelledby={title}>
      <div className="im-fix__head">
        <h3 id={title} className="cc-card__title">{cur ? ic.fix.title(index + 1, keys.length) : ic.fix.open}</h3>
        <button type="button" className="cc-tag__x im-fix__x" aria-label={ic.fix.close} onClick={onClose}><span aria-hidden="true">×</span></button>
      </div>
      {cur ? (
        <>
          <p className="im-fix__ask">{fixPrompt(cur)}</p>
          {tips[tipKey] ? <p className="mlo-note"><strong>{ic.fix.m8}</strong> {tips[tipKey]}</p> : null}
          <FixEditor key={cur.key} look={cur} dateOrder={dateOrderOf(cur.itemId)} saveLabel={ic.fix.saveNext} onSave={(v) => { onSave(cur, v); setPos(index + 1); }} onSkip={() => { onSkip(cur); setPos(index + 1); }} autoFocus>
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => setPos(index + 1)}>{ic.fix.later}</button>
          </FixEditor>
        </>
      ) : (
        <>
          <p className="im-fix__ask">{ic.fix.done(keys.length)}</p>
          <div className="mlo-row-form">
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={onClose}>{ic.fix.close}</button>
          </div>
        </>
      )}
      <p className="mlo-note">{ic.fix.note}</p>
    </div>
  );
}
