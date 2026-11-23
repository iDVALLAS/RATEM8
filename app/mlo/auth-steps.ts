/**
 * D91: the LOA tile's progress on the sign-in and sign-up pitch (D64). Steps before NOW_STEP are done;
 * the step labels under the bar get a class each: the current one is "now", and the ones between the
 * first, the current and the last are "mid", which a narrow tile hides so the rest never run together.
 */
export const NOW_STEP = 3;

export function stepLabelClass(i: number, n: number): string {
  if (i === NOW_STEP) return "now";
  return i === 0 || i === n - 1 ? "" : "mid";
}
