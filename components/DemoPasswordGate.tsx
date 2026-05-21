"use client";

import { useState } from "react";
import Footer from "./Footer";

/**
 * The password form shown when a visitor hits /demo without a valid auth cookie.
 *
 * Behavior:
 *  - Visitor enters password, hits enter or clicks button
 *  - POST to /api/demo-auth with the password
 *  - On success: cookie is set server-side, page reloads, ChatExperience renders
 *  - On failure: error shown, no cookie set
 *
 * Failed-attempt logging (in the API route) lets you see who's trying.
 * No rate limiting yet — soft gate, low stakes, easily added if needed.
 */
export default function DemoPasswordGate() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit() {
    if (!password.trim()) return;
    setStatus("sending");
    setErrorMsg("");

    try {
      const res = await fetch("/api/demo-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Reload — middleware/server will pick up the new cookie
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setErrorMsg(data?.error || "That password didn't work. Try again.");
        setPassword("");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Couldn't reach the server. Try again in a moment.");
    }
  }

  return (
    <>
      <main className="grain min-h-screen flex flex-col">
        <header className="px-6 py-6">
          <div className="mx-auto max-w-7xl flex items-center justify-between">
            <a href="/" className="flex items-center gap-3" aria-label="Back to coming soon">
              <span className="orb" style={{ width: 20, height: 20 }} />
              <span className="font-display font-medium tracking-tight text-lg">
                Rate<span style={{ color: "var(--color-m8-green)" }}>M8</span>
              </span>
            </a>
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase"
                  style={{ color: "var(--muted)" }}>
              Demo · Invitation only
            </span>
          </div>
        </header>

        <section className="flex-1 px-6 py-20 flex flex-col items-center justify-center text-center">
          <div className="mb-10">
            <span className="orb" style={{ width: 120, height: 120 }} />
          </div>

          <p className="font-mono text-[11px] tracking-[0.2em] uppercase mb-6"
             style={{ color: "var(--color-m8-green)" }}>
            M8 Preview
          </p>

          <h1 className="tagline text-4xl sm:text-5xl mb-6">
            You&apos;re early.
          </h1>

          <p className="text-base leading-relaxed max-w-md mx-auto font-light mb-10"
             style={{ color: "var(--muted)" }}>
            The M8 demo is in private preview. Drop your invitation password
            below to take a look.
          </p>

          <div className="w-full max-w-sm">
            <div
              className="flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors"
              style={{
                borderColor: password ? "var(--color-m8-green)" : "var(--rule)",
              }}
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Password"
                className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--muted)]"
                aria-label="Demo password"
                autoFocus
              />
              <button
                onClick={submit}
                disabled={!password.trim() || status === "sending"}
                className="grid place-items-center w-10 h-10 rounded-lg disabled:opacity-40"
                style={{
                  background: "var(--color-m8-green)",
                  color: "var(--color-m8-forest)",
                }}
                aria-label="Submit password"
              >
                {status === "sending" ? (
                  <span className="font-mono text-xs">…</span>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>

            {status === "error" && (
              <p className="mt-3 text-sm" style={{ color: "#E2746E" }}>
                {errorMsg}
              </p>
            )}

            <p className="mt-8 font-mono text-[10px] tracking-[0.15em] uppercase"
               style={{ color: "var(--muted)" }}>
              No password yet? Email{" "}
              <a
                href="mailto:jason@ratem8.com"
                className="hover:underline"
                style={{ color: "var(--color-m8-green)" }}
              >
                jason@ratem8.com
              </a>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
