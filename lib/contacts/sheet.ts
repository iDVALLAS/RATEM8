/**
 * lib/contacts/sheet.ts — the bulk bar's "Download a spreadsheet (CSV)" (D78).
 * Pure. Formula-safe like the D53.1 export (lib/export/csv.ts): a cell that
 * starts like a formula is written as text, so a spreadsheet never runs it.
 *
 * Only what a loan officer needs to work a list: names, phones, email,
 * address, relationship, tags and how they can be reached. No permission
 * proof, notes, messages or loan numbers.
 */
import { toCsv } from "@/lib/export/csv";
import { RELATIONSHIP_LABELS } from "./mapping";
import { reachBadge } from "./reach";
import type { ConsentSummary } from "./service";
import type { Contact } from "./store";

export const SHEET_COLUMNS = ["First name", "Last name", "Phone", "Other phone", "Email", "Street", "City", "State", "ZIP", "Relationship", "Brokerage", "Tags", "Can reach", "Added"] as const;

export function contactsCsv(rows: { contact: Contact; summary: ConsentSummary }[]): string {
  return toCsv(
    rows.map(({ contact: c, summary }) => ({
      "First name": c.firstName,
      "Last name": c.lastName,
      Phone: c.phone ?? "",
      "Other phone": c.phone2 ?? "",
      Email: c.email ?? "",
      Street: c.street ?? "",
      City: c.city ?? "",
      State: c.state ?? "",
      ZIP: c.zip ?? "",
      Relationship: RELATIONSHIP_LABELS[c.relationship] ?? c.relationship,
      Brokerage: c.agent?.brokerage ?? "",
      Tags: (c.tags ?? []).join("; "),
      "Can reach": reachBadge({ summary, hasPhone: !!c.phone, hasEmail: !!c.email, locked: c.locked }).label,
      Added: c.createdAt.slice(0, 10),
    })),
    { first: [...SHEET_COLUMNS] },
  );
}
