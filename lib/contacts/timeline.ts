/**
 * lib/contacts/timeline.ts — one person's conversation, newest first (D77).
 * Client-safe and pure. Texts, emails and calls (in and out), the dated
 * notes on the contact ("Call note (2026-11-20): …" from an after-call note,
 * "Note (…): …" from the page), and campaign steps that weren't a message
 * (a task or a skipped step; sent steps are already messages).
 */
import type { Touch } from "@/lib/messaging/store";
import type { StepLog } from "@/lib/campaigns/store";
import { contactPageCopy as cp } from "@/lib/content/contact-page";

export type TimelineItem = { id: string; at: string; kind: "in" | "out" | "call" | "email" | "note" | "campaign"; title: string; body: string; meta: string | null };

const NOTE = /^(Call note|Note) \((\d{4}-\d{2}-\d{2})\): (.+)$/;

/** Dated notes on the contact, one item each (undated lines from an import stay in Details). */
export function notesOf(notes: string | null | undefined): TimelineItem[] {
  return (notes ?? "").split("\n").flatMap((line, i) => {
    const m = NOTE.exec(line.trim());
    return m ? [{ id: `n${i}`, at: `${m[2]}T12:00:00.000Z`, kind: "note" as const, title: m[1] === "Call note" ? cp.timeline.callNote : cp.timeline.note, body: m[3], meta: null }] : [];
  });
}

export function buildTimeline(touches: Touch[], notes: string | null | undefined, steps: { campaign: string; log: StepLog[] }[]): TimelineItem[] {
  const t = cp.timeline;
  const items: TimelineItem[] = touches.map((x) => ({
    id: x.id,
    at: x.at,
    kind: x.direction === "in" ? "in" : x.channel === "call" || x.channel === "ai_call" ? "call" : x.channel === "email" ? "email" : "out",
    title: x.direction === "in" ? t.theyTexted : x.channel === "call" || x.channel === "ai_call" ? (x.status === "dialed" ? t.dialed(x.actor) : t.call(x.actor)) : x.channel === "email" ? t.email(x.actor) : t.youTexted(x.actor),
    body: x.body,
    meta: [x.status === "dialed" || x.status === "logged" || x.status === "received" ? null : x.status, x.direction === "in" ? x.note : null].filter(Boolean).join(" · ") || null,
  }));
  items.push(...notesOf(notes));
  for (const s of steps) for (const [i, l] of s.log.entries()) if (l.outcome !== "sent") items.push({ id: `s${s.campaign}${i}${l.at}`, at: l.at, kind: "campaign", title: t.campaign(s.campaign), body: l.note, meta: l.outcome === "task" ? "task" : "skipped" });
  return items.sort((a, b) => b.at.localeCompare(a.at));
}
