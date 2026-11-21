"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { contactPageCopy as cp } from "@/lib/content/contact-page";
import type { EditField } from "@/lib/contacts/editing";

type Values = Record<EditField, string>;
export type EditOutcome = { ok: true; message: string; sameAs: { id: string; name: string } | null } | { ok: false; errors: Partial<Record<EditField | "form", string>> };

const digits = (s: string) => s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/**
 * D77: Details, and the Edit button that turns them into a form. The form is
 * checked on the server by the same cleaning as an import
 * (`updateContactAction.bind(null, id)`); a changed phone or email warns
 * before it's saved that permission for the old one may not cover the new one.
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
  const set = (f: EditField) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((cur) => ({ ...cur, [f]: ev.target.value }));
  const phoneChanged = digits(v.phone) !== digits(initial.phone);
  const emailChanged = v.email.trim().toLowerCase() !== initial.email.trim().toLowerCase();

  const field = (f: EditField, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="mlo-field">
      <span>{label}</span>
      <input name={f} value={v[f]} onChange={set(f)} aria-invalid={errors[f] ? true : undefined} aria-describedby={errors[f] ? `ed-${f}-err` : undefined} {...props} />
      {errors[f] ? <span className="cc-field-err" id={`ed-${f}-err`}>{errors[f]}</span> : null}
    </label>
  );

  if (!editing) {
    return (
      <div className="cc-details" id="edit">
        {done ? (
          <div className="mlo-flash mlo-flash--ok" role="status">
            {done.text}
            {done.sameAs ? <> {e.sameAs(done.sameAs.name)} <Link href={`?tab=details&merge=${encodeURIComponent(done.sameAs.id)}#merge`}>{cp.merge.pick}</Link></> : null}
          </div>
        ) : null}
        {children}
        <div className="mlo-actions">
          <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => { setV(initial); setErrors({}); setDone(null); setEditing(true); }}>{e.button}</button>
        </div>
      </div>
    );
  }

  return (
    <form
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
      <div className="mlo-grid mlo-grid--2">
        {field("street", e.street, { autoComplete: "off", maxLength: 120 })}
        {field("city", e.city, { autoComplete: "off", maxLength: 60 })}
        <label className="mlo-field">
          <span>{e.state}</span>
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
