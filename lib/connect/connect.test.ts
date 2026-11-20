import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { readPayload } from "@/lib/pipeline/intake";
import { SYSTEMS, systemByKey } from "./catalog";
import { connectionStore, fieldValue, newMemoryConnectionStore, saveConnection, setConnectionStoreForTests, testConnection } from "./service";

const NOW = new Date("2026-11-20T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };

describe("Connections (D63)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.CC_LINK_SECRET = "test-secret";
    setAccountStoreForTests(new MemoryAccountStore());
    setConnectionStoreForTests(newMemoryConnectionStore());
  });
  afterEach(() => {
    process.env = { ...saved };
    setAccountStoreForTests(null);
    setConnectionStoreForTests(null);
  });

  it("lists every system with a route that works today", () => {
    expect(SYSTEMS.map((s) => s.key)).toEqual(expect.arrayContaining(["arive", "lendingpad", "encompass", "shape", "bonzo", "totalexpert", "jungo", "floify"]));
    expect(systemByKey("arive")?.routes).toEqual(["zapier"]);
    for (const s of SYSTEMS) expect(s.steps.length).toBeGreaterThan(0);
  });

  it("keeps secrets sealed, and a blank secret keeps the saved one", async () => {
    expect(await saveConnection(me, "arive", { x: "1" }, NOW)).toMatchObject({ ok: false });
    expect(await saveConnection(me, "lendingpad", { apiKey: "lp-secret-key", companyId: "ACME" }, NOW)).toEqual({ ok: true });
    let c = (await connectionStore().get("lo1", "lendingpad"))!;
    expect(JSON.stringify(c)).not.toContain("lp-secret-key");
    expect(fieldValue(c, "apiKey")).toBe("lp-secret-key");
    await saveConnection(me, "lendingpad", { apiKey: "", companyId: "ACME2" }, NOW);
    c = (await connectionStore().get("lo1", "lendingpad"))!;
    expect(fieldValue(c, "apiKey")).toBe("lp-secret-key");
    expect(c.fields.companyId).toBe("ACME2");
  });

  it("tests an Encompass sign-in with the saved credentials", async () => {
    await saveConnection(me, "encompass", { instanceId: "BE11223344", user: "apiuser", password: "pw", clientId: "cid", clientSecret: "cs" }, NOW);
    let body = "";
    const ok = (async (_u: RequestInfo | URL, init?: RequestInit) => ((body = String(init?.body)), new Response(JSON.stringify({ access_token: "t" }), { status: 200 }))) as typeof fetch;
    expect(await testConnection(me, "encompass", NOW, ok)).toMatchObject({ ok: true });
    expect(new URLSearchParams(body).get("username")).toBe("apiuser@encompass:BE11223344");
    expect((await connectionStore().get("lo1", "encompass"))?.status).toBe("tested");
    const no = (async () => new Response(JSON.stringify({ error_description: "invalid credentials" }), { status: 400 })) as typeof fetch;
    expect(await testConnection(me, "encompass", NOW, no)).toMatchObject({ ok: false, error: expect.stringMatching(/invalid credentials/) });
  });

  it("reads Encompass-style pipeline field names on the loan address", () => {
    const u = readPayload({ "Loan.LoanNumber": "E-77", "Loan.BorrowerFirstName": "Ann", "Loan.BorrowerLastName": "Lee", "Loan.CurrentMilestoneName": "Processing", "Loan.LoanAmount": "400000" });
    expect(u).toMatchObject({ externalId: "E-77", borrowerName: "Ann Lee", milestone: "Processing", amount: 400000 });
  });
});
