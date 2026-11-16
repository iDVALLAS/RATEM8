"use client";

import { useRef, useState } from "react";

type Voice = { name: string; tone: string; gender: "female" | "male" };

/**
 * The /mlo/voice list (C15): play each candidate reading the same line,
 * then pick one. Saving is the page's server action.
 */
export default function VoicePicker({ voices, current, action }: { voices: Voice[]; current: string; action: (fd: FormData) => Promise<void> }) {
  const [chosen, setChosen] = useState(current);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const play = (name: string) => {
    setError(null);
    const a = audio.current ?? new Audio();
    audio.current = a;
    if (playing === name) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.pause();
    a.src = `/mlo/voice/sample?name=${encodeURIComponent(name)}`;
    a.onended = () => setPlaying(null);
    a.onerror = () => {
      setPlaying(null);
      setError(`Couldn't play ${name}. Google may not offer it to this key.`);
    };
    setPlaying(name);
    a.play().catch(() => setPlaying(null));
  };

  return (
    <form action={action}>
      {error ? <div className="mlo-flash mlo-flash--err" role="alert">{error}</div> : null}
      <div className="mlo-grid">
        {voices.map((v) => (
          <div key={v.name} className="mlo-voice">
            <label className="mlo-check">
              <input type="radio" name="voice" value={v.name} checked={chosen === v.name} onChange={() => setChosen(v.name)} />
              <span>
                <strong>{v.name.replace(/^en-US-/, "")}</strong> · {v.tone} · {v.gender}
                {v.name === current ? " · in use" : ""}
              </span>
            </label>
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => play(v.name)} aria-pressed={playing === v.name}>
              {playing === v.name ? "Stop" : "Play sample"}
            </button>
          </div>
        ))}
      </div>
      <button type="submit" className="mlo-btn" disabled={chosen === current}>
        Use this voice
      </button>
    </form>
  );
}
