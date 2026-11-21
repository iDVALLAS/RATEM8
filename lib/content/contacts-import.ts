/**
 * lib/content/contacts-import.ts — strings for importing contacts
 * (D69: opt-outs in a file, plain-words batch errors, resuming).
 * Internal Command Center copy, behind sign-in.
 */
const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

export const contactsImportCopy = {
  /** Everyone whose file says stop to texts, calls and email (or "do not contact"). */
  optOutAll: (n: number) => `${people(n)} in your file asked not to be contacted. They'll be marked Do not contact and stay off texts, calls and email.`,
  /** Opted out of phone only: a stop to texts or calls stops both (and recorded calls). */
  optOutPhone: (n: number) => `${people(n)} in your file asked not to get texts or calls. They'll be marked Do not contact and stay off texts and calls; email is still allowed.`,
  /** Opted out of email only. */
  optOutEmail: (n: number) => `${people(n)} in your file asked not to get email. They'll be marked Do not contact and stay off email; texts and calls still follow your contact rules.`,
  pickSource: "Pick where these lists came from to continue.",
  resume: (n: number) => `Resume from person ${n.toLocaleString("en-US")}`,
  resumeNote: (done: number) => `The first ${people(done)} are already in. Fix the match or the file, then resume; people already imported are merged, not doubled.`,
  warnings: (w: { zip: number; date: number; tags: number }) =>
    [
      w.zip ? `${w.zip.toLocaleString("en-US")} ZIP ${w.zip === 1 ? "code wasn't" : "codes weren't"} readable and ${w.zip === 1 ? "was" : "were"} left blank.` : "",
      w.date ? `${w.date.toLocaleString("en-US")} ${w.date === 1 ? "date wasn't" : "dates weren't"} readable for sure and ${w.date === 1 ? "was" : "were"} left blank.` : "",
      w.tags ? `Long tags were shortened for ${people(w.tags)} (60 characters each, 20 at most).` : "",
    ].filter(Boolean).join(" "),
  resultOptedOut: (n: number) => `${people(n)} marked Do not contact from your file's opt-out columns.`,
  noBook: "You aren't assigned to a loan officer yet, so there's no book to import into. Ask the owner to assign you on the Team page.",
  issue: {
    generic: "Some rows didn't look right. Check the column matches and try again.",
    row: (row: number, field: string, problem: string) => `Row ${row.toLocaleString("en-US")}: ${field} ${problem}.`,
    tooLong: "is too long",
    tooMany: "has too many entries",
    format: "isn't in a format we can read",
    missing: "is missing",
    other: "doesn't look right",
    fallbackField: "A value",
  },
} as const;
