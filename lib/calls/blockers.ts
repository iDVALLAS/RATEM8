/**
 * lib/calls/blockers.ts — why someone on today's call list can't be called
 * yet, in a word, and the one thing that fixes it (D76). Pure.
 *
 * It reads the contact rules' own reason (lib/send-gate/gate.ts) and never
 * decides anything itself: the gate still checks every call.
 */
export type BlockerKind = "dnc" | "dncListed" | "state" | "permission" | "hold" | "reassigned" | "stopped" | "cap" | "license" | "state_rule" | "other";

const RULES: [RegExp, BlockerKind][] = [
  [/^On hold:/, "hold"],
  [/said stop|unsubscribed|asked not to/i, "stopped"],
  [/Do-not-call lists haven't been checked/i, "dnc"],
  [/on a do-not-call list/i, "dncListed"],
  [/property state isn't known/i, "state"],
  [/aren't licensed in/i, "license"],
  [/Reassigned Numbers|disconnected/i, "reassigned"],
  [/^Already \d|Already texted|limit is/i, "cap"],
  [/^(Texas|Arizona|California):|Washington doesn't allow|said no to a call/i, "state_rule"],
  [/permission/i, "permission"],
];

export function blockerOf(reason: string | null | undefined): BlockerKind {
  if (!reason) return "other";
  return RULES.find(([re]) => re.test(reason))?.[1] ?? "other";
}

/** Where the fix is, for one person, or null when only time (or the person) can fix it. */
export function fixHref(kind: BlockerKind, contactId: string): string | null {
  const page = `/mlo/contacts/${encodeURIComponent(contactId)}`;
  switch (kind) {
    case "dnc":
      return "/mlo/contacts/permission#dnc";
    case "dncListed":
    case "permission":
      return `${page}#permission`;
    case "reassigned":
      return `${page}#phone-checks`;
    case "hold":
      return "/mlo/contacts";
    case "state":
      return null; // fixed in place on the call session (a state picker)
    case "other":
      return page;
    default:
      return null;
  }
}

/** The most common blocker and how many it holds back, for Home's chip. */
export function topBlocker(reasons: (string | null)[]): { kind: BlockerKind; count: number } | null {
  if (!reasons.length) return null;
  const n = new Map<BlockerKind, number>();
  for (const r of reasons) {
    const k = blockerOf(r);
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  const [kind, count] = [...n.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return { kind, count };
}
