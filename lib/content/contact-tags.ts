/**
 * lib/content/contact-tags.ts — strings for tags (D73): at import, on a
 * contact, in the Contacts list, the Tags panel and the bulk bar.
 * Internal Command Center copy, behind sign-in.
 */
const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

export const contactTagsCopy = {
  // Import
  importTitle: "Tags for everyone in this import",
  importNote: "Find these people later in one tap. The date tag is added for you; remove it if you don't want it. Up to 5.",
  listLabel: "Tags for this list only",
  fileColumn: "Your file's own tags column is kept too.",
  addTag: "Add a tag",
  add: "Add",
  yourTags: "Your tags",
  remove: (t: string) => `Remove tag ${t}`,
  max: (n: number) => `That's the most (${n}).`,
  seeImport: "See the people from this import",
  tagImport: "Add tags to these people",
  previewTags: "Tags",
  // A contact
  saved: "Tags saved.",
  saving: "Saving…",
  noTags: "No tags yet.",
  // The list
  tagsHeading: "Tags",
  tagRow: "Tags",
  all: "Everyone",
  tagged: (t: string, n: number) => `Tagged “${t}”: ${people(n)}`,
  clear: "Clear",
  more: (n: number) => `+${n}`,
  // The Tags panel
  panelNote: "Tags in your own book. Tap one to see who has it.",
  panelNoteTeam: "Tags in your own book (the list above shows the team's). Tap one to see who has it.",
  change: "Change",
  rename: "Rename tag",
  renameTo: "New name",
  mergeInto: "Merge into…",
  mergePick: "Pick a tag",
  merge: "Merge",
  delete: "Delete tag",
  deleteConfirm: (t: string) => `Type ${t} to delete it from everyone. The people stay.`,
  confirmLabel: "Type the tag to confirm",
  renamed: (n: number) => `Renamed for ${people(n)}.`,
  merged: (n: number) => `Merged for ${people(n)}.`,
  deleted: (n: number) => `Deleted from ${people(n)}. The people are still here.`,
  confirmMismatch: "Type the tag exactly as shown to delete it.",
  pickMerge: "Pick the tag to merge into.",
  // The bulk bar
  selectRow: (name: string) => `Select ${name}`,
  selectPage: "Select everyone on this page",
  selected: (n: number) => `${n.toLocaleString("en-US")} selected`,
  selectAll: (n: number) => `Select all ${n.toLocaleString("en-US")} matching`,
  allSelected: (n: number) => `All ${n.toLocaleString("en-US")} matching are selected`,
  bulkTag: "Tag",
  bulkAdd: "Add tag",
  bulkRemove: "Remove tag",
  bulkClear: "Clear",
  bulkWorking: "Working…",
  added: (t: string, n: number, skipped: number, max: number) => `Added “${t}” to ${people(n)}.${skipped ? ` ${people(skipped)} already had ${max} tags and were left as they were.` : ""}`,
  removed: (t: string, n: number) => `Removed “${t}” from ${people(n)}.`,
  // Errors
  noContact: "No such contact.",
  noBook: "You aren't assigned to a loan officer yet, so there are no tags to change. Ask the owner to assign you on the Team page.",
  typeTag: "Type a tag first.",
  pickPeople: "Pick at least one person.",
  tooMany: (n: number) => `A person can have up to ${n} tags.`,
  tooManyPicked: (n: number) => `Pick up to ${n} people at a time, or use Select all matching.`,
  notYours: "Some of those people aren't in your book, so nothing was changed.",
  failed: "That didn't save. Try again.",
} as const;
