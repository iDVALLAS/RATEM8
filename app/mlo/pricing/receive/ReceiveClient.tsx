"use client";

import { useEffect, useRef, useState } from "react";
import { mloContent } from "@/lib/content/mlo";
import { isLoanSifterOrigin } from "@/lib/pricing/loansifterOrigin";

type Result = { ok: boolean; lines: string[]; scenario: string | null };
type Row = { id: string; name: string; state: "publishing" | "done" | "failed"; result?: Result };

const PMI_KEY = "loanm8.mlo.pmi";

/**
 * Receives captures from the Send to LoanM8 button (C11).
 * - Says "ready" to the LoanSifter tab that opened it.
 * - Accepts { kind: "loansifter-capture", id, name, capture } only from a
 *   LoanSifter origin, imports one at a time, and answers with the result.
 */
export default function ReceiveClient({
  extraOrigins,
  importCapture,
}: {
  extraOrigins: string[];
  importCapture: (captureText: string, pmi: string) => Promise<Result>;
}) {
  const c = mloContent.receive;
  const [rows, setRows] = useState<Row[]>([]);
  const [refused, setRefused] = useState<string | null>(null);
  const [pmi, setPmi] = useState("");
  const pmiRef = useRef("");
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    try {
      const v = localStorage.getItem(PMI_KEY) ?? "";
      setPmi(v);
      pmiRef.current = v;
    } catch {
      /* storage blocked: the field just starts empty */
    }
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { kind?: string; id?: string; name?: string; capture?: unknown } | null;
      if (!d || d.kind !== "loansifter-capture") return;
      if (!isLoanSifterOrigin(e.origin, extraOrigins)) {
        setRefused(e.origin);
        return;
      }
      const id = String(d.id ?? Math.random());
      const name = String(d.name ?? "").slice(0, 200) || c.unnamed;
      const reply = (msg: object) => (e.source as Window | null)?.postMessage({ kind: "loanm8", ...msg }, e.origin);
      setRows((r) => [...r, { id, name, state: "publishing" }]);
      queue.current = queue.current.then(async () => {
        let result: Result;
        try {
          result = await importCapture(JSON.stringify(d.capture), pmiRef.current);
        } catch {
          result = { ok: false, lines: [c.failed], scenario: null };
        }
        setRows((r) => r.map((x) => (x.id === id ? { ...x, state: result.ok ? "done" : "failed", result } : x)));
        reply({ type: "result", id, ok: result.ok, lines: result.lines, scenario: result.scenario });
      });
    };
    window.addEventListener("message", onMessage);
    // Tell the LoanSifter tab we're ready (a few times, in case it was still loading).
    let n = 0;
    const hello = () => (window.opener as Window | null)?.postMessage({ kind: "loanm8", type: "ready" }, "*");
    hello();
    const t = window.setInterval(() => (++n > 10 ? window.clearInterval(t) : hello()), 1000);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(t);
    };
  }, [extraOrigins, importCapture, c.failed, c.unnamed]);

  const savePmi = (v: string) => {
    setPmi(v);
    pmiRef.current = v;
    try {
      localStorage.setItem(PMI_KEY, v);
    } catch {
      /* not remembered; still used for this session */
    }
  };

  return (
    <section className="mlo-section">
      <p className="mlo-note">{c.intro}</p>
      <label className="mlo-field mt-3">
        {c.pmi}
        <input inputMode="decimal" placeholder="182" value={pmi} onChange={(e) => savePmi(e.target.value)} />
      </label>
      {refused ? (
        <p className="mlo-flash mlo-flash--err" role="alert">
          {c.refused.replace("{origin}", refused)}
        </p>
      ) : null}
      {rows.length === 0 ? <p className="mlo-note mt-3">{c.waiting}</p> : null}
      <ul className="mt-3" aria-live="polite">
        {rows.map((r) => (
          <li key={r.id} className={`mlo-flash ${r.state === "failed" ? "mlo-flash--err" : ""}`}>
            <strong>{r.result?.scenario ?? r.name}</strong>: {r.state === "publishing" ? c.publishing : r.result?.lines.join(" ")}
          </li>
        ))}
      </ul>
    </section>
  );
}
