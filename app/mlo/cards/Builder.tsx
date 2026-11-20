"use client";

import { useMemo, useState } from "react";

export type PickPerson = { id: string; name: string; group: string; mailable: boolean; note: string };
export type DesignOpt = { id: number; name: string; image: string };
type Starter = { id: string; label: string; message: string };

const GROUPS: [string, string][] = [["all", "Everyone"], ["past_client", "Past clients"], ["lead", "Leads"], ["sphere", "Sphere"], ["agent", "Agents"], ["other", "Everyone else"]];

/** D53: the card builder. Plain form fields; the server checks everything again. */
export default function Builder({ action, people, designs, styles, starters, signoff, max, preselect }: {
  action: (fd: FormData) => void;
  people: PickPerson[];
  designs: { notecard: DesignOpt[]; "4x6": DesignOpt[]; "6x9": DesignOpt[] };
  styles: { id: number; name: string }[];
  starters: Starter[];
  signoff: string;
  max: number;
  preselect: string[];
}) {
  const [kind, setKind] = useState<"notecard" | "postcard">("notecard");
  const [size, setSize] = useState<"4x6" | "6x9">("4x6");
  const [message, setMessage] = useState(starters[0]?.message ?? "");
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preselect));
  const list = kind === "notecard" ? designs.notecard : designs[size];
  const [design, setDesign] = useState<string>("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people.filter((p) => (group === "all" || p.group === group) && (!t || p.name.toLowerCase().includes(t)));
  }, [people, group, q]);
  const toggle = (id: string, on: boolean) => setPicked((s) => {
    const n = new Set(s);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  });
  const selectShown = (on: boolean) => setPicked((s) => {
    const n = new Set(s);
    for (const p of shown) {
      if (on && p.mailable) n.add(p.id);
      else if (!on) n.delete(p.id);
    }
    return n;
  });
  const shownMailable = shown.filter((p) => p.mailable).length;
  const visible = shown.slice(0, 1000);
  const visibleIds = new Set(visible.map((p) => p.id));
  // People picked under another group or search still go with the form.
  const hiddenPicked = [...picked].filter((id) => !visibleIds.has(id));

  return (
    <form action={action} className="cd-builder">
      <fieldset className="mlo-section cd-step">
        <legend>1 · The card</legend>
        <div className="mlo-row-form">
          <label className="cd-choice"><input type="radio" name="kind" value="notecard" checked={kind === "notecard"} onChange={() => { setKind("notecard"); setDesign(""); }} /> Folded notecard in an envelope</label>
          <label className="cd-choice"><input type="radio" name="kind" value="postcard" checked={kind === "postcard"} onChange={() => { setKind("postcard"); setDesign(""); }} /> Postcard</label>
          {kind === "postcard" ? (
            <select name="size" className="mlo-select" aria-label="Postcard size" value={size} onChange={(e) => { setSize(e.target.value === "6x9" ? "6x9" : "4x6"); setDesign(""); }}>
              <option value="4x6">4 × 6</option>
              <option value="6x9">6 × 9</option>
            </select>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="mlo-section cd-step">
        <legend>2 · The front</legend>
        {list.length ? (
          <div className="cd-designs" role="radiogroup" aria-label="Front design">
            {list.map((d) => {
              const v = `${d.id}|${d.image}`;
              return (
                <label key={d.id} className={`cd-design ${design === v ? "is-on" : ""}`}>
                  <input type="radio" name="design" value={v} checked={design === v} onChange={() => setDesign(v)} required />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.image} alt="" loading="lazy" />
                  <span>{d.name}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="mlo-note">No {kind === "notecard" ? "notecard" : `${size} postcard`} designs in your Thanks.io library yet. In Thanks.io, open Image Templates (they have ready-made holiday designs), add one for this card, then reload this page.</p>
        )}
      </fieldset>

      <fieldset className="mlo-section cd-step">
        <legend>3 · The words</legend>
        <div className="cd-starters">
          {starters.map((s) => <button key={s.id} type="button" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} onClick={() => setMessage(s.message)}>{s.label}</button>)}
        </div>
        <label className="mlo-field" style={{ marginTop: 10 }}>
          <span>Message ({message.length} of {max}) · {"{first}"} becomes each person&apos;s first name</span>
          <textarea name="message" rows={7} maxLength={max} className="mlo-textarea" value={message} onChange={(e) => setMessage(e.target.value)} required />
        </label>
        <p className="mlo-note">Always added at the end:</p>
        <pre className="cd-signoff">{signoff}</pre>
        <div className="mlo-row-form">
          <label className="mlo-field" style={{ minWidth: 220 }}>
            <span>Handwriting</span>
            <select name="style" className="mlo-select" defaultValue="">
              <option value="">Your Thanks.io default</option>
              {styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="mlo-section cd-step">
        <legend>4 · Who gets one</legend>
        <div className="mlo-row-form">
          <select className="mlo-select" aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)}>
            {GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input className="mlo-input" type="search" placeholder="Find a name" aria-label="Find a name" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} onClick={() => selectShown(true)} disabled={!shownMailable}>Select all {shownMailable ? `(${shownMailable})` : ""}</button>
          <button type="button" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 0 }} onClick={() => selectShown(false)}>Clear</button>
        </div>
        <ul className="cd-people">
          {visible.map((p) => (
            <li key={p.id}>
              <label className={p.mailable ? "" : "is-off"}>
                <input type="checkbox" name="contactIds" value={p.id} checked={picked.has(p.id)} disabled={!p.mailable && !picked.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
                <span>{p.name}</span>
                {p.note ? <span className="mlo-note">{p.note}</span> : null}
              </label>
            </li>
          ))}
          {shown.length > 1000 ? <li className="mlo-note">Showing the first 1,000. Use a group or search to narrow it.</li> : null}
          {!shown.length ? <li className="mlo-note">Nobody here.</li> : null}
        </ul>
        {hiddenPicked.map((id) => <input key={id} type="hidden" name="contactIds" value={id} />)}
      </fieldset>

      <div className="cd-bar">
        <span><strong>{picked.size}</strong> picked</span>
        <button type="submit" className="mlo-btn" style={{ marginTop: 0 }} disabled={!picked.size || !design}>Check the price</button>
        <span className="mlo-note">Nothing is sent or charged yet.</span>
      </div>
    </form>
  );
}
