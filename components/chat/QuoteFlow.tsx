"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { quotesCopy } from "@/lib/content/quotes";
import { NOT_AN_OFFER_LINE } from "@/lib/config";
import { answerStep, CHOICES, currentStep, reopen, STEP_KIND, stepsFor, toScenario, type Answers, type AnswerError, type StepId } from "@/lib/quotes/flow";
import { LABELS } from "@/lib/quotes/scenario";
import TrustLine from "@/components/TrustLine";

/**
 * QuoteFlow — M8 quote mode at /chat?quote=1 (v37, L4).
 *
 * Owner 2026-10-31: M8 collects the scenario in conversation; there is no
 * form. One question at a time with tap-to-answer chips (amounts and the
 * ZIP are typed). Before anything is sent the borrower sees what will go
 * to the loan officer, with Send and Change, plus the email and consent.
 * Nothing leaves the browser until Send.
 */
const Q = quotesCopy;
type Nearest = { label: string; href: string; options: Array<{ label: string; rate: number; apr: number }> } | null;
type Result = { id: string; url: string; nearest: Nearest };

const money = (v: string) => `$${Number(v).toLocaleString("en-US")}`;

function prompt(step: StepId, a: Answers): string {
  if (step === "price" && a.purpose && a.purpose !== "purchase") return Q.questions.value;
  return Q.questions[step];
}

function label(step: StepId, v: string): string {
  if (STEP_KIND[step] === "amount") return money(v);
  if (step === "zip") return v;
  return (LABELS as unknown as Record<string, Record<string, string>>)[step]?.[v] ?? v;
}

const ERR: Record<AnswerError, string> = {
  empty: "Pick one, or type an answer.",
  invalid: "That doesn't look right. Try a number like 450,000 or 450k.",
  zip: "A 5-digit ZIP, please.",
  outside: "",
};

export default function QuoteFlow({ statesLine }: { statesLine: string }) {
  const [a, setA] = useState<Answers>({});
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const step = currentStep(a);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [step, result]);

  const submit = (value: string) => {
    const r = answerStep(a, value);
    if (r.error) {
      setError(r.error === "outside" ? Q.flow.unlicensed.replace("{states}", statesLine) : ERR[r.error]);
      return;
    }
    setError(null);
    setText("");
    setA(r.answers);
  };

  const send = async () => {
    const sc = toScenario(a);
    if (!sc.ok) {
      setError(sc.message);
      if (sc.step) setA(reopen(a, sc.step));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(Q.flow.badEmail);
    if (!consent) return setError(Q.flow.needConsent);
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario: sc.scenario, email: email.trim(), emailConsent: true }) });
      const data = (await res.json()) as { ok: boolean; id?: string; url?: string; nearest?: Nearest; error?: string; issues?: string[] };
      if (!res.ok || !data.ok || !data.id || !data.url) setError(data.error ? `${data.error}${data.issues?.length ? ` (${data.issues[0]})` : ""}` : Q.flow.failed);
      else setResult({ id: data.id, url: data.url, nearest: data.nearest ?? null });
    } catch {
      setError(Q.flow.failed);
    } finally {
      setSending(false);
    }
  };

  const answered = stepsFor(a).filter((s) => a[s] !== undefined);

  return (
    <section className="prep" aria-labelledby="quote-h">
      <p className="code-label" id="quote-h">{"// your personal estimate"}</p>
      <div className="m8chat-thread prep__thread" role="log" aria-live="polite" aria-relevant="additions">
        <div className="bubble bubble--m8">{Q.flow.intro}</div>
        {answered.map((s) => (
          <div key={s} className="prep__pair">
            <div className="bubble bubble--m8">{prompt(s, a)}</div>
            <div className="bubble bubble--user">{label(s, a[s]!)}</div>
          </div>
        ))}

        {!result && step ? (
          <div className="prep__ask">
            <div className="bubble bubble--m8">{prompt(step, a)}</div>
            <p className="mono-label prep__progress">{answered.length + 1} of {stepsFor(a).length}</p>
            {STEP_KIND[step] === "choice" ? (
              <div className="prep__options" role="group" aria-label={prompt(step, a)}>
                {CHOICES[step]!.map((v) => (
                  <button key={v} type="button" className="prep__opt" onClick={() => submit(v)}>
                    {label(step, v)}
                  </button>
                ))}
              </div>
            ) : (
              <form
                className="prep__row"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(text);
                }}
              >
                <input
                  className="prep__text"
                  style={{ minHeight: 44 }}
                  inputMode={step === "zip" ? "numeric" : "decimal"}
                  autoComplete={step === "zip" ? "postal-code" : "off"}
                  maxLength={step === "zip" ? 5 : 14}
                  placeholder={step === "zip" ? "98033" : step === "down" ? "80,000 or 20%" : "450,000"}
                  aria-label={prompt(step, a)}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" className="m8chat-btn m8chat-btn--primary">Next</button>
              </form>
            )}
            {error ? <p className="prep__warn" role="alert">{error}</p> : null}
            {answered.length ? (
              <button type="button" className="m8chat-linkbtn" onClick={() => { setError(null); setA(reopen(a, answered[answered.length - 1])); }}>
                {Q.flow.back}
              </button>
            ) : null}
          </div>
        ) : null}

        {!result && !step ? (
          <div className="prep__summary card">
            <h2 className="prep__summary-h">{Q.flow.summaryLead}</h2>
            <dl className="prep__rows">
              {answered.map((s) => (
                <div key={s} className="prep__rowitem">
                  <dt>{prompt(s, a)}</dt>
                  <dd>
                    {label(s, a[s]!)}{" "}
                    <button type="button" className="m8chat-linkbtn" onClick={() => setA(reopen(a, s))} aria-label={`${Q.flow.change}: ${prompt(s, a)}`}>
                      Change
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
            <label className="prep__col mt-3" style={{ gap: 6 }}>
              <span>{Q.flow.emailPrompt}</span>
              <input className="prep__text" style={{ minHeight: 44 }} type="email" autoComplete="email" maxLength={254} placeholder={Q.flow.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="prep__row mt-2" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
              <span>{Q.flow.consent}</span>
            </label>
            {error ? <p className="prep__warn" role="alert">{error}</p> : null}
            <div className="prep__row mt-3">
              <button type="button" className="m8chat-btn m8chat-btn--primary" onClick={send} disabled={sending}>
                {sending ? Q.flow.sending : Q.flow.send}
              </button>
            </div>
            <TrustLine className="font-mono text-[10px] tracking-[0.14em] uppercase" style={{ color: "var(--muted)" }} />
          </div>
        ) : null}

        {result ? (
          <div className="prep__summary card">
            <h2 className="prep__summary-h">{Q.flow.doneLead.replace("{id}", result.id)}</h2>
            <p className="prep__summary-note">{Q.flow.doneBody}</p>
            <p className="prep__summary-note" style={{ wordBreak: "break-all" }}>
              <a href={result.url}>{result.url}</a>
            </p>
            {result.nearest && result.nearest.options.length ? (
              <div className="mt-3">
                <p className="prep__summary-note">
                  {Q.flow.nearestLead} <Link href={result.nearest.href}>{result.nearest.label}</Link>
                </p>
                <ul className="prep__summary-note">
                  {result.nearest.options.map((o) => (
                    <li key={o.label}>
                      {o.label}: {o.rate.toFixed(3)}% (APR {o.apr.toFixed(3)}%)
                    </li>
                  ))}
                </ul>
                <p className="prep__summary-note">{Q.flow.nearestNote} {NOT_AN_OFFER_LINE}.</p>
              </div>
            ) : (
              <p className="prep__summary-note">{Q.flow.nearestNone}</p>
            )}
          </div>
        ) : null}
        <div ref={bottom} />
      </div>
    </section>
  );
}
