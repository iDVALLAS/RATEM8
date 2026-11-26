/**
 * lib/contacts/import-steps.ts — moving between the import's four steps,
 * and where the permission dialog after an import goes (D93). Client-safe
 * and pure.
 *
 * Every answer lives in the wizard's own state (files, column choices,
 * fixes, tags, sources), so going back to an earlier step and forward again
 * never loses work. A step can be opened once it's been reached, as long as
 * what it needs still holds: files for step 2, every question answered for
 * step 3, someone to import for step 4.
 */

export type Step = 1 | 2 | 3 | 4;
export const STEPS: readonly Step[] = [1, 2, 3, 4];
export type StepGate = { files: number; reading: boolean; pending: number; records: number };
export type StepStatus = "current" | "done" | "open" | "locked";

/** Why a step can't be opened yet (or null). */
export function stepBlock(target: Step, g: StepGate): "files" | "questions" | "people" | null {
  if (target >= 2 && (!g.files || g.reading)) return "files";
  if (target >= 3 && g.pending > 0) return "questions";
  if (target >= 4 && !g.records) return "people";
  return null;
}

export function stepStatus(target: Step, step: Step, reached: Step, g: StepGate): StepStatus {
  if (target === step) return "current";
  // Back is always open: nothing earlier depends on a later step.
  if (target < step) return "done";
  return target > reached || stepBlock(target, g) ? "locked" : "open";
}

export const canGo = (target: Step, step: Step, reached: Step, g: StepGate) => {
  const s = stepStatus(target, step, reached, g);
  return s === "done" || s === "open";
};

/** The wizard's position. Everything else in its state is left exactly as it is. */
export type StepState = { step: Step; reached: Step };
export function goTo<T extends StepState>(state: T, target: Step, g: StepGate): T {
  return canGo(target, state.step, state.reached, g) ? { ...state, step: target } : state;
}
/** "Continue": the next step, reached for the first time if need be. */
export function next<T extends StepState>(state: T, g: StepGate): T {
  const target = Math.min(4, state.step + 1) as Step;
  if (target === state.step || stepBlock(target, g)) return state;
  return { ...state, step: target, reached: (Math.max(state.reached, target) as Step) };
}

/** D93: the two places the "Did these contacts agree to be contacted?" dialog leads. */
export function permissionLinks(importId: string): { record: string; oneByOne: string } {
  const id = encodeURIComponent(importId);
  return { record: `/mlo/contacts/permission?import=${id}#record`, oneByOne: `/mlo/contacts?import=${id}&perm=relationship` };
}
