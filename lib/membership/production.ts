/**
 * lib/membership/production.ts — the production share for loan officers
 * who bring in other loan officers (D40). SERVER-ONLY.
 *
 * The owner asked for a NEXA-style split: a loan officer earns a share of
 * the production of the loan officers they recruit (including agents they
 * helped get licensed).
 *  - The share is basis points of each recruit's CLOSED loan amounts
 *    (MEMBERSHIP.productionBps, 10 bps at level 1 by default). Nothing else
 *    about a loan is read: never the rate, points, product or any other
 *    term (Reg Z loan originator pay rules, 12 CFR 1026.36(d), allow pay
 *    based on loan amount, not on terms).
 *  - Levels follow "brought in by" on Membership: level 1 is the people you
 *    brought in, level 2 the people they brought in, and so on, only as far
 *    as productionBps has numbers.
 *  - Only loans the recruit closed after they joined, and only while the
 *    recruiter is an active member.
 *  - LoanM8 never pays it. This is a statement the sponsoring brokerage
 *    pays from, through its payroll under its written compensation plan.
 *  - Off until PRODUCTION_OVERRIDE="true", set only after counsel and the
 *    sponsor approve; until then it's shown as tracked, not owed.
 */
import { MEMBERSHIP } from "@/lib/config";
import { accountStore, type User } from "@/lib/accounts/store";
import { pipelineStore, type Loan } from "@/lib/pipeline/store";
import { membershipStore, type Member } from "./store";

export const productionOn = () => process.env.PRODUCTION_OVERRIDE?.trim() === "true";

/** The month a closed loan counts in: its closing date, else when it reached the closed stage. */
export const closedMonth = (l: Loan) => (l.keyDates.closing ?? l.milestoneAt).slice(0, 7);

export type ShareLine = { recruiterUserId: string; recruitUserId: string; level: number; bps: number; loans: number; volume: number; cents: number };

/** Everyone a member brought in, level by level, as far as there are rates. */
function downline(members: Member[], rootId: string): { userId: string; level: number }[] {
  const out: { userId: string; level: number }[] = [];
  let frontier = [rootId];
  const seen = new Set([rootId]);
  for (let level = 1; level <= MEMBERSHIP.productionBps.length && frontier.length; level++) {
    const next = members.filter((m) => m.recruitedBy && frontier.includes(m.recruitedBy) && !seen.has(m.userId)).map((m) => m.userId);
    for (const id of next) {
      seen.add(id);
      out.push({ userId: id, level });
    }
    frontier = next;
  }
  return out;
}

/** One recruiter's share for a month. */
export async function shareFor(recruiterUserId: string, month: string): Promise<ShareLine[]> {
  const members = await membershipStore().members();
  const me = members.find((m) => m.userId === recruiterUserId);
  const meUser = await accountStore().userById(recruiterUserId);
  if (!me || !meUser || meUser.status !== "active") return [];
  const lines: ShareLine[] = [];
  for (const d of downline(members, recruiterUserId)) {
    const recruit = members.find((m) => m.userId === d.userId)!;
    const loans = (await pipelineStore().list(d.userId)).filter((l) => l.ownerUserId === d.userId && l.closed && !l.dead && (l.amount ?? 0) > 0 && closedMonth(l) === month && closedMonth(l) >= recruit.joinedOn.slice(0, 7));
    if (!loans.length) continue;
    const bps = MEMBERSHIP.productionBps[d.level - 1];
    const volume = loans.reduce((n, l) => n + (l.amount ?? 0), 0);
    lines.push({ recruiterUserId, recruitUserId: d.userId, level: d.level, bps, loans: loans.length, volume, cents: Math.round(volume * 100 * (bps / 10_000)) });
  }
  return lines;
}

/** The owner's statement for the sponsor: every recruiter's share for the month. */
export async function sponsorStatement(viewer: User, month: string): Promise<{ lines: ShareLine[]; totalCents: number } | null> {
  if (!(viewer.status === "active" && (viewer.role === "owner" || viewer.role === "team_lead"))) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { lines: [], totalCents: 0 };
  const members = await membershipStore().members();
  const lines = (await Promise.all(members.map((m) => shareFor(m.userId, month)))).flat();
  return { lines, totalCents: lines.reduce((n, l) => n + l.cents, 0) };
}

export async function statementCsv(viewer: User, month: string): Promise<string | null> {
  const s = await sponsorStatement(viewer, month);
  if (!s) return null;
  const users = await accountStore().listUsers();
  const name = (id: string) => (users.find((u) => u.id === id)?.name ?? id).replace(/^[=+\-@]/, "'$&").replace(/"/g, '""');
  const rows = [`Month,Recruiter,Recruit,Level,Basis points,Closed loans,Closed volume,Share,Status`];
  for (const l of s.lines) rows.push(`${month},"${name(l.recruiterUserId)}","${name(l.recruitUserId)}",${l.level},${l.bps},${l.loans},${l.volume.toFixed(2)},${(l.cents / 100).toFixed(2)},${productionOn() ? "approved plan" : "tracked only; not approved"}`);
  return rows.join("\n") + "\n";
}
