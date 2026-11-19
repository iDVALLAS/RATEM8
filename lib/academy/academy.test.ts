import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSIONS, TRACKS, sessionsOf } from "./course";
import { grade, logWeek, MemoryAcademyStore, practiceCoach, practiceTurn, ruleFlags, saveCoachNote, saveNumbers, setAcademyStoreForTests, academyStore, teamProgress, weekOf, type PracticeCall } from "./service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";

const NOW = new Date("2026-11-19T18:00:00Z"); // Thursday
const lo: User = { id: "lo1", email: "lo1@x.com", name: "Pat Lo", role: "lo", mloId: null, status: "active", createdAt: "2026-01-01T00:00:00Z", createdBy: "" };
const owner: User = { ...lo, id: "own", email: "own@x.com", role: "owner", name: "Olive" };

describe("Training content (D39)", () => {
  it("every session is complete, numbered, and its quiz answers are valid", () => {
    expect(new Set(SESSIONS.map((s) => s.id)).size).toBe(SESSIONS.length);
    for (const t of Object.keys(TRACKS) as (keyof typeof TRACKS)[]) expect(sessionsOf(t).map((s) => s.n)).toEqual(sessionsOf(t).map((_, i) => i + 1));
    for (const s of SESSIONS) {
      expect(s.learn.length, s.id).toBeGreaterThan(0);
      expect(s.doThisWeek.length, s.id).toBeGreaterThan(0);
      expect(s.quiz.length, s.id).toBeGreaterThan(0);
      for (const q of s.quiz) expect(q.answer, `${s.id}: ${q.q}`).toBeLessThan(q.options.length);
    }
    // The RESPA line is taught in the first session of each track that deals with referrals.
    expect(JSON.stringify(sessionsOf("partners")[0])).toMatch(/RESPA section 8/);
    expect(JSON.stringify(sessionsOf("licensing")[2])).toMatch(/RESPA section 8/);
  });
});

describe("Training progress, numbers and practice (D39)", () => {
  beforeEach(async () => {
    setAcademyStoreForTests(new MemoryAcademyStore());
    const a = new MemoryAccountStore();
    setAccountStoreForTests(a);
    await a.putUser(lo);
    await a.putUser(owner);
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CC_ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    setAcademyStoreForTests(null);
    setAccountStoreForTests(null);
  });

  it("passes at 80%, keeps the best score and the first pass date", async () => {
    const s = SESSIONS.find((x) => x.id === "p1")!;
    const right = s.quiz.map((q) => q.answer);
    const wrong = s.quiz.map((q) => (q.answer + 1) % q.options.length);
    expect(await grade(lo, "p1", wrong, NOW)).toMatchObject({ ok: true, passed: false, score: 0 });
    expect(await grade(lo, "p1", [0], NOW)).toMatchObject({ ok: false });
    expect(await grade(lo, "p1", right, NOW)).toMatchObject({ ok: true, passed: true, score: s.quiz.length });
    await grade(lo, "p1", wrong, new Date(NOW.getTime() + 1000));
    const [p] = await academyStore().progress("lo1");
    expect(p).toMatchObject({ best: s.quiz.length, passedAt: NOW.toISOString() });
  });

  it("tracks targets and weekly numbers, and shows the owner the team", async () => {
    expect(weekOf(NOW)).toBe("2026-11-16");
    expect(await saveNumbers(lo, { monthlyPurchaseGoal: 4, weeklyConversations: 10, weeklyMeetings: 2 }, NOW)).toEqual({ ok: true });
    expect(await saveNumbers(lo, { monthlyPurchaseGoal: -1, weeklyConversations: 10, weeklyMeetings: 2 }, NOW)).toMatchObject({ ok: false });
    expect(await logWeek(lo, { conversations: 8, meetings: 1, followUps: 5, introductions: 1 }, NOW)).toEqual({ ok: true });
    expect(await logWeek(lo, { week: "2026-11-30", conversations: 1, meetings: 0, followUps: 0, introductions: 0 }, NOW)).toMatchObject({ ok: false });
    expect(await teamProgress(lo)).toBeNull();
    const team = await teamProgress(owner);
    expect(team?.find((t) => t.userId === "lo1")).toMatchObject({ lastWeek: { week: "2026-11-16", conversations: 8 }, targets: { weeklyConversations: 10 } });
    expect(await saveCoachNote(lo, "p1", "x", NOW)).toMatchObject({ ok: false });
    expect(await saveCoachNote(owner, "p1", "From our coaching: block 8 to 9 a.m.", NOW)).toEqual({ ok: true });
  });

  it("flags anything of value for referrals, with or without the AI", async () => {
    expect(ruleFlags(["I'll pay for your open house signs if you send me buyers"])).toHaveLength(1);
    expect(ruleFlags(["Could I buy you a coffee and hear how you work with lenders?"])).toHaveLength(0);
    const r = await practiceCoach("p5", [{ who: "me", text: "I'll give you a gift card for every buyer you send" }], { call: null });
    expect(r).toMatchObject({ ok: true, flags: [expect.stringMatching(/RESPA section 8/)] });
  });

  it("M8 plays the agent; its lines pass the checks; without the AI it explains the goal", async () => {
    const call: PracticeCall = async () => ({ stop: "end_turn", text: "Fine, coffee Tuesday. But my last lender promised a lot." });
    expect(await practiceTurn("p5", [{ who: "me", text: "Hi Jordan, I saw your listing on Elm. Could I buy you a coffee?" }], { call })).toMatchObject({ ok: true, live: true, reply: expect.stringMatching(/coffee/) });
    const bad: PracticeCall = async () => ({ stop: "end_turn", text: "Rates are 5.9% at my other lender." });
    expect(await practiceTurn("p5", [{ who: "me", text: "Hello" }], { call: bad })).toMatchObject({ ok: true, reply: expect.not.stringMatching(/5\.9/) });
    expect(await practiceTurn("p5", [{ who: "me", text: "Hello" }], { call: null })).toMatchObject({ ok: true, live: false });
    expect(await practiceTurn("p1", [{ who: "me", text: "Hello" }], { call })).toMatchObject({ ok: false }); // no practice in session 1
  });
});
