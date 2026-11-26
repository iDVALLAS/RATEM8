/**
 * lib/content/sign-in.ts — words on the sign-in forms (D89; D94 says "device", not "computer"). Pure.
 */

/** D89: the Remember box, on the three forms that can finish signing in and beside "Sign in with Face ID". */
export const REMEMBER_COPY = {
  label: "Remember this device for 30 days",
  note: "Leave it unticked on a shared or public device. Unticked, you stay signed in for 12 hours.",
  noteMfa: "Ticked, this device also skips this phone-code step for 30 days. Leave it unticked on a shared or public device.",
} as const;
