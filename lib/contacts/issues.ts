/**
 * lib/contacts/issues.ts — the first problem in an import batch, in plain
 * words (D69): "Row 12: Tags is too long." Field names only; a value from
 * the file is never echoed back. Pure.
 */
import { contactsImportCopy } from "@/lib/content/contacts-import";
import { AGENT_FIELDS, CONTACT_FIELDS } from "./mapping";

/** The parts of a validation issue this needs (zod's issue shape). */
export type IssueLike = { code: string; path: PropertyKey[]; origin?: string };

const LABELS: Record<string, string> = {
  ...AGENT_FIELDS,
  ...CONTACT_FIELDS,
  closedOn: CONTACT_FIELDS.closedOn,
  amount: CONTACT_FIELDS.loanAmount,
  noteRate: CONTACT_FIELDS.noteRate,
  optOuts: "Opt-outs",
  attestedOptIns: "Opt-ins",
  relationship: "Relationship",
};

/** "(yes/no)" and "(12 months)" make a label read badly mid-sentence. */
const bare = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, "");

export function importIssueText(issue: IssueLike | undefined, offset = 0): string {
  const c = contactsImportCopy.issue;
  if (!issue) return c.generic;
  const at = issue.path.indexOf("records");
  const idx = at >= 0 ? issue.path[at + 1] : undefined;
  if (typeof idx !== "number") return c.generic;
  // The field is the last named part of the path ("tags", or "closedOn" inside "loan").
  const names = issue.path.slice(at + 2).filter((p): p is string => typeof p === "string");
  const key = names.find((n) => n === "optOuts" || n === "attestedOptIns") ?? names[names.length - 1];
  const field = key && LABELS[key] ? bare(LABELS[key]) : c.fallbackField;
  const onArray = names.length > 0 && typeof issue.path[issue.path.length - 1] === "string" && issue.origin === "array";
  const problem =
    issue.code === "too_big" ? (onArray ? c.tooMany : c.tooLong) : issue.code === "invalid_format" ? c.format : issue.code === "invalid_type" ? c.missing : c.other;
  return c.row(offset + idx + 1, field, problem);
}
