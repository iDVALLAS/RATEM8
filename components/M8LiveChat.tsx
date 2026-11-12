"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { M8Event, M8Message, PricingCard } from "@/lib/m8/shared";
import { M8_SESSION_KEY } from "@/lib/m8/shared";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { usStateName } from "@/lib/us-states";
import { useMloContext, useNamedMlo } from "@/components/mlo/MloContext";
import MloChatCard from "@/components/chat/MloChatCard";
import MloAvatar from "@/components/mlo/MloAvatar";
import RichText from "@/components/chat/RichText";
import ExamplePricingCard from "@/components/chat/ExamplePricingCard";
import { fillMlo } from "@/lib/mlo-match";
import { useMic } from "@/components/chat/useMic";
import { silentWav } from "@/lib/voice/client";

/**
 * M8LiveChat — the live M8 conversation, the public chat at /chat (C1).
 *
 * Streams responses from /api/m8-chat token-by-token.
 *
 * Layout, top to bottom:
 *  - MloChatCard: the matched loan officer (photo, name, NMLS, sponsor),
 *    the location line, and "Talk to …"
 *  - the thread: M8's opening line (C6: the owner's greeting; every M8
 *    message carries an "AI" tag), then the empty-state prompt chips until
 *    the first message. M8's replies render **bold** and lists (RichText).
 *  - C6: once the borrower asks about pricing, a bar above the input says
 *    the loan officer can price it and opens the card's "Talk to" panel
 *  - the input (plus a hidden honeypot for the first-message bot check)
 *  - C10.4: one small line under the input (copy.chat.live.strip): AI, not
 *    a loan officer, not a credit pull or commitment; the privacy line
 *    (stored for 3 years or not, from the server) with the two-party
 *    consent note in WA and CA; the privacy policy link; "Start over" and
 *    "Delete my chat"
 *
 * C4 stream events (lib/m8/shared.ts): `text` appends, `replace` swaps the
 * whole reply (the output guard), `userText` replaces the borrower's last
 * message with its redacted form, and `notice` shows a note.
 *
 * The conversation also stays in this browser's localStorage between
 * reloads; "Start over" clears it, "Delete my chat" clears it and the
 * server copy.
 */

/** M8's opening line (C6). Unlicensed states and movers still get their sentence. */
function useOpening(): string {
  const ctx = useMloContext();
  const mlo = useNamedMlo();
  const o = copy.chat.liveOpening;
  const st = ctx.stateName ?? "";
  const mid = !mlo && ctx.status === "unlicensed" ? o.unlicensed.replace("{state}", st) : "";
  const moved = mlo && ctx.moved && ctx.ipState ? o.moved.replace("{state}", st).replace("{ip}", usStateName(ctx.ipState) ?? ctx.ipState) : "";
  return `${o.lead}${mid}${moved}${o.close}`;
}

/** C6: words that mean the borrower is after pricing; the bar appears after the first one. */
const PRICING_INTENT = /\b(?:rates?|quotes?|pricing|price[sd]?|apr|lock|refi\w*|refinanc\w*|purchas\w*|buying|afford\w*|payments?|pre-?approv\w*)\b/i;

/** M8's name, with the "AI" tag that makes every message its own AI disclosure. */
function M8Name({ typing, speaking }: { typing?: boolean; speaking?: boolean }) {
  return (
    <div className="msg-meta">
      <span className="font-medium" style={{ color: "var(--fg)" }}>
        M8
      </span>
      <span className="m8-ai-tag">{copy.chat.live.aiTag}</span>
      {typing ? <span className="msg-meta--label ml-2">{copy.chat.live.typing}</span> : null}
      {speaking ? <span className="msg-meta--label ml-2">{copy.chat.live.voice.reading}</span> : null}
    </div>
  );
}

/** C6 (style C): "{first} can price this for you", opening the card's panel. */
function PriceBar({ onTalk }: { onTalk: () => void }) {
  const ctx = useMloContext();
  const mlo = useNamedMlo();
  const b = copy.chat.live.priceBar;
  const card = copy.chat.live.card;
  if (ctx.status === "unlicensed") return null;
  return (
    <div className="m8-pricebar" role="region" aria-label={mlo ? fillMlo(b.titleNamed, mlo) : b.title}>
      {mlo ? <MloAvatar mlo={mlo} size={30} /> : <span className="mlo-chat-card__dot" aria-hidden="true" />}
      <p className="m8-pricebar__text">
        <strong>{mlo ? fillMlo(b.titleNamed, mlo) : b.title}</strong>
        <span>{b.body}</span>
      </p>
      <button type="button" className="m8-pricebar__btn" onClick={onTalk}>
        {mlo ? fillMlo(card.talkNamed, mlo) : card.talk}
      </button>
    </div>
  );
}

/** Where borrowers go when the model is unavailable. From config, never typed here. */
const CONTACT = CONFIG.contactEmail;
const t = copy.chat.live;

/** The route's JSON error message, or a plain fallback (never raw JSON). */
async function errorText(resp: Response): Promise<string> {
  const body = (await resp.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? t.offline.replace("{email}", CONTACT);
}

/** C15: whether the borrower turned on "Read replies aloud" (this browser only). */
const READ_ALOUD_KEY = "loanm8.readAloud";
/** C16: the borrower agreed to the mic note once (this browser only). */
const MIC_OK_KEY = "loanm8.micOk";

/** When the page loaded, for the first-message bot check (a person can't send instantly). */
const loadedAt = typeof performance !== "undefined" ? performance.now() : 0;

export default function M8LiveChat({ storageOn, retention, voice = false, listen = false }: { storageOn: boolean; retention: string; voice?: boolean; listen?: boolean }) {
  const opening = useOpening();
  const ctx = useMloContext();
  const twoPartyState = CONFIG.states.find((s) => s.code === ctx.stateCode && s.twoPartyConsent)?.name ?? null;
  const [notice, setNotice] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [deleteState, setDeleteState] = useState<"idle" | "deleting" | "deleted" | "failed">("idle");
  const [messages, setMessages] = useState<M8Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [talkOpen, setTalkOpen] = useState(false);
  const wantsPricing = messages.some((m) => m.role === "user" && PRICING_INTENT.test(m.content));
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── C15: read aloud ───────────────────────────────────────
  const [readAloud, setReadAloud] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakToken = useRef(0);

  useEffect(() => {
    if (!voice) return;
    try {
      setReadAloud(window.localStorage.getItem(READ_ALOUD_KEY) === "1");
    } catch {
      // ignore
    }
  }, [voice]);

  /** Inside a tap: makes the audio element playable on phones. */
  const unlockAudio = useCallback(() => {
    if (!voice) return;
    const a = audioRef.current ?? new Audio();
    audioRef.current = a;
    if (!a.src || a.paused) {
      a.src = silentWav();
      a.play().catch(() => {});
    }
  }, [voice]);

  const stopSpeaking = useCallback(() => {
    speakToken.current++;
    audioRef.current?.pause();
    setSpeakingIdx(null);
  }, []);

  const speak = useCallback(
    async (idx: number, text: string, sig: string) => {
      const token = ++speakToken.current;
      audioRef.current?.pause();
      setVoiceNote(null);
      setSpeakingIdx(idx);
      try {
        const res = await fetch("/api/m8-speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, sig }),
        });
        if (!res.ok) throw new Error(res.status === 403 ? t.voice.expired : ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? t.voice.failed);
        const url = URL.createObjectURL(await res.blob());
        if (token !== speakToken.current) return URL.revokeObjectURL(url);
        const a = audioRef.current ?? new Audio();
        audioRef.current = a;
        a.onended = () => {
          URL.revokeObjectURL(url);
          if (token === speakToken.current) setSpeakingIdx(null);
        };
        a.src = url;
        await a.play();
      } catch (err) {
        if (token !== speakToken.current) return;
        setSpeakingIdx(null);
        // A blocked autoplay isn't worth a message: the Listen button is right there.
        if (err instanceof Error && err.name !== "NotAllowedError") setVoiceNote(err.message);
      }
    },
    [],
  );

  const toggleReadAloud = () => {
    const next = !readAloud;
    setReadAloud(next);
    if (next) unlockAudio();
    else stopSpeaking();
    try {
      window.localStorage.setItem(READ_ALOUD_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  // ─── C16: the microphone ───────────────────────────────────
  const [micAsk, setMicAsk] = useState(false);
  const onHeard = useCallback((text: string) => {
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);
  const mic = useMic(onHeard, setVoiceNote);
  const micOk = () => {
    try {
      return window.localStorage.getItem(MIC_OK_KEY) === "1";
    } catch {
      return false;
    }
  };
  const tapMic = () => {
    setVoiceNote(null);
    if (mic.state === "listening") return void mic.stop();
    if (mic.state !== "idle") return;
    if (!micOk()) return setMicAsk(true);
    stopSpeaking();
    void mic.start();
  };
  const acceptMic = () => {
    try {
      window.localStorage.setItem(MIC_OK_KEY, "1");
    } catch {
      // ignore
    }
    setMicAsk(false);
    stopSpeaking();
    void mic.start();
  };

  // Stop talking when the chat goes away.
  useEffect(() => () => audioRef.current?.pause(), []);

  // ─── Load from localStorage on mount ───────────────────────
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(M8_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as M8Message[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // localStorage may be blocked; just start empty
    }
  }, []);

  // ─── Save to localStorage on change ────────────────────────
  useEffect(() => {
    try {
      window.localStorage.setItem(M8_SESSION_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages]);

  // ─── Auto-scroll to bottom as new content arrives ──────────
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamingText]);

  // ─── Send message + stream response ────────────────────────
  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      setError(null);
      setNotice(null);
      setVoiceNote(null);
      setDeleteState("idle");
      stopSpeaking();
      if (readAloud) unlockAudio();
      setStreamingText("");

      const nextMessages: M8Message[] = [
        ...messages,
        { role: "user", content: text.trim() },
      ];
      setMessages(nextMessages);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";
      let card: PricingCard | undefined;
      let voiceSig: string | undefined;
      try {
        const resp = await fetch("/api/m8-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages, hp: honeypot, t: Math.round(performance.now() - loadedAt) }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(await errorText(resp));
        }
        if (!resp.body) {
          throw new Error("No response body");
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Split by SSE event boundary (\n\n)
          const events = buffer.split("\n\n");
          buffer = events.pop() || ""; // keep any incomplete event

          for (const event of events) {
            if (!event.startsWith("data: ")) continue;
            const payload = event.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload) as M8Event;
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.userText !== undefined) {
                // Show the borrower's message as it was kept: sensitive numbers removed.
                const masked = parsed.userText;
                setMessages((m) => m.map((x, i) => (i === m.length - 1 && x.role === "user" ? { ...x, content: masked } : x)));
              }
              if (parsed.notice) setNotice(parsed.notice);
              if (parsed.pricing) card = parsed.pricing;
              if (parsed.voice) voiceSig = parsed.voice;
              if (parsed.replace !== undefined) {
                accumulated = parsed.replace;
                setStreamingText(accumulated);
              }
              if (parsed.text) {
                accumulated += parsed.text;
                setStreamingText(accumulated);
              }
            } catch (parseErr) {
              // If it's not JSON, ignore (probably a keepalive)
              if (parseErr instanceof Error && parseErr.message) {
                throw parseErr;
              }
            }
          }
        }

        // Streaming done — commit the assistant message and clear the buffer
        if (accumulated) {
          const reply: M8Message = { role: "assistant", content: accumulated };
          if (card) reply.pricing = card;
          if (voice && voiceSig) reply.voice = voiceSig;
          setMessages((m) => [...m, reply]);
          if (voice && voiceSig && readAloud) void speak(nextMessages.length, accumulated, voiceSig);
        }
        setStreamingText("");
      } catch (err) {
                const msg =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(msg);
        // Roll back the user message so they can retry cleanly?
        // No — leave it visible so they see what they said.
        setStreamingText("");
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, honeypot, voice, readAloud, speak, stopSpeaking, unlockAudio]
  );

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const startOver = () => {
    if (abortRef.current) abortRef.current.abort();
    stopSpeaking();
    setMessages([]);
    setStreamingText("");
    setError(null);
    setNotice(null);
    setInput("");
    try {
      window.localStorage.removeItem(M8_SESSION_KEY);
    } catch {
      // ignore
    }
  };

  /** "Delete my chat": the server copy (when stored) and this browser's copy. */
  const deleteChat = async () => {
    setDeleteState("deleting");
    try {
      const res = await fetch("/api/m8-chat", { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      startOver();
      setDeleteState("deleted");
    } catch {
      setDeleteState("failed");
    }
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <MloChatCard open={talkOpen} onOpenChange={setTalkOpen} />

      {/* Message thread */}
      <div ref={scrollRef} className="chat-center flex-1 overflow-y-auto">
        {messages.length === 0 && !streaming && (
          <div className="msg-bubble-m8">
            <div className="msg-avatar msg-avatar--m8">M8</div>
            <div className="flex-1 min-w-0">
              <M8Name />
              <p
                className="text-[15px] leading-relaxed"
                style={{ color: "var(--fg)" }}
              >
                {opening}
              </p>
            </div>
          </div>
        )}

        {messages.length === 0 && !streaming && (
          <div className="m8-chips" role="group" aria-label={t.chipsLabel}>
            {t.chips.map((c) => (
              <button key={c} type="button" className="m8-chip" onClick={() => send(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === "user" ? "msg-bubble-user" : "msg-bubble-m8"}
          >
            <div
              className={`msg-avatar ${
                msg.role === "user" ? "msg-avatar--user" : "msg-avatar--m8"
              }`}
            >
              {msg.role === "user" ? "YOU" : "M8"}
            </div>
            <div className="flex-1 min-w-0">
              {msg.role === "user" ? (
                <div className="msg-meta">
                  <span className="font-medium" style={{ color: "var(--fg)" }}>
                    {t.you}
                  </span>
                </div>
              ) : (
                <M8Name speaking={speakingIdx === i} />
              )}
              {msg.role === "user" ? (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fg)" }}>
                  {msg.content}
                </p>
              ) : (
                <div className="text-[15px] leading-relaxed" style={{ color: "var(--fg)" }}>
                  <RichText text={msg.content} />
                  {msg.pricing ? <ExamplePricingCard card={msg.pricing} /> : null}
                  {voice && msg.voice ? (
                    <button
                      type="button"
                      className="m8-listen"
                      aria-pressed={speakingIdx === i}
                      onClick={() => {
                        if (speakingIdx === i) return stopSpeaking();
                        unlockAudio();
                        void speak(i, msg.content, msg.voice as string);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        {speakingIdx === i ? <path d="M7 6h3v12H7zM14 6h3v12h-3z" /> : <path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7" />}
                      </svg>
                      {speakingIdx === i ? t.voice.stop : t.voice.listen}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* In-flight streaming message */}
        {streaming && (streamingText || messages[messages.length - 1]?.role === "user") && (
          <div className="msg-bubble-m8">
            <div className="msg-avatar msg-avatar--m8">M8</div>
            <div className="flex-1 min-w-0">
              <M8Name typing />
              <div className="text-[15px] leading-relaxed" style={{ color: "var(--fg)" }}>
                {/* v24: skeleton lines until the first words arrive (no spinner). */}
                {streamingText ? (
                  <RichText text={streamingText} />
                ) : (
                  <span className="flex flex-col gap-2 pt-1" aria-hidden="true">
                    <span className="skeleton" style={{ width: "72%", height: 10 }} />
                    <span className="skeleton" style={{ width: "48%", height: 10 }} />
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {notice && (
          <p className="m8-notice" role="status">
            {notice}
          </p>
        )}

        {voiceNote && (
          <p className="m8-notice" role="status">
            {voiceNote}
          </p>
        )}

        {deleteState === "deleted" && (
          <p className="m8-notice" role="status">
            {t.deleted}
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-md border px-4 py-3 text-sm"
               style={{
                 borderColor: "color-mix(in srgb, #E2746E 60%, transparent)",
                 background: "color-mix(in srgb, #E2746E 8%, transparent)",
                 color: "#E2746E",
               }}>
            {/* Server messages already say where to go; others get the contact line. */}
            {/email/i.test(error) ? error : `${error.replace(/\.$/, "")}. ${t.error.replace("{email}", CONTACT)}`}
          </div>
        )}
      </div>

      {wantsPricing ? <PriceBar onTalk={() => setTalkOpen(true)} /> : null}

      {/* Input bar */}
      <div className="chat-input">
        {micAsk && (
          <div className="m8-micask" role="dialog" aria-label={t.mic.consentTitle}>
            <p>
              <strong>{t.mic.consentTitle}</strong> {t.mic.consentBody}
            </p>
            <span className="m8-micask__actions">
              <button type="button" className="m8-listen" onClick={acceptMic}>
                {t.mic.consentYes}
              </button>
              <button type="button" className="m8-strip__reset" onClick={() => setMicAsk(false)}>
                {t.mic.consentNo}
              </button>
            </span>
          </div>
        )}
        <div
          className="chat-input-row flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors"
          style={{
            borderColor: input ? "var(--color-m8-deep)" : "var(--rule)",
          }}
        >
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              aria-label="M8 is here"
              className={`m8-input-orb ${
                streaming || mic.state === "working" ? "m8-input-orb--sending" : input || mic.state === "listening" ? "m8-input-orb--typing" : "m8-input-orb--idle"
              }`}
            />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={streaming}
            placeholder={
              streaming
                ? t.inputBusy
                : mic.state === "listening"
                  ? t.mic.listening.replace("{s}", String(mic.seconds))
                  : mic.state === "working"
                    ? t.mic.working
                    : t.inputPlaceholder
            }
            className="flex-1 bg-transparent outline-none text-[16px] sm:text-[15px] placeholder:text-[var(--muted)] disabled:opacity-60"
            aria-label={t.inputLabel}
          />

          {listen && (
            <button
              type="button"
              onClick={tapMic}
              disabled={streaming || mic.state === "working"}
              aria-label={mic.state === "listening" ? t.mic.stop : t.mic.start}
              aria-pressed={mic.state === "listening"}
              className={`m8-mic${mic.state === "listening" ? " m8-mic--on" : ""}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {mic.state === "listening" ? (
                  <rect x="7" y="7" width="10" height="10" rx="2" />
                ) : (
                  <>
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </>
                )}
              </svg>
            </button>
          )}

          <button
            onClick={() => send(input)}
            disabled={!input.trim() || streaming}
            aria-label={t.send}
            className="grid place-items-center w-10 h-10 rounded-lg disabled:opacity-40 transition-opacity"
            style={{
              background: "var(--color-m8-deep)",
              color: "var(--color-m8-paper)",
            }}
          >
            {streaming ? (
              <span className="font-mono text-xs">…</span>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        {/* Honeypot: hidden from people and assistive tech; bots that fill every field give themselves away. */}
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="m8-hp"
        />
        <div className="m8-strip">
          {/* C10.4 (owner): the one AI, recording and privacy line, under the input, visible before the first message. */}
          <p>
            {t.strip} {storageOn ? t.privacyStored.replace("{retention}", retention) : t.privacyNotStored}
            {/* Two-party consent (WA, CA): only when chats are actually stored. */}
            {storageOn && twoPartyState ? ` ${t.twoParty.replace("{state}", twoPartyState)}` : ""}{" "}
            <Link href="/privacy" className="underline hover:no-underline">
              {t.privacyLink}
            </Link>
          </p>
          <span className="m8-strip__actions">
            {voice && (
              <button type="button" onClick={toggleReadAloud} className="m8-strip__reset" aria-pressed={readAloud}>
                {readAloud ? t.voice.toggleOn : t.voice.toggleOff}
              </button>
            )}
            {messages.length > 0 && (
              <button type="button" onClick={startOver} className="m8-strip__reset">
                {t.startOver}
              </button>
            )}
            <button type="button" onClick={deleteChat} className="m8-strip__reset" disabled={deleteState === "deleting"}>
              {deleteState === "deleting" ? t.deleting : t.deleteChat}
            </button>
          </span>
        </div>
        {deleteState === "failed" && (
          <p className="m8-strip" role="alert">
            {t.deleteFailed.replace("{email}", CONTACT)}
          </p>
        )}
      </div>
    </div>
  );
}
