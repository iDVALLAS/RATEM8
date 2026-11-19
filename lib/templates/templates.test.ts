import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KINDS, LIBRARY, fill, variablesOf } from "./library";
import { answerWithM8, allTemplates, checkTemplate, MemoryTemplateStore, render, saveTemplate, setTemplateStoreForTests, writeWithM8, type TemplateCall } from "./service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { mloById } from "@/lib/config";

const NOW = new Date("2026-11-19T18:00:00Z");
const lo: User = { id: "lo1", email: "lo1@x.com", name: "Pat Lo", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const owner: User = { ...lo, id: "own", role: "owner", email: "own@x.com" };
const other: User = { ...lo, id: "lo2", email: "lo2@x.com" };
const input = (body: string, extra: Partial<Parameters<typeof saveTemplate>[2]> = {}) => ({ kind: "open_house", channel: "text", title: "My open house text", subject: "", body, objection: "", shared: false, ...extra });

describe("Templates (D38)", () => {
  beforeEach(() => {
    setTemplateStoreForTests(new MemoryTemplateStore());
    setAccountStoreForTests(new MemoryAccountStore());
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CC_ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    setTemplateStoreForTests(null);
    setAccountStoreForTests(null);
  });

  it("every built-in template passes the draft checks, and every kind has some", () => {
    for (const t of LIBRARY) expect(checkTemplate(t.body, t.subject), t.id).toEqual({ ok: true });
    for (const k of KINDS) expect(LIBRARY.some((t) => t.kind === k), k).toBe(true);
    expect(new Set(LIBRARY.map((t) => t.id)).size).toBe(LIBRARY.length);
    // Anything printed or posted carries the licensing line.
    for (const t of LIBRARY.filter((x) => x.channel === "print" || x.channel === "social")) expect(t.body, t.id).toMatch(/NMLS #\{myNmls\}/);
    // The company is always paired with its own NMLS number, never the loan officer's.
    for (const t of LIBRARY) expect(t.body, t.id).not.toMatch(/\{company\}, NMLS #\{myNmls\}/);
  });

  it("fills your details from config and shows what's still missing", () => {
    const t = LIBRARY.find((x) => x.id === "oh-flyer")!;
    expect(variablesOf(t.body)).toContain("address");
    const r = render(lo, t, { address: "12 Elm St", agentName: "Jordan Lee" });
    const m = mloById("mlo-001")!;
    expect(r.body).toContain(`NMLS #${m.nmls}`);
    expect(r.body).toContain("12 Elm St");
    expect(r.missing).toEqual(["date", "time"]);
    expect(fill("Hi {first}", {})).toBe("Hi [first]");
  });

  it("checks what you save: no rates, dollar figures, dates typed in or promises", async () => {
    expect(await saveTemplate(lo, null, input("Hi {first}, join us at {address} on {date}!"), NOW)).toMatchObject({ ok: true });
    for (const bad of ["Rates are 5.9% this week, {first}!", "Only $500 down at {address}", "Open house on Nov 22 at {address}", "You'll be approved in a day, {first}", "Perfect for young families, {first}"]) {
      expect((await saveTemplate(lo, null, input(bad), NOW)).ok, bad).toBe(false);
    }
    expect(await saveTemplate(lo, null, input("Hi {first} {nope}"), NOW)).toMatchObject({ ok: true }); // unknown field stays visible as [nope]
  });

  it("only owners and team leads share with everyone; you change only your own", async () => {
    const a = await saveTemplate(lo, null, input("Hi {first}, coffee soon?", { shared: true }), NOW);
    const b = await saveTemplate(owner, null, input("Hi {first}, our team's open house is at {address}.", { shared: true, title: "Team invite" }), NOW);
    expect(a.ok && b.ok).toBe(true);
    const seen = await allTemplates(other);
    expect(seen.some((t) => t.title === "Team invite")).toBe(true);
    expect(seen.some((t) => t.title === "My open house text")).toBe(false); // the loan officer's wasn't shared
    if (b.ok) expect(await saveTemplate(other, b.id, input("Changed", { title: "Team invite" }), NOW)).toMatchObject({ ok: false });
  });

  it("M8 answers objections within the rules, and falls back to the library", async () => {
    const call: TemplateCall = async () => ({ stop: "end_turn", json: JSON.stringify({ replies: [{ reply: "Rates are 5.5% with me, guarante" + "ed.", why: "x" }, { reply: "Let's compare the Loan Estimates side by side.", why: "It compares real costs." }] }) });
    const r = await answerWithM8("Your rate is higher than my bank's", "client", { call });
    expect(r).toMatchObject({ ok: true, by: "m8" });
    if (r.ok) expect(r.replies).toHaveLength(1); // the rate-and-promise reply was dropped
    const lib = await answerWithM8("I'm going to use my bank instead", "client", { call: null });
    expect(lib).toMatchObject({ ok: true, by: "library" });
    if (lib.ok) expect(lib.replies[0].reply).toMatch(/Loan Estimate/);
  });

  it("M8 writes a template, and a draft that breaks the rules isn't offered", async () => {
    const good: TemplateCall = async () => ({ stop: "end_turn", json: JSON.stringify({ title: "Open house invite", subject: "", body: "Hi {first}, I'm co-hosting an open house at {address} on {date}. Come by!" }) });
    expect(await writeWithM8({ what: "invite past clients to an open house", kind: "open_house", channel: "text" }, { call: good })).toMatchObject({ ok: true, by: "m8", title: "Open house invite" });
    const bad: TemplateCall = async () => ({ stop: "end_turn", json: JSON.stringify({ title: "x", subject: "", body: "Rates at 5.5%, act fast {first}" }) });
    expect(await writeWithM8({ what: "invite past clients to an open house", kind: "open_house", channel: "text" }, { call: bad })).toMatchObject({ ok: true, by: "library" });
  });
});
