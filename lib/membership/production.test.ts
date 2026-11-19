import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shareFor, sponsorStatement, statementCsv } from "./production";
import { setMember } from "./service";
import { MemoryMembershipStore, setMembershipStoreForTests } from "./store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests, type Loan } from "@/lib/pipeline/store";

const NOW = new Date("2026-11-19T18:00:00Z");
const mk = (id: string, role: User["role"] = "lo"): User => ({ id, email: `${id}@x.com`, name: `${id.toUpperCase()} Person`, role, mloId: null, status: "active", createdAt: "2026-01-01T00:00:00Z", createdBy: "" });
const owner = mk("own", "owner");
const a = mk("a"), b = mk("b"), c = mk("c");
let n = 0;
const loan = (ownerUserId: string, amount: number, closing: string | null, extra: Partial<Loan> = {}): Loan => ({ id: `l${++n}`, ownerUserId, externalId: `X${n}`, source: "test", contactId: null, borrowerName: "B", purpose: "purchase", loanType: "conv", amount, noteRate: 6.875, milestone: closing ? "Funded" : "Processing", milestoneAt: closing ? `${closing}T12:00:00Z` : NOW.toISOString(), history: [], keyDates: { application: null, lockExpires: null, appraisal: null, clearToClose: null, closing }, agentName: null, closed: !!closing, dead: false, updatedAt: NOW.toISOString(), ...extra });

describe("Production share (D40)", () => {
  let pipe: MemoryPipelineStore;
  beforeEach(async () => {
    const accounts = new MemoryAccountStore();
    setAccountStoreForTests(accounts);
    setMembershipStoreForTests(new MemoryMembershipStore());
    pipe = new MemoryPipelineStore();
    setPipelineStoreForTests(pipe);
    for (const u of [owner, a, b, c]) await accounts.putUser(u);
    await setMember(owner, a.id, { area: "Eastside, WA", feeDollars: 300, recruitedBy: null, joinedOn: "2026-01-01" }, NOW);
    await setMember(owner, b.id, { area: "Eastside, WA", feeDollars: 300, recruitedBy: a.id, joinedOn: "2026-03-01" }, NOW);
    await setMember(owner, c.id, { area: "Eastside, WA", feeDollars: 300, recruitedBy: b.id, joinedOn: "2026-03-01" }, NOW);
    delete process.env.PRODUCTION_OVERRIDE;
  });
  afterEach(() => {
    setAccountStoreForTests(null);
    setMembershipStoreForTests(null);
    setPipelineStoreForTests(null);
  });

  it("pays 10 bps of a direct recruit's closed loan amounts in the month, one level, never on rate or open loans", async () => {
    await pipe.put(loan(b.id, 500_000, "2026-10-12"));
    await pipe.put(loan(b.id, 300_000, "2026-10-28", { noteRate: 7.5 }));
    await pipe.put(loan(b.id, 400_000, null)); // not closed
    await pipe.put(loan(b.id, 250_000, "2026-09-30")); // another month
    await pipe.put(loan(b.id, 200_000, "2026-10-05", { dead: true }));
    await pipe.put(loan(c.id, 600_000, "2026-10-15")); // level 2: no rate configured
    const lines = await shareFor(a.id, "2026-10");
    expect(lines).toEqual([{ recruiterUserId: "a", recruitUserId: "b", level: 1, bps: 10, loans: 2, volume: 800_000, cents: 80_000 }]); // $800
    // The rate doesn't matter: the same amounts at any rate give the same share.
    expect((await shareFor(b.id, "2026-10"))[0]).toMatchObject({ recruitUserId: "c", cents: 60_000 });
  });

  it("only loans after they joined, only while the recruiter is active, and only owners see the statement", async () => {
    await pipe.put(loan(b.id, 500_000, "2026-02-20")); // before B joined
    expect(await shareFor(a.id, "2026-02")).toEqual([]);
    await pipe.put(loan(b.id, 100_000, "2026-11-02"));
    expect(await sponsorStatement(a, "2026-11")).toBeNull();
    const s = await sponsorStatement(owner, "2026-11");
    expect(s?.totalCents).toBe(10_000);
    const csv = (await statementCsv(owner, "2026-11"))!;
    expect(csv).toContain("tracked only; not approved");
    process.env.PRODUCTION_OVERRIDE = "true";
    expect(await statementCsv(owner, "2026-11")).toContain("approved plan");
    const accounts = new MemoryAccountStore();
    for (const u of [owner, { ...a, status: "disabled" as const }, b, c]) await accounts.putUser(u);
    setAccountStoreForTests(accounts);
    expect(await shareFor(a.id, "2026-11")).toEqual([]);
  });
});
