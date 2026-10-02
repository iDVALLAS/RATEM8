/**
 * components/chat/chatContent.ts — the few /chat shell strings that are
 * not in `copy.chat` (lib/copy.ts is frozen for this build). No facts
 * live here; names, emails, and states come from lib/config.ts.
 */

import type { OrbState } from "@/components/Orb";

export const chatContent = {
  /** Plain-text equivalent of the orb's animation states (visually hidden). */
  orbStateText: {
    idle: "M8 is idle.",
    listening: "M8 is listening.",
    thinking: "M8 is thinking.",
    speaking: "M8 is speaking.",
  } satisfies Record<OrbState, string>,

  /** Mono labels inside bubbles. */
  who: { m8: "M8", user: "You" },

  /** The only working action on the shell. */
  bookingCta: "Talk to a licensed loan officer",

  /** Dev toggle helper. */
  devAuto: "auto",

  /** Replay control label. */
  replay: "replay demo",

  voice: {
    open: "Voice",
    close: "Close",
    captionsPlaceholder: "Captions will appear here.",
    transcriptSubject: "Transcript request",
    flagNote: "Voice is off by feature flag. Every control here is disabled.",
  },

  /** /demo tester wrapper. */
  demo: {
    tabs: { scripted: "Scripted demo", live: "Live M8 (preview)" },
    testerNote: "Tester preview · password-gated · not public",
  },
} as const;
