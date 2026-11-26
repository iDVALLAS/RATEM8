/**
 * lib/content/import-check.ts — D75: "Check do-not-call and phone type for
 * these N people", from an import's done screen (the D29 checks, limited to
 * one import's people). Internal Command Center copy, behind sign-in.
 */
const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

export const importCheckCopy = {
  title: (n: number) => `Checks for the ${people(n)} with a phone from your import`,
  lead: (files: string) => `Only people from ${files}.`,
  whole: "See your whole book instead",
  lineTitle: "Phone type (mobile, landline or internet line)",
  lineNote: (n: number, total: string, each: string, batch: number) =>
    `${people(n)} need a check. Each is one Twilio Lookup, about ${each} at Twilio's list price, so about ${total} for all of them. Up to ${batch} are checked per tap.`,
  lineButton: (n: number, cost: string) => `Check ${n.toLocaleString("en-US")} ${n === 1 ? "number" : "numbers"} (about ${cost})`,
  linesDone: "Every number from this import has a recent phone-type check.",
  lineDone: (r: { checked: number; failed: number; left: number }) =>
    [`Phone type checked for ${people(r.checked)}.`, r.failed ? `${r.failed.toLocaleString("en-US")} couldn't be checked.` : "", r.left ? `${r.left.toLocaleString("en-US")} left: tap again for the next batch.` : ""].filter(Boolean).join(" "),
  noTwilio: "Phone-type checks aren't turned on yet. Your owner turns them on with texting.",
  setUp: "Set up texting",
  dncTitle: "Do-not-call checks for these people",
  /** D78: the same checks for people picked on Contacts, or a list. */
  listTitle: (n: number) => `Checks for the ${people(n)} with a phone you picked`,
  listLead: "Only the people you picked on Contacts.",
  listDone: "Every number you picked has a recent phone-type check.",
  /** D93: Record permission, limited to an import's people or the ones picked on Contacts. */
  recordFromImport: "from this import ",
  recordFromPicked: "you picked ",
  notPastClient: (n: number) => `${people(n)} left out: not past clients. Record theirs one at a time on each contact's Permission tab, with where their permission came from.`,
} as const;
