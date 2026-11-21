"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { contactPageCopy as cp } from "@/lib/content/contact-page";

type Field = "firstName" | "lastName" | "phone" | "email" | "relationship" | "how" | "brokerage" | "provenance";
export type AddOutcome = { ok: true; href: string } | { ok: false; errors: Partial<Record<Field | "form", string>>; existingHref?: string };

/**
 * D77: "+ Add a person" on the Contacts list (and "+ Add an agent" on Agents).
 * First and last name, phone, email, relationship, how you know them, and
 * where you met them (the same choices as an import; "My own relationships"
 * first). Nothing about permission is assumed: it's recorded on their page.
 */
export default function AddPerson({ agent, relationships, provenances, action }: { agent: boolean; relationships: { value: string; label: string }[]; provenances: { value: string; label: string }[]; action: (input: Record<Field, string>) => Promise<AddOutcome> }) {
  const a = cp.add;
  const e = cp.edit;
  const router = useRouter();
  const [v, setV] = useState<Record<Field, string>>({ firstName: "", lastName: "", phone: "", email: "", relationship: agent ? "agent" : "past_client", how: "", brokerage: "", provenance: agent ? "agent_partner" : "personal" });
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const [existing, setExisting] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (f: Field) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((cur) => ({ ...cur, [f]: ev.target.value }));
  const err = (f: Field) => (errors[f] ? <span className="cc-field-err" id={`add-${f}-err`}>{errors[f]}</span> : null);
  const input = (f: Field, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="mlo-field">
      <span>{label}</span>
      <input name={f} value={v[f]} onChange={set(f)} aria-invalid={errors[f] ? true : undefined} aria-describedby={errors[f] ? `add-${f}-err` : undefined} autoComplete="off" {...props} />
      {err(f)}
    </label>
  );
  return (
    <details className="mlo-details cc-addperson" id="add">
      <summary>{agent ? a.agentButton : a.button}</summary>
      <form
        className="mlo-grid"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          start(async () => {
            const r: AddOutcome = await action(v).catch(() => ({ ok: false as const, errors: { form: cp.errors.gone } }));
            if (r.ok) router.push(r.href);
            else {
              setErrors(r.errors);
              setExisting(r.existingHref ?? null);
            }
          });
        }}
      >
        <h2 className="cc-edit__h">{agent ? a.agentHeading : a.heading}</h2>
        {errors.form ? <div className="mlo-flash mlo-flash--err" role="alert">{errors.form}{existing ? <> <Link href={existing}>{a.openExisting}</Link></> : null}</div> : null}
        <div className="mlo-grid mlo-grid--2">
          {input("firstName", e.first, { maxLength: 60 })}
          {input("lastName", e.last, { maxLength: 80 })}
          {input("phone", e.phone, { type: "tel", inputMode: "tel", maxLength: 30 })}
          {input("email", e.email, { type: "email", inputMode: "email", maxLength: 254 })}
          {agent ? input("brokerage", a.brokerage, { maxLength: 120 }) : (
            <label className="mlo-field">
              <span>{e.relationship}</span>
              <select name="relationship" value={v.relationship} onChange={set("relationship")}>
                {relationships.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {err("relationship")}
            </label>
          )}
          {input("how", a.how, { maxLength: 200, placeholder: a.howPlaceholder })}
        </div>
        <fieldset className="cc-radios">
          <legend>{a.where}</legend>
          {provenances.map((p) => (
            <label key={p.value} className="mlo-check">
              <input type="radio" name="provenance" value={p.value} checked={v.provenance === p.value} onChange={set("provenance")} />
              <span>{p.label}</span>
            </label>
          ))}
          {err("provenance")}
        </fieldset>
        <button type="submit" className="mlo-btn" disabled={pending}>{pending ? "Adding…" : a.save}</button>
      </form>
    </details>
  );
}
