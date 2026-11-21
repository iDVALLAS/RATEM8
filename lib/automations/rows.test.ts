import { describe, expect, it } from "vitest";
import { RECIPES, recipeById } from "./recipes";
import { groupCount, readRows, rowMode, whenOf } from "./rows";

describe("Automations rows (D76)", () => {
  it("says when each one runs", () => {
    expect(whenOf(recipeById("borrower_clear_to_close")!)).toBe("When the loan reaches “Clear to close”");
    expect(whenOf(recipeById("post_close_30")!)).toBe("30 days after closing");
    expect(whenOf(recipeById("post_close_180")!)).toBe("6 months after closing");
    expect(whenOf(recipeById("new_contact_permission")!)).toBe("When someone new is added");
  });

  it("shows Off for a recipe that's off, the LOA's shared setting for borrower and agent updates, else LO-Auth", () => {
    const b = recipeById("borrower_closed")!;
    const p = recipeById("post_close_30")!;
    expect(rowMode(b, [], { client_updates: "auto" })).toBe("off");
    expect(rowMode(b, [b.id], { client_updates: "auto" })).toBe("auto");
    expect(rowMode(b, [b.id], { client_updates: "approve" })).toBe("approve");
    expect(rowMode(p, [p.id], { client_updates: "auto" })).toBe("approve");
  });

  it("reads the form: which are on, and one shared setting per group (the strongest chosen)", () => {
    const vals: Record<string, string> = { borrower_closed: "approve", borrower_clear_to_close: "auto", agent_closed: "approve", post_close_30: "approve", post_close_180: "off" };
    const r = readRows((id) => vals[id] ?? null);
    expect(r.enabled.sort()).toEqual(["agent_closed", "borrower_clear_to_close", "borrower_closed", "post_close_30"]);
    expect(r.shared).toEqual({ client_updates: "auto", agent_updates: "approve" });
    // Full-auto on a row that can't send on its own is only "on" (a draft).
    expect(readRows((id) => (id === "post_close_30" ? "auto" : "off"))).toEqual({ enabled: ["post_close_30"], shared: {} });
    // The old checkbox value still reads as on.
    expect(readRows((id) => (id === "post_close_30" ? "on" : null)).enabled).toEqual(["post_close_30"]);
  });

  it("counts each section", () => {
    const all = RECIPES.filter((r) => r.group === "borrower_updates").length;
    expect(groupCount("borrower_updates", ["borrower_closed", "post_close_30"])).toEqual({ on: 1, all });
  });
});

describe("Recently fired in words (D76)", () => {
  it("names LOA jobs and outcomes without codes", async () => {
    const { firedLabel, firedOutcome } = await import("./rows");
    expect(firedLabel("borrower_closed")).toBe("Borrower: closed or funded");
    expect(firedLabel("loa.open_escrow")).toMatch(/^Your LOA: /);
    expect(firedLabel("loa.open_escrow")).not.toMatch(/open_escrow/);
    expect(firedLabel("mystery")).toBe("An automation");
    expect(firedOutcome("drafted")).toBe("draft on your desk");
    expect(firedOutcome("loa-off")).toBe("skipped: switched off");
  });
});
