/**
 * app/sign-in/fields.ts — the sign-in forms' box names and where a sign-in lands (D89, D94). Pure: the client
 * boxes import these too.
 */

/** D89: the "Remember this device for 30 days" box, on every form that can finish signing in. */
export const REMEMBER_FIELD = "remember";
export const rememberTicked = (fd: FormData) => fd.get(REMEMBER_FIELD) === "on";
/** D94: the "Use Face ID to sign in on this device" box beside it (shown only where the device can). */
export const FACEID_FIELD = "faceid";
export const faceIdTicked = (fd: FormData) => fd.get(FACEID_FIELD) === "on";
/** D94: where a sign-in lands: Face ID setup first when it was ticked, then `next`. */
export const afterSignIn = (faceId: boolean, next = "/mlo") => (faceId ? `/sign-in/face-id?next=${encodeURIComponent(next)}` : next);
/** D94: only Command Center's own pages as a place to go next. */
export const safeNext = (n: string | undefined | null) => (n && /^\/mlo(\/[A-Za-z0-9/_?=&.-]*)?$/.test(n) && !n.includes("//") ? n : "/mlo");
