import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { resetMemoryCounters } from "@/lib/m8/kv";
import { newMemoryReportStore, setReportStoreForTests } from "./store";
import { cleanPath, firstDay, liveStatus, maskReport, pilotOverview, refOf, REPORTS_PER_HOUR, reportsFor, setFirstDayHidden, submitReport, triageReport, type Mail } from "./service";

const NOW = new Date("2026-11-19T18:00:00Z");
const owner: User = { id: "u_owner", email: "owner@example.com", name: "Pat Owner", role: "owner", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const lo: User = { id: "u_lo", email: "lo@example.com", name: "Lee Officer", role: "lo", mloId: "mlo-002", status: "active", createdAt: "", createdBy: "" };
const other: User = { id: "u_other", email: "other@example.com", name: "Oli Other", role: "lo", mloId: "mlo-002", status: "active", createdAt: "", createdBy: "" };
const lead: User = { id: "u_lead", email: "lead@example.com", name: "Tay Lead", role: "team_lead", mloId: null, status: "active", createdAt: "", createdBy: "" };

let mail: Mail[];
const send = async (m: Mail) => {
  mail.push(m);
  return true;
};
let accounts: MemoryAccountStore;
const saved = { ...process.env };

beforeEach(async () => {
  accounts = new MemoryAccountStore();
  setAccountStoreForTests(accounts);
  setReportStoreForTests(newMemoryReportStore());
  resetMemoryCounters();
  mail = [];
  process.env.MLO_OWNER_EMAIL = "Owner@Example.com";
  for (const u of [owner, lo, other, lead]) await accounts.putUser(u);
});
afterEach(() => {
  process.env = { ...saved };
  setAccountStoreForTests(null);
  setReportStoreForTests(null);
});

describe("Report a problem (D44)", () => {
  it("keeps only a Command Center path, never the query", () => {
    expect(cleanPath("/mlo/contacts/c_123?f=abc#x")).toBe("/mlo/contacts/c_123");
    expect(cleanPath("/sign-in/code")).toBe("/sign-in/code");
    expect(cleanPath("https://evil.example/mlo")).toBe("/mlo");
    expect(cleanPath("/admin")).toBe("/mlo");
    expect(cleanPath(undefined)).toBe("/mlo");
  });

  it("masks phone numbers, other people's emails, SSNs and account numbers, but keeps the reporter's email", () => {
    const m = maskReport("Bo at (206) 555-0142 and bo@client.com, SSN 123-45-6789, acct 4111 1111 1111 1111. Reach me at lo@example.com", "LO@example.com");
    expect(m.masked).toBe(true);
    expect(m.text).not.toMatch(/555-0142|bo@client\.com|123-45-6789|4111/);
    expect(m.text).toContain("[phone]");
    expect(m.text).toContain("[email]");
    expect(m.text).toContain("lo@example.com");
    expect(maskReport("The Approve button does nothing on $640,000 loans", "lo@example.com")).toEqual({ text: "The Approve button does nothing on $640,000 loans", masked: false });
  });

  it("stores the report and emails the owner with Reply-To set to the loan officer", async () => {
    const r = await submitReport(lo, { kind: "broken", message: "Approve does nothing. Call me at 206-555-0142", path: "/mlo/concierge?f=x", width: "1280", theme: "paper" }, NOW, send);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ref).toMatch(/^R-[0-9A-F]{6}$/);
    expect(r.masked).toBe(true);
    expect(r.emailed).toBe(true);
    expect(mail).toHaveLength(1);
    expect(mail[0].to).toBe("owner@example.com");
    expect(mail[0].replyTo).toBe("lo@example.com");
    expect(mail[0].subject).toContain(r.ref);
    expect(mail[0].subject).toContain("/mlo/concierge");
    expect(mail[0].text).not.toContain("555-0142");
    expect(mail[0].text).toContain("1280px wide, paper theme");
    const [saved] = await reportsFor(lo);
    expect(saved.path).toBe("/mlo/concierge");
    expect(saved.status).toBe("open");
    expect(refOf(saved.id)).toBe(r.ref);
  });

  it("refuses empty, unknown-kind, too-long and too-frequent reports", async () => {
    expect((await submitReport(lo, { kind: "broken", message: "hi", path: "/mlo" }, NOW, send)).ok).toBe(false);
    expect((await submitReport(lo, { kind: "rant", message: "Something odd happened", path: "/mlo" }, NOW, send)).ok).toBe(false);
    expect((await submitReport(lo, { kind: "idea", message: "x".repeat(2001), path: "/mlo" }, NOW, send)).ok).toBe(false);
    expect((await submitReport({ ...lo, status: "disabled" }, { kind: "idea", message: "Something odd happened", path: "/mlo" }, NOW, send)).ok).toBe(false);
    for (let i = 0; i < REPORTS_PER_HOUR; i++) expect((await submitReport(lo, { kind: "idea", message: `Idea number ${i}`, path: "/mlo" }, NOW, send)).ok).toBe(true);
    const over = await submitReport(lo, { kind: "idea", message: "One more idea", path: "/mlo" }, NOW, send);
    expect(over.ok).toBe(false);
  });

  it("still keeps the report when no owner address is set", async () => {
    delete process.env.MLO_OWNER_EMAIL;
    delete process.env.M8_ALERT_EMAIL;
    delete process.env.MLO_NOTIFICATION_EMAIL;
    const r = await submitReport(lo, { kind: "confusing", message: "Where is the import button?", path: "/mlo" }, NOW, send);
    expect(r.ok && r.emailed).toBe(false);
    expect(await reportsFor(lo)).toHaveLength(1);
    expect(mail).toHaveLength(0);
  });
});

describe("Triage (D44)", () => {
  it("lets the owner set a status and note, and emails the reporter", async () => {
    await submitReport(lo, { kind: "broken", message: "Approve does nothing", path: "/mlo/concierge" }, NOW, send);
    const [r] = await reportsFor(owner);
    mail = [];
    const t = await triageReport(owner, r.id, "fixed", "Fixed this morning, try again.", NOW, send);
    expect(t).toEqual({ ok: true, emailed: true });
    expect(mail[0].to).toBe("lo@example.com");
    expect(mail[0].replyTo).toBe("owner@example.com");
    expect(mail[0].text).toContain("Fixed this morning");
    const [after] = await reportsFor(lo);
    expect(after.status).toBe("fixed");
    expect(after.note).toBe("Fixed this morning, try again.");
    expect((await accounts.recentAudit(5)).some((e) => e.action === "report.triage")).toBe(true);
  });

  it("keeps loan officers to their own reports, and out of triage", async () => {
    await submitReport(lo, { kind: "broken", message: "Approve does nothing", path: "/mlo" }, NOW, send);
    await submitReport(other, { kind: "idea", message: "A dark mode toggle", path: "/mlo" }, NOW, send);
    expect((await reportsFor(lo)).map((r) => r.userId)).toEqual(["u_lo"]);
    expect(await reportsFor(owner)).toHaveLength(2);
    const [mine] = await reportsFor(other);
    expect((await triageReport(lo, mine.id, "fixed", "", NOW, send)).ok).toBe(false);
  });

  it("keeps a team lead to reports from their own company", async () => {
    await submitReport(lo, { kind: "broken", message: "Approve does nothing", path: "/mlo" }, NOW, send);
    expect(await reportsFor(lead)).toHaveLength(0);
    const [r] = await reportsFor(owner);
    expect((await triageReport(lead, r.id, "seen", "", NOW, send)).ok).toBe(false);
  });

  it("refuses an unknown status and sends nothing when nothing changed", async () => {
    await submitReport(lo, { kind: "broken", message: "Approve does nothing", path: "/mlo" }, NOW, send);
    const [r] = await reportsFor(owner);
    mail = [];
    expect((await triageReport(owner, r.id, "closed", "", NOW, send)).ok).toBe(false);
    expect(await triageReport(owner, r.id, "open", "", NOW, send)).toEqual({ ok: true, emailed: false });
    expect(mail).toHaveLength(0);
  });
});

describe("Your first day and the pilot overview (D44)", () => {
  it("has six steps checked against the real state, and the report step ticks after a report", async () => {
    const before = await firstDay(lo);
    expect(before.steps.map((s) => s.id)).toEqual(["mfa", "details", "contacts", "permission", "concierge", "report"]);
    expect(before.steps.find((s) => s.id === "report")!.done).toBe(false);
    await submitReport(lo, { kind: "idea", message: "Day one went fine", path: "/mlo" }, NOW, send);
    const after = await firstDay(lo);
    expect(after.steps.find((s) => s.id === "report")!.done).toBe(true);
    expect(after.done).toBe(before.done + 1);
  });

  it("can be hidden from Home and shown again", async () => {
    expect((await firstDay(lo)).hidden).toBe(false);
    await setFirstDayHidden(lo, true);
    expect((await firstDay(lo)).hidden).toBe(true);
    await setFirstDayHidden(lo, false);
    expect((await firstDay(lo)).hidden).toBe(false);
  });

  it("shows the owner each person's last sign-in and open reports; loan officers get nothing", async () => {
    await accounts.audit({ at: "2026-11-18T16:00:00.000Z", actor: "lo@example.com", action: "signin.ok", detail: {} });
    await accounts.audit({ at: "2026-11-19T16:00:00.000Z", actor: "lo@example.com", action: "signin.ok", detail: {} });
    await submitReport(lo, { kind: "broken", message: "Approve does nothing", path: "/mlo" }, NOW, send);
    const rows = await pilotOverview(owner);
    const row = rows.find((r) => r.user.id === "u_lo")!;
    expect(row.lastSignIn).toBe("2026-11-19T16:00:00.000Z");
    expect(row.open).toBe(1);
    expect(row.steps).toBe(6);
    expect(rows.find((r) => r.user.id === "u_other")!.lastSignIn).toBeNull();
    expect(await pilotOverview(lo)).toEqual([]);
  });

  it("says plainly when work isn't being saved", () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    const save = liveStatus(lo).find((x) => x.label === "Saving your work")!;
    expect(save.on).toBe(false);
    expect(save.offText).toMatch(/Don't import your real book/);
  });
});
