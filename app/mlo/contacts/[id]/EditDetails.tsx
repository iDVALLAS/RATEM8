"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { contactPageCopy as cp } from "@/lib/content/contact-page";
import { asWrittenLines, canSwap, chipInto, swapBoxes, type DropBox, DROP_BOXES, type EditField } from "@/lib/contacts/editing";

type Values = Record<EditField, string>;
export type EditOutcome = { ok: true; message: string; sameAs: { id: string; name: string } | null } | { ok: false; errors: Partial<Record<EditField | "form", string>> };

const digits = (s: string) => s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/**
 * D77: Details, and the Edit button that turns them into a form. The form is
 * checked on the server by the same cleaning as an import
 * (`updateContactAction.bind(null, id)`); a changed phone or email warns
 * before it's saved that permission for the old one may not cover the new one.
 *
 * D93.1: a pencil beside each detail (rendered on the server with
 * `data-edit-field`) opens the form with that box focused. In the form, the
 * address boxes take a value dragged from another address box (the two swap)
 * or from a "From the file" chip (a value kept in notes as written by an
 * import; it leaves the notes when used). Each place a value can go shows a
 * dashed outline while dragging. Nothing is saved until Save, which runs the
 * same checks. Keyboard users type as before.
 */
export default function EditDetails({
  initial,
  relationships,
  states,
  agent,
  action,
  children,
}: {
  initial: Values;
  relationships: { value: string; label: string }[];
  states: { code: string; name: string }[];
  agent: boolean;
  action: (input: Values) => Promise<EditOutcome>;
  children: React.ReactNode;
}) {
  const e = cp.edit;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<Values>(initial);
  const [errors, setErrors] = useState<Partial<Record<EditField | "form", string>>>({});
  const [done, setDone] = useState<{ text: string; sameAs: { id: string; name: string } | null } | null>(null);
  const [pending, start] = useTransition();
  const [focusOn, setFocusOn] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ box: DropBox } | { chip: number } | null>(null);
  const [over, setOver] = useState<DropBox | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!editing || !focusOn) return;
    const el = form.current?.querySelector<HTMLElement>(`[name="${focusOn}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center" });
    setFocusOn(null);
  }, [editing, focusOn]);
  const open = (f: string | null) => {
    setV(initial);
    setErrors({});
    setDone(null);
    setEditing(true);
    setFocusOn(f);
  };
  const chips = asWrittenLines(v.notes);
  const dragValue = drag ? ("box" in drag ? v[drag.box] : chips[drag.chip]?.value ?? "") : "";
  const takes = (to: DropBox) => !!drag && !("box" in drag && drag.box === to) && ("box" in drag ? canSwap(v, drag.box, to) : chipInto(v, drag.chip, to) !== null);
  const dropOn = (to: DropBox) => {
    if (!drag || !takes(to)) return;
    const next = "box" in drag ? swapBoxes(v, drag.box, to) : chipInto(v, drag.chip, to);
    if (next) setV((cur) => ({ ...cur, ...next }));
    setDrag(null);
    setOver(null);
  };
  const dropProps = (to: DropBox) => ({
    className: `mlo-field${drag ? (takes(to) ? " cc-drop--on" : "") : ""}${over === to ? " cc-drop--over" : ""}`,
    onDragOver: (ev: React.DragEvent) => {
      if (!takes(to)) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      setOver(to);
    },
    onDragLeave: () => setOver((o) => (o === to ? null : o)),
    onDrop: (ev: React.DragEvent) => {
      if (!takes(to)) return;
      ev.preventDefault();
      dropOn(to);
    },
  });
  const startDrag = (d: { box: DropBox } | { chip: number }, text: string) => (ev: React.DragEvent) => {
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", text);
    setDrag(d);
  };
  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };
  const isBox = (f: EditField): f is DropBox => (DROP_BOXES as readonly string[]).includes(f);
  const handle = (f: DropBox) =>
    v[f] ? (
      <span className="cc-drag" draggable onDragStart={startDrag({ box: f }, v[f])} onDragEnd={endDrag} title={e.dragTitle} aria-hidden="true">⠿</span>
    ) : null;
  const set = (f: EditField) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((cur) => ({ ...cur, [f]: ev.target.value }));
  const phoneChanged = digits(v.phone) !== digits(initial.phone);
  const emailChanged = v.email.trim().toLowerCase() !== initial.email.trim().toLowerCase();

  const field = (f: EditField, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label {...(isBox(f) ? dropProps(f) : { className: "mlo-field" })}>
      <span className={isBox(f) ? "cc-drag-label" : undefined}>{label}{isBox(f) ? handle(f) : null}</span>
      <input name={f} value={v[f]} onChange={set(f)} aria-invalid={errors[f] ? true : undefined} aria-describedby={errors[f] ? `ed-${f}-err` : undefined} {...props} />
      {errors[f] ? <span className="cc-field-err" id={`ed-${f}-err`}>{errors[f]}</span> : null}
    </label>
  );

  if (!editing) {
    return (
      <div
        className="cc-details"
        id="edit"
        onClick={(ev) => {
          const b = (ev.target as Element).closest?.("[data-edit-field]");
          if (b instanceof HTMLElement && b.dataset.editField) open(b.dataset.editField);
        }}
      >
        {done ? (
          <div className="mlo-flash mlo-flash--ok" role="status">
            {done.text}
            {done.sameAs ? <> {e.sameAs(done.sameAs.name)} <Link href={`?tab=details&merge=${encodeURIComponent(done.sameAs.id)}#merge`}>{cp.merge.pick}</Link></> : null}
          </div>
        ) : null}
        {children}
        <div className="mlo-actions">
          <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => open(null)}>{e.button}</button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={form}
      className="mlo-grid cc-details cc-edit"
      id="edit"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => {
          const r = await action(v).catch(() => ({ ok: false as const, errors: { form: cp.errors.gone } }));
          if (r.ok) {
            setErrors({});
            setDone({ text: r.message, sameAs: r.sameAs });
            setEditing(false);
            router.refresh();
          } else setErrors(r.errors);
        });
      }}
    >
      <h3 className="cc-edit__h">{e.heading}</h3>
      {errors.form ? <div className="mlo-flash mlo-flash--err" role="alert">{errors.form}</div> : null}
      <div className="mlo-grid mlo-grid--2">
        {field("firstName", e.first, { autoComplete: "off", maxLength: 60 })}
        {field("lastName", e.last, { autoComplete: "off", maxLength: 80 })}
        {field("phone", e.phone, { type: "tel", inputMode: "tel", autoComplete: "off", maxLength: 30 })}
        {field("phone2", e.phone2, { type: "tel", inputMode: "tel", autoComplete: "off", maxLength: 30 })}
        {field("email", e.email, { type: "email", inputMode: "email", autoComplete: "off", maxLength: 254 })}
        {agent ? null : (
          <label className="mlo-field">
            <span>{e.relationship}</span>
            <select name="relationship" value={v.relationship} onChange={set("relationship")} aria-invalid={errors.relationship ? true : undefined}>
              {relationships.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {errors.relationship ? <span className="cc-field-err">{errors.relationship}</span> : null}
          </label>
        )}
      </div>
      {phoneChanged && initial.phone ? <p className="cc-warnline" role="note"><strong>{e.phoneWarn}</strong> {e.phoneWarnMore}</p> : null}
      {emailChanged && initial.email ? <p className="cc-warnline" role="note">{e.emailWarn}</p> : null}
      {chips.length ? (
        <div className="cc-fromfile" role="group" aria-label={e.fromFile}>
          <p className="mlo-note">{e.fromFile}</p>
          <div className="cc-fromfile__chips">
            {chips.map((c, i) => (
              <span key={`${i}-${c.line}`} className="im-move__chip" draggable onDragStart={startDrag({ chip: i }, c.value)} onDragEnd={endDrag} title={e.chipTitle(c.label)}>
                <span aria-hidden="true" className="im-move__grip">⠿</span>
                {c.value.length > 40 ? `${c.value.slice(0, 40)}…` : c.value}
                <span className="cc-fromfile__was">{e.chipWas(c.label)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {drag ? <p className="mlo-note" role="status">{e.dragging(dragValue.length > 40 ? `${dragValue.slice(0, 40)}…` : dragValue)}</p> : chips.length || DROP_BOXES.some((b) => v[b]) ? <p className="mlo-note">{e.dragNote}</p> : null}
      <div className="mlo-grid mlo-grid--2">
        {field("street", e.street, { autoComplete: "off", maxLength: 120 })}
        {field("city", e.city, { autoComplete: "off", maxLength: 60 })}
        <label {...dropProps("state")}>
          <span className="cc-drag-label">{e.state}{handle("state")}</span>
          <select name="state" value={v.state} onChange={set("state")} aria-invalid={errors.state ? true : undefined}>
            <option value="">{e.stateNone}</option>
            {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
          {errors.state ? <span className="cc-field-err">{errors.state}</span> : null}
        </label>
        {field("zip", e.zip, { inputMode: "numeric", autoComplete: "off", maxLength: 10 })}
        {field("leadSource", e.leadSource, { autoComplete: "off", maxLength: 120 })}
        {field("referredBy", e.referredBy, { autoComplete: "off", maxLength: 120 })}
      </div>
      {agent ? null : (
        <fieldset className="cc-edit__co">
          <legend className="cc-edit__h cc-edit__sub">{e.coHeading}</legend>
          <p className="mlo-note">{e.coNote}</p>
          <div className="mlo-grid mlo-grid--2">
            {field("coFirstName", e.coFirst, { autoComplete: "off", maxLength: 60 })}
            {field("coLastName", e.coLast, { autoComplete: "off", maxLength: 80 })}
            {field("coPhone", e.coPhone, { type: "tel", inputMode: "tel", autoComplete: "off", maxLength: 30 })}
            {field("coEmail", e.coEmail, { type: "email", inputMode: "email", autoComplete: "off", maxLength: 254 })}
          </div>
        </fieldset>
      )}
      <label className="mlo-field">
        <span>{e.notes}</span>
        <textarea name="notes" value={v.notes} onChange={set("notes")} rows={5} maxLength={4000} />
        {errors.notes ? <span className="cc-field-err">{errors.notes}</span> : null}
      </label>
      <div className="mlo-row-form">
        <button type="submit" className="mlo-btn" disabled={pending}>{pending ? "Saving…" : e.save}</button>
        <button type="button" className="mlo-btn mlo-btn--ghost" disabled={pending} onClick={() => { setEditing(false); setErrors({}); }}>{e.cancel}</button>
      </div>
    </form>
  );
}
