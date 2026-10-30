"use client";

import { useState } from "react";
import { useVoice } from "@/components/voice/VoiceRoot";
import { copy } from "@/lib/copy";

/** Reads one M8 message aloud (v33). Hidden where the browser can't speak. */
export default function SpeakButton({ text }: { text: string }) {
  const v = useVoice();
  const [mine, setMine] = useState(false);
  if (!v.canSpeak) return null;
  const playing = mine && v.state === "speaking";
  return (
    <button
      type="button"
      className={`m8c-speak ${playing ? "is-on" : ""}`}
      aria-label={playing ? copy.m8chat.stopListen : copy.m8chat.listen}
      onClick={async () => {
        if (playing) return v.stop();
        setMine(true);
        await v.speak(text);
        setMine(false);
      }}
    >
      {playing ? (
        <span className="m8c-bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          <path d="M16 9a4 4 0 0 1 0 6" />
        </svg>
      )}
    </button>
  );
}
