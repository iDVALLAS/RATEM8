import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiCall, aiMeter, aiOffReason, allowanceFor, costMicros, MemoryUsageStore, monthOf, recordChatUsage, resetsOn, setUsageStoreForTests } from "./meter";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryMembershipStore, setMembershipStoreForTests } from "@/lib/membership/store";
import { setMember } from "@/lib/membership/service";

const NOW = new Date("2026-11-19T18:00:00Z");
const owner: User = { id: "own", email: "own@x.com", name: "Olive", role: "owner", mloId: null, status: "active", createdAt: "", createdBy: "" };
const lo: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-002", status: "active", createdAt: "", createdBy: "" };

describe("AI metering and plans (D41)", () => {
  let usage: MemoryUsageStore;
  const saved = { ...process.env };
  beforeEach(async () => {
    usage = new MemoryUsageStore();
    setUsageStoreForTests(usage);
    const a = new MemoryAccountStore();
    setAccountStoreForTests(a);
    await a.putUser(owner);
    await a.putUser(lo);
    setMembershipStoreForTests(new MemoryMembershipStore());
    process.env.CC_ANTHROPIC_API_KEY = "sk-test";
    delete process.env.CC_CONCIERGE_MODEL;
  });
  afterEach(() => {
    process.env = { ...saved };
    setUsageStoreForTests(null);
    setAccountStoreForTests(null);
    setMembershipStoreForTests(null);
  });

  it("prices tokens from the list prices, caching included", () => {
    // 1M input + 1M output on Opus 5.5 = $4 + $20.
    expect(costMicros("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(24_000_000);
    expect(costMicros("claude-sonnet-5-5", { input_tokens: 3000, cache_read_input_tokens: 3000, output_tokens: 1500 })).toBe(6000 + 300 + 15000);
    expect(costMicros("claude-haiku-5-5", { input_tokens: 1800, output_tokens: 800 })).toBe(180 + 400);
    expect(costMicros("claude-unknown", { output_tokens: 1000 })).toBe(20_000); // priced as the most expensive
    expect(monthOf(new Date("2026-12-01T05:00:00Z"))).toBe("2026-11"); // still Nov 30 in Pacific
    expect(resetsOn("2026-12")).toBe("2027-01-01");
  });

  it("each plan picks its model per feature; the override wins", async () => {
    expect((await aiMeter(lo, "concierge", NOW))?.model).toBe("claude-sonnet-5-5"); // no membership: Standard
    expect((await aiMeter(lo, "expenses", NOW))?.model).toBe("claude-haiku-5-5");
    await setMember(owner, lo.id, { area: "Eastside, WA", feeDollars: 149, recruitedBy: null, joinedOn: "2026-01-01", plan: "unlimited" }, NOW);
    expect((await aiMeter(lo, "concierge", NOW))?.model).toBe("claude-opus-5-5");
    expect((await aiMeter(lo, "expenses", NOW))?.model).toBe("claude-haiku-5-5");
    process.env.CC_CONCIERGE_MODEL = "claude-sonnet-5-5";
    expect((await aiMeter(lo, "concierge", NOW))?.model).toBe("claude-sonnet-5-5");
  });

  it("records usage and stops at the allowance; the feature then takes its plain path", async () => {
    const m = await aiCall(lo, "scripts", (x) => x, NOW);
    expect(m).not.toBeNull();
    // $11.90 of Sonnet output: under the $12 Standard allowance.
    await m!.record({ output_tokens: 1_190_000 });
    expect(await allowanceFor(lo.id, NOW)).toMatchObject({ plan: "capped", over: false, allowanceCents: 1200, resetsOn: "2026-12-01" });
    await m!.record({ output_tokens: 20_000 }); // +$0.20
    expect((await allowanceFor(lo.id, NOW)).over).toBe(true);
    expect(await aiCall(lo, "scripts", (x) => x, NOW)).toBeNull();
    expect(await aiOffReason(lo, NOW)).toMatch(/allowance is used \(it resets 2026-12-01\)/);
    // Next month it's back.
    expect(await aiMeter(lo, "scripts", new Date("2026-12-02T18:00:00Z"))).not.toBeNull();
    // No key: nothing runs.
    delete process.env.CC_ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await aiMeter(lo, "scripts", new Date("2026-12-02T18:00:00Z"))).toBeNull();
  });

  it("the borrower chat is recorded against the routed loan officer, and never blocks", async () => {
    await recordChatUsage("mlo-002", "claude-opus-5-5", { input_tokens: 2000, output_tokens: 600 }, NOW);
    await recordChatUsage("mlo-999", "claude-opus-5-5", { input_tokens: 2000, output_tokens: 600 }, NOW);
    const a = await allowanceFor(lo.id, NOW);
    expect(a.byRoute.chat).toBeCloseTo(2, 5); // 8,000 + 12,000 micro-dollars = 2 cents
    expect((await usage.monthAll("2026-11")).map((x) => x.userId).sort()).toEqual(["lo1", "mlo:mlo-999"]);
  });
});
