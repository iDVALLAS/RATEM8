import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allSince, MemoryTouchStore, NeonTouchStore, setTouchStoreForTests, TOUCH_CAP, TOUCH_PAGE_MAX, type Touch } from "@/lib/messaging/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryExpenseStore, setExpenseStoreForTests } from "@/lib/expenses/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { MemoryLeadEventStore, setLeadEventStoreForTests } from "@/lib/leads/events";
import { MemoryMonthlyStore, setMonthlyStoreForTests } from "@/lib/leads/spend";
import { buildExport } from "@/lib/export/service";
import { weeklyFor } from "@/lib/report/weekly";

/** D87.4: a book with more than one page (5,000) of messages is read whole, everywhere everything is promised. */

const NOW = new Date("2026-11-23T16:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const EPOCH = "1970-01-01T00:00:00.000Z";
const N = 12_345;

/** Touch i is i minutes before NOW; every third pair shares a timestamp so the id has to break the tie. */
const touch = (owner: string, i: number, over: Partial<Touch> = {}): Touch => ({
  id: `${owner}_t${String(i).padStart(6, "0")}`,
  contactId: `${owner}_c${i % 40}`,
  ownerUserId: owner,
  channel: "text",
  purpose: "service",
  direction: "out",
  body: `Message ${i}`,
  status: "sent",
  providerId: null,
  note: null,
  at: new Date(NOW.getTime() - 60_000 - Math.floor(i / 2) * 60_000).toISOString(),
  actor: "x",
  ...over,
});

async function fill(store: MemoryTouchStore, owner: string, n: number, over: (i: number) => Partial<Touch> = () => ({})) {
  for (let i = 0; i < n; i++) await store.add(touch(owner, i, over(i)));
}

/** Reads our own zips back (local headers). */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString("utf8");
    const body = buf.subarray(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
    out.set(name, (method === 8 ? inflateRawSync(body) : Buffer.from(body)).toString("utf8"));
    p += 30 + nameLen + extra + size;
  }
  return out;
}

const isNewestFirst = (ts: Touch[]) => ts.every((t, i) => i === 0 || ts[i - 1].at > t.at || (ts[i - 1].at === t.at && ts[i - 1].id > t.id));

describe("reading every message past 5,000 (D87.4)", () => {
  let touches: MemoryTouchStore;
  beforeEach(() => {
    touches = new MemoryTouchStore();
    setTouchStoreForTests(touches);
    setContactStoreForTests(new MemoryContactStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setExpenseStoreForTests(new MemoryExpenseStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setLeadEventStoreForTests(new MemoryLeadEventStore());
    setMonthlyStoreForTests(new MemoryMonthlyStore());
  });
  afterEach(() => {
    for (const f of [setTouchStoreForTests, setContactStoreForTests, setAccountStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setExpenseStoreForTests, setAutomationStoreForTests, setLeadEventStoreForTests, setMonthlyStoreForTests]) f(null);
  });

  it("the memory store returns at most 5,000 a call, newest first, like Neon", async () => {
    expect(TOUCH_PAGE_MAX).toBe(5000);
    await fill(touches, me.id, N);
    const one = await touches.since(me.id, EPOCH);
    expect(one).toHaveLength(TOUCH_PAGE_MAX);
    expect(one[0].id).toBe(`${me.id}_t000001`); // the newest (ties broken by id, descending)
    expect(isNewestFirst(one)).toBe(true);
    for (const limit of [5001, 50_000, 1_000_000]) {
      const p = await touches.sincePage(me.id, EPOCH, { limit });
      expect(p.touches).toHaveLength(TOUCH_PAGE_MAX);
      expect(p.next).toEqual({ at: p.touches[TOUCH_PAGE_MAX - 1].at, id: p.touches[TOUCH_PAGE_MAX - 1].id });
    }
    // The last page says so.
    const tail = await touches.sincePage(me.id, EPOCH, { after: { at: one[TOUCH_PAGE_MAX - 1].at, id: one[TOUCH_PAGE_MAX - 1].id } });
    expect(tail.touches).toHaveLength(TOUCH_PAGE_MAX);
    const end = await touches.sincePage(me.id, EPOCH, { after: tail.next });
    expect(end.touches).toHaveLength(N - 2 * TOUCH_PAGE_MAX);
    expect(end.next).toBeNull();
    expect((await touches.sincePage("nobody", EPOCH)).next).toBeNull();
  });

  it("allSince returns every one of 12,345, once each, newest first, and only from that book", async () => {
    await fill(touches, me.id, N);
    // Someone else's messages at the same moments: never read into ours.
    await fill(touches, "lo2", 300, (i) => ({ id: `lo2_t${String(i * 41).padStart(6, "0")}` }));
    const r = await allSince(me.id, EPOCH);
    expect(r.capped).toBe(false);
    expect(r.touches).toHaveLength(N);
    expect(new Set(r.touches.map((t) => t.id)).size).toBe(N);
    expect(r.touches.every((t) => t.ownerUserId === me.id)).toBe(true);
    expect(isNewestFirst(r.touches)).toBe(true);
    // Small pages (keyset, ties on `at` broken by id) neither repeat nor skip anyone.
    let after = null;
    const seen: string[] = [];
    do {
      const p: Awaited<ReturnType<MemoryTouchStore["sincePage"]>> = await touches.sincePage(me.id, EPOCH, { after, limit: 7 });
      seen.push(...p.touches.map((t) => t.id));
      after = p.next;
    } while (after);
    expect(seen).toEqual(r.touches.map((t) => t.id));
  });

  it("allSince keeps the time range on every page and says when the cap stopped it", async () => {
    await fill(touches, me.id, N);
    const ids = (await allSince(me.id, EPOCH)).touches.map((t) => t.id);
    const capped = await allSince(me.id, EPOCH, { cap: 6000 });
    expect(capped.capped).toBe(true);
    expect(capped.touches.map((t) => t.id)).toEqual(ids.slice(0, 6000));
    // Exactly the cap is everything, so not capped.
    expect((await allSince(me.id, EPOCH, { cap: N })).capped).toBe(false);
    // Never past TOUCH_CAP, whatever a caller asks.
    expect((await allSince(me.id, EPOCH, { cap: 10 * TOUCH_CAP })).touches).toHaveLength(N);
    // A window: since <= at < until.
    const since = new Date(NOW.getTime() - 4000 * 60_000).toISOString();
    const until = new Date(NOW.getTime() - 1000 * 60_000).toISOString();
    const w = await allSince(me.id, since, { until });
    expect(w.touches.length).toBe(6000);
    expect(w.touches.every((t) => t.at >= since && t.at < until)).toBe(true);
  });

  it("the Neon store pages with bound parameters only, by (at, id), with a microsecond cursor", async () => {
    const calls: { text: string; params: unknown[] }[] = [];
    const hostile = "lo1'; DROP TABLE cc_touches; --";
    const row = (i: number) => ({ ...Object.fromEntries(Object.entries(touch(hostile, i)).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v])), at_key: `2026-11-23T15:59:00.${String(i).padStart(6, "0")}Z` });
    const store = new NeonTouchStore(async (text, params) => {
      calls.push({ text, params: params ?? [] });
      return text.startsWith("SELECT *, to_char") ? [row(1), row(2)] : [];
    });
    const p = await store.sincePage(hostile, "1970-01-01'--", { until: "2026-11-23T00:00:00.000Z", after: { at: "2026-11-23T15:59:00.123456Z", id: "x' OR '1'='1" }, limit: 2 });
    const q = calls.find((c) => c.text.startsWith("SELECT *, to_char"))!;
    expect(q.text).toContain("WHERE owner_user_id = $1 AND at >= $2::timestamptz AND at < $3::timestamptz AND (at, id) < ($4::timestamptz, $5::text) ORDER BY at DESC, id DESC LIMIT $6");
    expect(q.params).toEqual([hostile, "1970-01-01'--", "2026-11-23T00:00:00.000Z", "2026-11-23T15:59:00.123456Z", "x' OR '1'='1", 2]);
    for (const v of [hostile, "x' OR", "1970-01-01'--"]) expect(q.text).not.toContain(v);
    expect(p.touches).toHaveLength(2);
    // The cursor carries the stored microseconds, not the millisecond `at` a touch is given.
    expect(p.next).toEqual({ at: "2026-11-23T15:59:00.000002Z", id: `${hostile}_t000002` });
    // A limit is clamped, and `since()` is one capped page too.
    await store.sincePage("lo1", EPOCH, { limit: 1_000_000 });
    expect(calls[calls.length - 1].params).toEqual(["lo1", EPOCH, TOUCH_PAGE_MAX]);
    await store.since("lo1", EPOCH);
    expect(calls[calls.length - 1].text).toContain("LIMIT $3");
    expect(calls[calls.length - 1].params).toEqual(["lo1", EPOCH, TOUCH_PAGE_MAX]);
  });

  it("Download everything holds all 12,345 messages, and says so in the README only when the cap is reached", async () => {
    await fill(touches, me.id, N);
    await fill(touches, "lo2", 50, (i) => ({ id: `lo2_t${i}`, body: "Not yours" }));
    const r = await buildExport(me, NOW);
    expect(r.counts.messages).toBe(N);
    const files = unzip(r.file);
    expect(files.get("messages.csv")).toContain("Message 12344");
    expect(files.get("messages.csv")).not.toContain("Not yours");
    expect(files.get("README.txt")).toContain(`messages: ${N}`);
    expect(files.get("README.txt")).not.toContain("Older ones are not in this download");
  });

  it("Download everything's README says when messages.csv stopped at the cap", async () => {
    await fill(touches, me.id, TOUCH_CAP + 1, () => ({ body: "x" }));
    const r = await buildExport(me, NOW);
    expect(r.counts.messages).toBe(TOUCH_CAP);
    expect(unzip(r.file).get("README.txt")).toContain(`messages.csv holds your newest ${TOUCH_CAP.toLocaleString("en-US")} messages. Older ones are not in this download.`);
  }, 60_000);

  it("the weekly report counts every text in a week with more than 5,000", async () => {
    // 6,000 texts this week (one a minute back from Monday), 5,500 the week before.
    for (let i = 0; i < 6000; i++) await touches.add(touch(me.id, i, { id: `w${i}`, at: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString() }));
    for (let i = 0; i < 5500; i++) await touches.add(touch(me.id, i, { id: `b${i}`, at: new Date(NOW.getTime() - 7 * 86_400_000 - (i + 1) * 60_000).toISOString() }));
    const w = await weeklyFor(me, NOW);
    expect(w.week.textsSent).toBe(6000);
    expect(w.before.textsSent).toBe(5500);
  });
});
