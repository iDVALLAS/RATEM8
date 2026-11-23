import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { findRateMentions } from "@/lib/m8/guard";
import { LEADS, LEAD_MOVES } from "@/lib/content/cc-pages";
import { leadScorecard, type ScoreEvent, type ScoreInput, type ScoreLoan, type ScoreSpend } from "@/lib/leads/scorecard";
import { RealScorecard } from "./LeadSections";

/** D84: the real scorecard as the page renders it (kept beside the page: only app/mlo/leads/ imports the page's files). */

const NOW = new Date("2026-11-22T18:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const dayAgo = (days: number) => ago(days).slice(0, 10);
let n = 0;
const ev = (sourceKey: string, days: number, o: Partial<ScoreEvent> = {}): ScoreEvent => ({ contactId: `c${++n}`, sourceKey, sourceLabel: sourceKey === "zillow" ? "Zillow" : sourceKey, at: ago(days), duplicate: false, namesYou: true, datedBy: "delivery", ...o });
const evs = (count: number, sourceKey: string, days: number, o: (i: number) => Partial<ScoreEvent> = () => ({})) => Array.from({ length: count }, (_, i) => ev(sourceKey, days, o(i)));
const line = (leadSource: string | null, dollars: number, days: number): ScoreSpend => ({ date: dayAgo(days), amountCents: dollars * 100, businessPct: 100, leadSource, status: "confirmed", kind: "expense" });
const closedLoan = (id: string, contactId: string, closedDaysAgo: number): ScoreLoan => ({ id, contactId, closed: true, dead: false, milestoneAt: ago(closedDaysAgo), keyDates: { application: dayAgo(closedDaysAgo + 30) }, history: [] });
const card = (i: Partial<ScoreInput>) => leadScorecard({ period: "90d", now: NOW, events: [], spend: [], loans: [], contacts: [], ...i });

describe("the real scorecard on the page (D84)", () => {
  const events = [...evs(30, "lendingtree", 10, (i) => ({ namesYou: i < 6, sourceLabel: "LendingTree" })), ...evs(3, "zillow", 10)];
  const c = card({ events, spend: [line("lendingtree", 2700, 5)], loans: [closedLoan("l", events[0].contactId, 3)] });
  const html = (move: { id: string; title: string; why: string } | null = null, review = false) => renderToStaticMarkup(createElement(RealScorecard, { card: c, move, review }));

  it("a table on desktop and cards on phones, every figure, real buttons for the period, the target form", () => {
    const h = html();
    expect(h).toContain('data-example="false"');
    expect(h).toContain('<table class="mlo-table cc-score__tbl cc-score__tbl--live">');
    expect((h.match(/class="cc-scard"/g) ?? []).length).toBe(c.rows.length);
    for (const w of ["In pipeline", "Per lead you can call", "Repeats", "Fix permission", "Not enough data", "6 · 20%", "$450 each", "$2,700", "$90", "Past clients &amp; sphere", "—", "None yet", "Spend comes from lead-spend lines in Expenses.", "Log spend", "Set a monthly amount per source", 'name="target"', 'value="1000"', "Save target"]) expect(h).toContain(w);
    // The period switch: three real buttons, one pressed, no value-carrying buttons.
    expect(h.match(/<button type="submit" class="cc-period__b" aria-pressed="(true|false)">/g)).toHaveLength(3);
    expect(h).toContain('aria-pressed="true">90 days</button>');
    expect(h).toContain('role="group" aria-label="Period"');
    expect(h).not.toMatch(/<button[^>]*\b(name|value)=/);
    expect(h).not.toContain("cc-ex");
  });

  it("the Business Manager's newest move is the banner, with Review; Approve waits for the planner", () => {
    const m = { id: "mv_1", title: "Move Bankrate’s budget to your web form for 60 days", why: "Bankrate: $1,500 spent." };
    const closed = html(m);
    expect(closed).toContain("Business Manager:");
    expect(closed).toContain(m.title);
    expect(closed).toContain('href="/mlo/leads?review=1#lead-move"');
    expect(closed).not.toContain("lead-move-review");
    const open = html(m, true);
    expect(open).toContain('id="lead-move-review"');
    expect(open).toMatch(/<button type="button" class="mlo-btn" disabled="" aria-describedby="lead-move-off">Approve<\/button>/);
    expect(open).toContain(LEADS.score.real.move.approveOff.slice(0, 40));
    expect(open).toContain(">Not now</button>");
    expect(html()).not.toContain("Business Manager:");
  });

  it("“share you can call” and the scorecard's words don't read as rates", () => {
    const text = html({ id: "x", title: LEAD_MOVES.fix("LendingTree"), why: LEAD_MOVES.fixWhy("LendingTree", 90, 18, 20) }, true).replace(/<[^>]+>/g, "\n");
    expect(text).toContain("20%");
    expect(findRateMentions(text)).toEqual([]);
    const r = LEADS.score.real;
    const words = [r.sub("90 days"), r.unattributed(2), r.target.help("$1,000"), r.target.saved("$1,500"), r.sphereNote, r.move.approveOff, r.move.dismissed, LEAD_MOVES.tail, LEAD_MOVES.pauseWhy("Bankrate", "$1,500", 25), LEAD_MOVES.toWhy("Your web form", "$600"), LEADS.score.badgeNote, "You can call 18 · 20%", "Share you can call: 7%", "Share you can call: 45%"].join("\n");
    expect(findRateMentions(words)).toEqual([]);
    const banned = ["guaran" + "teed", "best " + "rates", "commis" + "sion", "referral " + "fee", "hur" + "ry"];
    for (const b of banned) expect(words.toLowerCase()).not.toContain(b);
    expect(words).not.toMatch(/gift[^.]*referr|referr[^.]*gift/i);
  });
});
