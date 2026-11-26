"use client";

import { useEffect, useMemo, useState } from "react";
import type { DateOrder } from "@/lib/contacts/normalize";
import type { ImportKind } from "@/lib/contacts/mapping";
import { FIX_LABELS, localSuggestion, reasonCode } from "@/lib/contacts/review";
import { FIX_MAX } from "@/lib/contacts/ai-safe";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import { aiFixAllAction } from "../actions";
import { planMoves, SLOT_FIELDS, type Move, type MoveTarget, type SlotField, type Slots } from "@/lib/contacts/reslot";
import { planWords } from "./Shift";
import type { Look, RowPlan } from "./types";

const f = ic.fixAll;
const SHOWN = 100;
/** At most this many values go to M8 in one Fix all (in calls of 100, file by file). */
const MAX_SENT = 1000;

type Proposal = { key: string; value: string; why: string; by: "m8" | "device"; /** D93.1: a shifted row, accepted as one. */ row?: RowPlan };
const isSlot = (f: string): f is SlotField => (SLOT_FIELDS as readonly string[]).includes(f);

/**
 * D93: "Fix all with M8". M8 proposes fixes for the "Needs a look" values in
 * bulk, from the value and the rest of the row (owner decision 2026-11-25);
 * the server keeps only fixes that pass the import's own check and can be
 * worked out from what's written. Agent rows, RETR files and agent-only
 * imports never go to M8: their fixes (and everything, without a key or
 * allowance) are worked out on this device. Nothing changes until the loan
 * officer accepts a fix.
 */
export default function FixAll({ looks, kind, allowed, contextOf, dateOrderOf, onAccept, plans, slotsAt, onAcceptRow, onClose }: {
  looks: Look[];
  kind: ImportKind;
  allowed: (l: Look) => boolean;
  contextOf: (l: Look) => { file: string; headers: string[]; context: Record<string, string> };
  dateOrderOf: (itemId: string) => DateOrder | undefined;
  onAccept: (l: Look, value: string) => void;
  /** D93.1: shifted rows worked out on the device (one proposal per row), each row's boxes, and accepting a row. */
  plans: RowPlan[];
  slotsAt: (itemId: string, at: number) => Slots;
  onAcceptRow: (p: RowPlan) => void;
  onClose: () => void;
}) {
  // The values as they were when it opened; an accepted one drops out of `looks`.
  const [asked] = useState(() => looks.filter((l) => l.field !== "tags"));
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [localWhy, setLocalWhy] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(0);
  const live = useMemo(() => new Map(looks.map((l) => [l.key, l])), [looks]);

  useEffect(() => {
    let gone = false;
    (async () => {
      const out = new Map<string, Proposal>();
      // D93.1: a shifted row the device worked out is one proposal; its values aren't asked again.
      const covered = new Set<string>();
      for (const p of plans) {
        if (!p.looks.some((k) => asked.some((l) => l.key === k))) continue;
        out.set(p.key, { key: p.key, value: "", why: "", by: "device", row: p });
        p.looks.forEach((k) => covered.add(k));
      }
      const toM8 = kind === "contacts" ? asked.filter((l) => allowed(l) && !covered.has(l.key)).slice(0, MAX_SENT) : [];
      // M8's "this belongs in another box", gathered per row and planned together.
      const moves = new Map<string, { itemId: string; at: number; moves: Move[]; keys: string[]; why: string }>();
      // One call per file (its name and headers let the server refuse a RETR file again), 100 values at a time.
      const byFile = new Map<string, Look[]>();
      for (const l of toM8) byFile.set(l.itemId, [...(byFile.get(l.itemId) ?? []), l]);
      let off: string | null = null;
      for (const group of byFile.values()) {
        const { file, headers } = contextOf(group[0]);
        for (let i = 0; i < group.length && !off; i += FIX_MAX) {
          const chunk = group.slice(i, i + FIX_MAX);
          const r = await aiFixAllAction({
            fileName: file,
            kind,
            headers,
            items: chunk.map((l) => ({ key: l.key, field: l.field, raw: l.raw, reason: reasonCode(l), ...(dateOrderOf(l.itemId) ? { dateOrder: dateOrderOf(l.itemId) } : {}), context: contextOf(l).context })),
          }).catch(() => null);
          if (gone) return;
          if (r?.ok)
            for (const p of r.fixes) {
              const l = chunk.find((x) => x.key === p.key);
              if (p.moveTo && l && isSlot(l.field)) {
                const rk = `row:${l.itemId}:${l.at}`;
                const cur = moves.get(rk) ?? { itemId: l.itemId, at: l.at, moves: [], keys: [], why: p.why };
                cur.moves.push({ from: l.field, to: p.moveTo as MoveTarget, value: p.value });
                cur.keys.push(l.key);
                moves.set(rk, cur);
              } else if (!p.moveTo) out.set(p.key, { ...p, by: "m8" });
            }
          else if (r && !r.ok && r.error === "no AI") off = r.why ?? "M8 isn't available";
        }
      }
      for (const [rk, m] of moves) {
        const rowLooks = asked.filter((l) => l.itemId === m.itemId && l.at === m.at && isSlot(l.field));
        const plan = planMoves(slotsAt(m.itemId, m.at), rowLooks.map((l) => l.field as SlotField), m.moves, { dateOrder: dateOrderOf(m.itemId) });
        if (!plan) continue;
        const keys = rowLooks.filter((l) => (plan.covers as string[]).includes(l.field)).map((l) => l.key);
        for (const k of keys) {
          out.delete(k);
          covered.add(k);
        }
        const l0 = rowLooks[0];
        out.set(rk, { key: rk, value: "", why: m.why, by: "m8", row: { key: rk, itemId: m.itemId, at: m.at, row: l0.row, file: l0.file, name: l0.name, plan, by: "m8", why: m.why, looks: keys } });
      }
      // Anything M8 didn't fix (or wasn't sent) gets the device's own likely fix, when there is one.
      for (const l of asked) {
        if (out.has(l.key) || covered.has(l.key)) continue;
        const s = localSuggestion(l.field, l.raw, { dateOrder: dateOrderOf(l.itemId) });
        if (s) out.set(l.key, { key: l.key, value: s, why: ic.fix.suggested, by: "device" });
      }
      if (gone) return;
      setLocalWhy(off);
      setProposals([...out.values()]);
    })();
    return () => {
      gone = true;
    };
    // Runs once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOpen = (p: Proposal) => (p.row ? p.row.looks.some((k) => live.has(k)) : live.has(p.key));
  const open = (proposals ?? []).filter(isOpen);
  const accept = (p: Proposal) => {
    if (p.row) {
      if (!isOpen(p)) return;
      onAcceptRow(p.row);
      setAccepted((n) => n + 1);
      return;
    }
    const l = live.get(p.key);
    if (!l) return;
    onAccept(l, p.value);
    setAccepted((n) => n + 1);
  };
  const reject = (p: Proposal) => setProposals((cur) => (cur ?? []).filter((x) => x.key !== p.key));
  const acceptAll = () => {
    for (const p of open) accept(p);
  };
  const left = asked.filter((l) => live.has(l.key) && !open.some((p) => p.key === l.key || p.row?.looks.includes(l.key))).length;
  const what = (l: Look) => f.from(FIX_LABELS[l.field], l.name, l.raw);
  const rowWhat = (r: RowPlan) => f.fromRow(r.name, ic.shift.title(ic.shift.where(null, r.row)));

  return (
    <div className="cc-card im-fix im-fixall" role="region" aria-labelledby="im-fixall-title" aria-busy={proposals === null}>
      <div className="im-fix__head">
        <h3 id="im-fixall-title" className="cc-card__title">{proposals === null ? f.working(asked.length) : f.title(open.length)}</h3>
        <button type="button" className="cc-tag__x im-fix__x" aria-label={f.close} onClick={onClose}><span aria-hidden="true">×</span></button>
      </div>
      <p className="mlo-note">{f.note}</p>
      {localWhy ? <p className="mlo-note">{f.local(localWhy)}</p> : null}
      {kind !== "contacts" || asked.some((l) => !allowed(l)) ? <p className="mlo-note">{f.notSent}</p> : null}
      {accepted ? <p className="mlo-note" role="status">{f.accepted(accepted)}</p> : null}
      {proposals !== null && !open.length ? <p className="im-fix__ask">{f.none}</p> : null}
      {open.length > 1 ? (
        <div className="mlo-actions">
          <button type="button" className="mlo-btn" onClick={acceptAll}>{f.acceptAll(open.length)}</button>
        </div>
      ) : null}
      {open.length ? (
        <ul className="im-fixall__list">
          {open.slice(0, SHOWN).map((p) => {
            if (p.row) {
              const w = planWords(p.row.plan);
              const where = rowWhat(p.row);
              return (
                <li key={p.key} className="im-fixall__row">
                  <div className="im-fixall__what">
                    <span className="im-fixall__from">{where}</span>
                    <strong className="im-fixall__to">→ {w.moved}</strong>
                    {w.more.map((line) => <span key={line} className="mlo-note">{line}</span>)}
                    {p.by === "m8" ? <span className="mlo-note">{ic.fix.m8} {p.why || ic.shift.m8}</span> : null}
                  </div>
                  <div className="mlo-row-form">
                    <button type="button" className="mlo-btn" onClick={() => accept(p)} aria-label={f.acceptLabel(where)}>{f.accept}</button>
                    <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => reject(p)} aria-label={f.rejectLabel(where)}>{f.reject}</button>
                  </div>
                </li>
              );
            }
            const l = live.get(p.key)!;
            return (
              <li key={p.key} className="im-fixall__row">
                <div className="im-fixall__what">
                  <span className="im-fixall__from">{what(l)}</span>
                  <strong className="im-fixall__to">→ {p.value}</strong>
                  {p.why ? <span className="mlo-note">{p.by === "m8" ? `${ic.fix.m8} ` : ""}{p.why}</span> : null}
                </div>
                <div className="mlo-row-form">
                  <button type="button" className="mlo-btn" onClick={() => accept(p)} aria-label={f.acceptLabel(what(l))}>{f.accept}</button>
                  <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => reject(p)} aria-label={f.rejectLabel(what(l))}>{f.reject}</button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {open.length > SHOWN ? <p className="mlo-note">{ic.sort.more(open.length - SHOWN)}</p> : null}
      {proposals !== null && left ? <p className="mlo-note">{f.left(left)}</p> : null}
    </div>
  );
}
