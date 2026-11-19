import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendWeekly, weeklyFor, weeklyText } from "./weekly";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { saveSettings } from "@/lib/concierge/desk";

const MONDAY = new Date("2026-11-23T16:00:00Z"); // Monday 8 AM Pacific
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const touch = (over: Record<string, unknown>) => ({ id: Math.random().toString(36), contactId: "c1", ownerUserId: "lo1", channel: "text", purpose: "service", direction: "out", body: "Hi", status: "sent", providerId: null, note: null, at: "2026-11-20T18:00:00Z", actor: "x", ...over }) as never;

describe("Weekly report (D27)", () => {
  let touches: MemoryTouchStore;
  beforeEach(() => {
    touches = new MemoryTouchStore();
    setTouchStoreForTests(touches);
    setConciergeStoreForTests(new MemoryConciergeStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setContactStoreForTests(new MemoryContactStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
  });
  afterEach(() => {
    for (const f of [setTouchStoreForTests, setConciergeStoreForTests, setAutomationStoreForTests, setContactStoreForTests, setAccountStoreForTests, setPipelineStoreForTests]) f(null);
  });

  it("counts the last 7 days against the 7 before, for this loan officer only", async () => {
    await touches.add(touch({}));
    await touches.add(touch({ status: "failed" }));
    await touches.add(touch({ direction: "in", status: "received" }));
    await touches.add(touch({ direction: "in", status: "received", note: "Opt-out recorded: texts and calls are off for this number." }));
    await touches.add(touch({ channel: "call", body: "Call: Talked", status: "logged" }));
    await touches.add(touch({ channel: "call", body: "Call: No answer", status: "logged" }));
    await touches.add(touch({ at: "2026-11-12T18:00:00Z" }));
    await touches.add(touch({ ownerUserId: "lo2" }));
    const w = await weeklyFor(me, MONDAY);
    expect(w.week).toMatchObject({ textsSent: 1, replies: 1, optOuts: 1, callsLogged: 2, callsTalked: 1 });
    expect(w.before.textsSent).toBe(1);
    expect(weeklyText(me, w)).toMatch(/- Texts sent: 1 \(week before: 1\)/);
  });

  it("emails Monday mornings only, once, and only when turned on", async () => {
    const send = vi.fn(async () => true);
    expect(await sendWeekly(me, MONDAY, send)).toBe("skipped");
    await saveSettings(me, { weekly: true }, MONDAY);
    expect(await sendWeekly(me, new Date("2026-11-24T16:00:00Z"), send)).toBe("skipped"); // Tuesday
    expect(await sendWeekly(me, MONDAY, send)).toBe("sent");
    expect(await sendWeekly(me, MONDAY, send)).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
