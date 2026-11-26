"use client";

import { useState } from "react";
import { describePlan, moveTargets, SLOT_LABELS, type MoveTarget, type Plan, type SlotField, type Slots } from "@/lib/contacts/reslot";
import { stateFromZip, type DateOrder } from "@/lib/contacts/normalize";
import { usStateName } from "@/lib/us-states";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import type { RowPlan } from "./types";

const s = ic.shift;
const mv = ic.move;
const CARDS_SHOWN = 10;

/** A plan in words: the headline ("ZIP 85262 · State AZ · City Scottsdale") and the lines under it. */
export function planWords(plan: Plan): { moved: string; more: string[] } {
  const d = describePlan(plan);
  const more: string[] = [];
  if (d.cleared.length) more.push(s.cleared(d.cleared.map((f) => SLOT_LABELS[f])));
  for (const n of d.noted) more.push(s.noted(SLOT_LABELS[n.field], n.value));
  const zip = d.moved.find((m) => m.to === "zip");
  if (plan.sure && zip) {
    const st = stateFromZip(zip.value);
    if (st) more.push(s.fits(zip.value, usStateName(st) ?? st));
  }
  return { moved: s.moved(d.moved.map((m) => s.part(SLOT_LABELS[m.to], m.value))), more };
}

/**
 * D93.1: rows that look shifted one column, at the top of Needs a look. Each
 * card says what would move where; Accept applies every move in the row at
 * once (the replaced values leave Needs a look), Keep as written hides the
 * card (the values stay in Needs a look, and in notes as written).
 */
export function ShiftCards({ plans, multi, onAccept }: { plans: RowPlan[]; multi: boolean; onAccept: (p: RowPlan) => void }) {
  const [kept, setKept] = useState<string[]>([]);
  const open = plans.filter((p) => !kept.includes(p.key));
  if (!open.length) return null;
  return (
    <div className="im-shifts" role="region" aria-label={s.region}>
      {open.length > 1 ? (
        <div className="mlo-actions">
          <button type="button" className="mlo-btn" onClick={() => open.forEach(onAccept)}>{s.acceptAll(open.length)}</button>
        </div>
      ) : null}
      <ul className="im-shift__list">
        {open.slice(0, CARDS_SHOWN).map((p) => {
          const w = planWords(p.plan);
          return (
            <li key={p.key} className="cc-card im-shift">
              <p className="cc-card__title">{s.title(s.where(multi ? p.file : null, p.row))}</p>
              <p className="im-shift__who"><strong>{p.name}</strong></p>
              <p className="im-shift__moves">{w.moved}</p>
              {w.more.map((line) => <p key={line} className="mlo-note">{line}</p>)}
              <div className="mlo-row-form">
                <button type="button" className="mlo-btn" onClick={() => onAccept(p)} aria-label={s.acceptLabel(p.name)}>{s.accept}</button>
                <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => setKept((k) => [...k, p.key])} aria-label={s.keepLabel(p.name)}>{s.keep}</button>
              </div>
            </li>
          );
        })}
      </ul>
      {open.length > CARDS_SHOWN ? <p className="mlo-note">{s.more(open.length - CARDS_SHOWN)}</p> : null}
      <p className="mlo-note">{s.note}</p>
    </div>
  );
}

/**
 * D93.1: "Move it to…" on one Needs a look value. Buttons for each box the
 * value fits (blank, failing or holding the same value) and Notes; the value
 * is also a chip that can be dragged onto one of them (each shows a dashed
 * outline while dragging). Buttons are the way for keyboard and touch; drag
 * is an extra.
 */
export function MoveTo({ from, slots, failing, dateOrder, onMove }: { from: SlotField; slots: Slots; failing: SlotField[]; dateOrder?: DateOrder; onMove: (to: MoveTarget) => void }) {
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<MoveTarget | null>(null);
  const value = slots[from];
  const targets = moveTargets(from, slots, failing, { dateOrder });
  if (!value || !targets.length) return null;
  const short = value.length > 40 ? `${value.slice(0, 40)}…` : value;
  return (
    <div className={`im-move${dragging ? " im-move--drag" : ""}`} role="group" aria-label={mv.label(short)}>
      <span
        className="im-move__chip"
        draggable
        title={mv.chipLabel(short)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", value);
          setDragging(true);
        }}
        onDragEnd={() => {
          setDragging(false);
          setOver(null);
        }}
      >
        <span aria-hidden="true" className="im-move__grip">⠿</span>
        {short}
      </span>
      <span className="im-move__label" aria-hidden="true">{mv.short}</span>
      {targets.map((to) => (
        <button
          key={to}
          type="button"
          className={`mlo-btn mlo-btn--ghost im-move__to${dragging ? " im-drop" : ""}${over === to ? " im-drop--over" : ""}`}
          aria-label={mv.buttonLabel(short, mv.to[to])}
          onClick={() => onMove(to)}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setOver(to);
          }}
          onDragLeave={() => setOver((o) => (o === to ? null : o))}
          onDrop={(e) => {
            if (!dragging) return;
            e.preventDefault();
            setDragging(false);
            setOver(null);
            onMove(to);
          }}
        >
          {mv.to[to]}
        </button>
      ))}
    </div>
  );
}
