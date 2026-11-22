"use client";

import { useRef, useState } from "react";
import type { Campaign, Step, StepChannel } from "@/lib/campaigns/store";
import { CAMPAIGN_FIELDS, FIELD_LABELS } from "@/lib/campaigns/library";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";

type Draft = Pick<Campaign, "name" | "kind" | "purpose" | "trigger" | "days" | "hours"> & { triggerTag: string } & { steps: (Omit<Step, "id"> & { id?: string; key: string })[] };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SAMPLE: Record<string, string> = { first: "Ann", myFirst: "Pat", myName: "Pat Quinn", myPhone: "(555) 010-0000", company: "Your Company", bookingLink: "https://…" };
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
const CH: Record<StepChannel, string> = { text: "Text", email: "Email", task: "Task for me" };
let seq = 0;
const key = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

/** D51: the campaign editor. Saves the whole draft as one JSON value. */
export default function Editor({ campaign, action, textReady, emailReady, tags = [] }: { campaign: Campaign; action: (fd: FormData) => void; textReady: boolean; emailReady: boolean; tags?: string[] }) {
  const [d, setD] = useState<Draft>({ name: campaign.name, kind: campaign.kind, purpose: campaign.purpose, trigger: campaign.trigger, triggerTag: campaign.triggerTag ?? "", days: campaign.days, hours: campaign.hours, steps: campaign.steps.map((s) => ({ ...s, key: s.id })) });
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setStep = (k: string, p: Partial<Draft["steps"][number]>) => setD((x) => ({ ...x, steps: x.steps.map((s) => (s.key === k ? { ...s, ...p } : s)) }));
  const move = (i: number, by: number) => setD((x) => {
    const steps = [...x.steps];
    const j = i + by;
    if (j < 0 || j >= steps.length) return x;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    return { ...x, steps };
  });
  const add = (channel: StepChannel) => setD((x) => ({ ...x, steps: [...x.steps, { key: key(), channel, waitDays: x.steps.length ? 2 : 0, subject: channel === "email" ? "" : "", body: channel === "task" ? "Call {first}." : "" }] }));
  const insert = (k: string, field: string) => {
    const el = refs.current[k];
    const s = d.steps.find((x) => x.key === k);
    if (!s) return;
    const at = el?.selectionStart ?? s.body.length;
    const body = `${s.body.slice(0, at)}{${field}}${s.body.slice(el?.selectionEnd ?? at)}`;
    setStep(k, { body });
    requestAnimationFrame(() => {
      el?.focus();
      const pos = at + field.length + 2;
      el?.setSelectionRange(pos, pos);
    });
  };
  const preview = (t: string) => t.replace(/\{(\w+)\}/g, (_m, f: string) => SAMPLE[f] ?? `{${f}}`);
  let total = 0;

  return (
    <form action={action} className="cp-editor">
      <input type="hidden" name="data" value={JSON.stringify({ ...d, steps: d.steps.map((s) => ({ id: s.id, channel: s.channel, waitDays: s.waitDays, subject: s.subject, body: s.body })) })} />
      <section className="mlo-section cp-settings">
        <label className="mlo-field"><span>Name</span><input value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} className="mlo-input" /></label>
        <fieldset className="cp-fs">
          <legend>When someone replies</legend>
          <label className="cp-radio"><input type="radio" checked={d.kind === "followup"} onChange={() => set({ kind: "followup" })} /> <span><strong>Stop</strong> (follow up until they reply)</span></label>
          <label className="cp-radio"><input type="radio" checked={d.kind === "nurture"} onChange={() => set({ kind: "nurture" })} /> <span><strong>Keep going</strong> (stay in touch; STOP still ends it)</span></label>
        </fieldset>
        <label className="mlo-field"><span>What it&apos;s about (sets which permission it needs)</span>
          <select value={d.purpose} onChange={(e) => set({ purpose: e.target.value as Draft["purpose"] })} className="mlo-select">
            <option value="marketing">Staying in touch, or a new loan (marketing permission)</option>
            <option value="service">A loan they have in process with you (service permission)</option>
          </select>
        </label>
        <label className="mlo-field"><span>Who goes in</span>
          <select value={d.trigger} onChange={(e) => set({ trigger: e.target.value as Draft["trigger"] })} className="mlo-select">
            <option value="manual">People I add</option>
            <option value="new_lead">Every new lead, the moment it arrives</option>
            <option value="tag_added">{lc.triggerTag}</option>
          </select>
        </label>
        {d.trigger === "tag_added" ? (
          <label className="mlo-field"><span>{lc.triggerTagLabel}</span>
            <input value={d.triggerTag} maxLength={60} list="cp-trigger-tags" onChange={(e) => set({ triggerTag: e.target.value })} className="mlo-input" aria-describedby="cp-trigger-note" autoComplete="off" />
            <datalist id="cp-trigger-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
            <span className="mlo-note" id="cp-trigger-note">{lc.triggerTagNote}</span>
          </label>
        ) : null}
        <fieldset className="cp-fs">
          <legend>Sending days and hours (their time zone)</legend>
          <div className="cp-days">{DAYS.map((n, i) => <label key={n} className={`cp-day ${d.days.includes(i) ? "is-on" : ""}`}><input type="checkbox" checked={d.days.includes(i)} onChange={() => set({ days: d.days.includes(i) ? d.days.filter((x) => x !== i) : [...d.days, i].sort() })} />{n}</label>)}</div>
          <div className="mlo-row-form">
            <select aria-label="Earliest hour" value={d.hours.start} onChange={(e) => set({ hours: { ...d.hours, start: Number(e.target.value) } })} className="mlo-select">{Array.from({ length: 13 }, (_, i) => i + 7).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
            <span>to</span>
            <select aria-label="Latest hour" value={d.hours.end} onChange={(e) => set({ hours: { ...d.hours, end: Number(e.target.value) } })} className="mlo-select">{Array.from({ length: 13 }, (_, i) => i + 9).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
          </div>
          <p className="mlo-note">Your contact rules can narrow this further (for example 9 to 8 in most states, and stricter in some).</p>
        </fieldset>
      </section>

      <section className="mlo-section">
        <h2>Steps</h2>
        {!textReady && d.steps.some((s) => s.channel === "text") ? <p className="mlo-flash mlo-flash--err">Texting isn&apos;t connected yet, so text steps will be skipped. <a href="/mlo/setup-help?topic=texting">Set it up with the assistant</a>.</p> : null}
        {!emailReady && d.steps.some((s) => s.channel === "email") ? <p className="mlo-flash mlo-flash--err">Email isn&apos;t ready, so email steps won&apos;t go out. <a href="/mlo/email">Connect your email</a>.</p> : null}
        <ol className="cp-steps">
          {d.steps.map((s, i) => {
            total += s.waitDays;
            return (
              <li key={s.key} className={`cp-step cp-step--${s.channel}`}>
                <div className="cp-step__head">
                  <span className="cp-step__day">Day {total}</span>
                  <select aria-label={`Step ${i + 1} type`} value={s.channel} onChange={(e) => setStep(s.key, { channel: e.target.value as StepChannel })} className="mlo-select cp-step__ch">
                    {(Object.keys(CH) as StepChannel[]).map((c) => <option key={c} value={c}>{CH[c]}</option>)}
                  </select>
                  <label className="cp-wait">{i === 0 ? "Start" : "Wait"} <input type="number" min={0} max={365} value={s.waitDays} onChange={(e) => setStep(s.key, { waitDays: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) })} className="mlo-input" aria-label={`Step ${i + 1} wait in days`} /> {i === 0 ? "days after they're added" : "days after the step before"}</label>
                  <span className="cp-step__tools">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === d.steps.length - 1} aria-label={`Move step ${i + 1} down`}>↓</button>
                    <button type="button" onClick={() => set({ steps: d.steps.filter((x) => x.key !== s.key) })} aria-label={`Remove step ${i + 1}`}>Remove</button>
                  </span>
                </div>
                {s.channel === "email" ? <label className="mlo-field"><span>Subject</span><input value={s.subject} maxLength={120} onChange={(e) => setStep(s.key, { subject: e.target.value })} className="mlo-input" /></label> : null}
                <label className="mlo-field"><span>{s.channel === "task" ? "What to remind you to do" : "Message"}</span>
                  <textarea ref={(el) => { refs.current[s.key] = el; }} rows={s.channel === "email" ? 7 : 3} maxLength={s.channel === "email" ? 4000 : s.channel === "text" ? 480 : 300} value={s.body} onChange={(e) => setStep(s.key, { body: e.target.value })} className="mlo-textarea" />
                </label>
                {s.channel !== "task" ? (
                  <div className="cp-fields">
                    <span className="mlo-note">Fill in:</span>
                    {CAMPAIGN_FIELDS.map((f) => <button type="button" key={f} className="cp-chip" onClick={() => insert(s.key, f)}>{FIELD_LABELS[f]}</button>)}
                    {s.channel === "text" ? <span className="mlo-note">{s.body.length}/480</span> : null}
                  </div>
                ) : null}
                {s.body.trim() && s.channel !== "task" ? <p className="cp-preview"><span>Preview</span>{preview(s.channel === "email" ? `${s.subject}\n\n${s.body}` : s.body)}</p> : null}
              </li>
            );
          })}
        </ol>
        <div className="mlo-row-form">
          <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => add("text")}>+ Text</button>
          <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => add("email")}>+ Email</button>
          <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => add("task")}>+ Task for me</button>
        </div>
        <p className="mlo-note">Voicemail drops are coming next. Texts include who you are and how to opt out, and emails get your signature and the required footer.</p>
      </section>
      <div className="cp-savebar"><button type="submit" className="mlo-btn">Save</button></div>
    </form>
  );
}
