"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useGreeting — handles M8's voice greeting on the homepage.
 *
 * Behavior:
 *   1. Idle: orb breathes, "Tap to chat with M8" hint after 1.5s.
 *   2. On tap: requests mic permission via user gesture (the only
 *      way iOS Safari allows getUserMedia).
 *   3. Plays /audio/greeting.mp3 if present, otherwise falls back
 *      to the browser's Web Speech API.
 *   4. If mic denied, still plays greeting (audio out doesn't need
 *      mic permission) and shows text bubble. Mic was for input —
 *      we'll prompt again when the chat opens (Stage 2).
 *   5. After greeting plays, dispatches a "greeting:complete" event
 *      that future M8 chat can hook into.
 *
 * Returns:
 *   state    — "idle" | "requesting" | "speaking" | "complete" | "denied"
 *   activate — call this on the user's tap to trigger the flow
 *   greeting — the text shown in the speech bubble
 */

export type GreetingState =
  | "idle"
  | "requesting"
  | "speaking"
  | "complete"
  | "denied";

const GREETING_TEXT = "G'day, mate. I'm M8.";
const GREETING_FOLLOWUP = "Tap to chat anytime.";
const AUDIO_PATH = "/audio/greeting.mp3";

export function useGreeting() {
  const [state, setState] = useState<GreetingState>("idle");
  const [bubbleText, setBubbleText] = useState<string>(
    "Tap me to say g'day."
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasActivatedRef = useRef(false);

  /* Pre-load the MP3 once so the first play has no latency. */
  useEffect(() => {
    const audio = new Audio(AUDIO_PATH);
    audio.preload = "auto";
    audio.onerror = () => {
      // MP3 missing — we'll fall back to Web Speech API on activate
      audioRef.current = null;
    };
    audio.oncanplaythrough = () => {
      audioRef.current = audio;
    };
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  const speakViaWebSpeech = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      // Try to find an Australian voice for the "G'day" delivery
      const voices = window.speechSynthesis.getVoices();
      const aussie = voices.find(
        (v) =>
          /en-AU/i.test(v.lang) ||
          /australian/i.test(v.name.toLowerCase())
      );
      if (aussie) utterance.voice = aussie;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const activate = useCallback(async () => {
    if (hasActivatedRef.current) return;
    hasActivatedRef.current = true;

    setState("requesting");

    /* Request mic permission inside the user gesture.
     * If denied, we continue with audio-out only. */
    let micGranted = false;
    try {
      if (typeof navigator !== "undefined" && navigator.mediaDevices) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        micGranted = true;
        // Stop the tracks immediately — we just wanted permission.
        // Real mic capture will happen in Stage 2 chat.
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      micGranted = false;
    }

    setState("speaking");
    setBubbleText(GREETING_TEXT);

    /* Play the greeting. */
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
        await new Promise<void>((resolve) => {
          const a = audioRef.current!;
          const done = () => {
            a.removeEventListener("ended", done);
            resolve();
          };
          a.addEventListener("ended", done);
        });
      } catch {
        // Audio playback failed — fall back to TTS
        await speakViaWebSpeech(GREETING_TEXT);
      }
    } else {
      await speakViaWebSpeech(GREETING_TEXT);
    }

    setBubbleText(
      micGranted ? GREETING_FOLLOWUP : "Sounds good. We can chat by text instead."
    );
    setState(micGranted ? "complete" : "denied");

    /* Notify the rest of the app. */
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("greeting:complete", {
          detail: { micGranted },
        })
      );
    }
  }, [speakViaWebSpeech]);

  return { state, activate, bubbleText };
}
