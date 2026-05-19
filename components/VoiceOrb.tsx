"use client";

import { useGreeting } from "@/lib/useGreeting";
import Orb from "./Orb";

/**
 * VoiceOrb — the interactive hero orb.
 *
 * - Wraps the visual Orb in a button (keyboard + screen reader accessible)
 * - Shows a speech bubble below the orb
 * - On tap: requests mic permission (user gesture), plays greeting
 * - Visual state changes: idle → listening (mic check) → speaking → complete
 *
 * The non-interactive Orb (footer mark, etc.) is still imported from
 * components/Orb.tsx unchanged.
 */
export default function VoiceOrb() {
  const { state, activate, bubbleText } = useGreeting();

  const orbStateClass =
    state === "requesting"
      ? "orb--listening"
      : state === "speaking"
      ? "orb--speaking"
      : "";

  const ariaLabel =
    state === "idle"
      ? "Tap to say g'day to M8"
      : state === "requesting"
      ? "Requesting microphone permission"
      : state === "speaking"
      ? "M8 is speaking"
      : "M8 greeted you";

  return (
    <div className="flex flex-col items-center gap-6">
      <button
        type="button"
        onClick={activate}
        aria-label={ariaLabel}
        className="orb orb--clickable rounded-full bg-transparent border-0 p-0"
        style={{ width: 220, height: 220 }}
      >
        {/* The visual orb is rendered as a sibling so the button's
            bounding box matches the orb's hit target. */}
        <Orb size="hero" />
      </button>

      <div className="min-h-[64px] flex items-start justify-center">
        <div
          key={bubbleText}
          className="speech-bubble"
          role="status"
          aria-live="polite"
        >
          {bubbleText}
        </div>
      </div>
    </div>
  );
}
