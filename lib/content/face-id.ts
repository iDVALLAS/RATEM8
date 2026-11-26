/**
 * lib/content/face-id.ts — the words for Face ID sign-in (D94). Pure.
 * "Face ID" first, because that's what most loan officers' phones call it; the
 * same passkey works with Touch ID, an Android fingerprint and Windows Hello.
 */

export const FACE_ID = {
  /** /sign-in, above the email box. */
  signInButton: "Sign in with Face ID",
  signInNote: "Or your fingerprint or Windows Hello, on a device where you turned it on.",
  signInBusy: "Waiting for Face ID",
  or: "or use your email",
  /** The code steps (email code, emailed link, phone code). Off by default. */
  toggle: "Use Face ID to sign in on this device",
  toggleNote: "Or your fingerprint or Windows Hello. After you sign in, this device asks once to set it up. Only on a device that's yours.",
  /** /sign-in/face-id, right after signing in with the toggle on. */
  setupTitle: "Turn on Face ID",
  setupLede: "Next time on this device, sign in with Face ID instead of an emailed code. Your face or fingerprint stays on the device; Command Center keeps only a public key, which can't be used to sign in.",
  setupButton: "Turn on Face ID",
  setupBusy: "Waiting for Face ID",
  setupDone: "Face ID is on for this device.",
  setupSkipped: "Face ID wasn't set up. You're signed in either way, and nothing was saved.",
  continue: "Continue to Command Center",
  skip: "Not now",
  /** /mlo/security#face-id */
  sectionTitle: "Face ID",
  sectionNote:
    "Sign in on your own phone or computer with Face ID (or your fingerprint or Windows Hello) instead of the emailed code and the phone code. Add only a device that's yours and has a screen lock. Your face or fingerprint never leaves the device.",
  none: "No devices yet.",
  add: "Add this device",
  addBusy: "Waiting for Face ID",
  added: "Face ID is on for this device.",
  addCancelled: "Face ID didn't finish. Nothing was saved.",
  remove: "Remove",
  unsupported: "This browser can't use Face ID here. Open this page on the phone or computer you want to add.",
  removed: "Removed. That device signs in with your email again.",
  removedNone: "That device was already removed.",
  keeps: "Signing out keeps Face ID. Forgetting remembered devices, or turning the phone code off or on, doesn't remove it; Remove does, and so does an owner's reset.",
} as const;

/** Calm messages; the email way always stays. */
export const FACE_ID_ERRORS = {
  generic: "Face ID didn't sign you in. Try again, or use your email.",
  cancelled: "Face ID didn't finish. Try again, or use your email.",
  expired: "That took too long. Try again.",
  unknown: "This device's Face ID isn't set up for an active Command Center account. Use your email, then turn Face ID on again.",
  tooMany: "Too many tries. Use your email, or try Face ID again in an hour.",
  tooManyDevices: "You have 10 devices with Face ID. Remove one on Sign-in security first.",
  already: "This device already has Face ID for your account.",
  notThisDevice: "Use the Face ID on this device, not another phone or a security key.",
  network: "Couldn't reach Command Center. Check the connection and try again.",
} as const;
