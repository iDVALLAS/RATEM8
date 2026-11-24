import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryStore, setStoreForTests } from "./store";
import { publishSnapshot, saveSettings } from "./publish";
import { tenantForState } from "./tenants";
import { NO_RISKY_FEATURES, type QuoteInput } from "./types";
import { fetchPricedToday } from "@/lib/priced-today";
import { copy } from "@/lib/copy";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push() {}, refresh() {} }) }));

// D92: PRICING_MANUAL is read once when lib/config loads; the tests flip it here.
const flags = vi.hoisted(() => ({ manual: false }));
vi.mock("@/lib/config", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/config")>();
  const pricing = Object.create(Object.getPrototypeOf(orig.CONFIG.pricing), Object.getOwnPropertyDescriptors(orig.CONFIG.pricing));
  Object.defineProperty(pricing, "manual", { get: () => flags.manual, enumerable: true });
  return { ...orig, CONFIG: { ...orig.CONFIG, pricing } };
});

const { GET } = await import("@/app/api/rates/available/route");
const { Nav } = await import("@/components/Nav");

const quote = (lenderKey: string, noteRate: number, pointsPct: number): QuoteInput => ({
  lenderKey, productLabel: "30-year fixed", eligible: true, noteRate, pointsPct, originationFee: 0, lenderFees: 1195, lockDays: 30,
  interestOnlyMonths: 0, features: NO_RISKY_FEATURES,
});

async function publishToday() {
  const wa = tenantForState("WA")!;
  await saveSettings({ tenantId: wa.id, activeLenderKeys: ["uwm", "pennymac", "kind"], playbook: [], actor: "test" });
  const res = await publishSnapshot({
    tenantId: wa.id, scenarioId: "wa-daily-purchase-80", actor: "test",
    quotes: [quote("uwm", 6.125, 0.75), quote("pennymac", 6.25, 0), quote("kind", 6.375, -0.25)],
    source: { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" },
  });
  expect(res.ok).toBe(true);
}

async function read(): Promise<{ body: Record<string, unknown>; res: Response }> {
  const res = await GET();
  return { body: (await res.json()) as Record<string, unknown>, res };
}

afterEach(() => {
  flags.manual = false;
  setStoreForTests(null);
  vi.useRealTimers();
});

describe("/api/rates/available (D92)", () => {
  it("is false while PRICING_MANUAL is off, even with a fresh snapshot (the sample examples never earn the link)", async () => {
    setStoreForTests(new MemoryStore());
    await publishToday();
    flags.manual = false;
    const { body, res } = await read();
    expect(res.status).toBe(200);
    expect(body).toEqual({ available: false });
  });

  it("is false with PRICING_MANUAL on and no snapshot", async () => {
    setStoreForTests(new MemoryStore());
    flags.manual = true;
    expect((await read()).body).toEqual({ available: false });
  });

  it("is false once the only snapshot has gone stale", async () => {
    setStoreForTests(new MemoryStore());
    await publishToday();
    flags.manual = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 3600_000);
    expect((await read()).body).toEqual({ available: false });
  });

  it("is true with PRICING_MANUAL on and a fresh snapshot, and carries only the boolean", async () => {
    setStoreForTests(new MemoryStore());
    await publishToday();
    flags.manual = true;
    const { body, res } = await read();
    expect(body).toEqual({ available: true });
    expect(Object.keys(body)).toEqual(["available"]);
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/\d\.\d|uwm|pennymac|kind|lender|wa-daily/i);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("fails closed when the store throws", async () => {
    flags.manual = true;
    const broken = new MemoryStore();
    broken.latestSnapshot = async () => {
      throw new Error("down");
    };
    setStoreForTests(broken);
    expect((await read()).body).toEqual({ available: false });
  });
});

describe("the menu's check (D92)", () => {
  const ok = (body: unknown) => async () => ({ ok: true, json: async () => body });

  it("shows the link only for a 200 with available: true", async () => {
    expect(await fetchPricedToday(ok({ available: true }))).toBe(true);
    expect(await fetchPricedToday(ok({ available: false }))).toBe(false);
    expect(await fetchPricedToday(ok({ available: "true" }))).toBe(false);
    expect(await fetchPricedToday(ok(null))).toBe(false);
    expect(await fetchPricedToday(async () => ({ ok: false, json: async () => ({ available: true }) }))).toBe(false);
    expect(await fetchPricedToday(async () => { throw new Error("offline"); })).toBe(false);
    expect(await fetchPricedToday(async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }))).toBe(false);
  });

  it("server HTML has no Today's pricing link (it appears only after the check says yes)", () => {
    const html = renderToStaticMarkup(createElement(Nav));
    expect(html).not.toContain(copy.nav.todaysPricing.label.replace("'", "&#x27;"));
    expect(html).not.toContain('href="/rates"');
    expect(copy.nav.todaysPricing).toEqual({ href: "/rates", label: "Today's pricing" });
  });
});
