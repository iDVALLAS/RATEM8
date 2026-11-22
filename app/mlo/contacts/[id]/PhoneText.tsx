"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { phoneTextAction } from "../actions";

/**
 * D67: "Text from my phone". Command Center checks the contact rules and
 * writes the text, then opens Messages on the loan officer's own phone with
 * it filled in. They press send there; it goes from their own number.
 */
export default function PhoneText({ contactId, first, maxLength, serviceOk, marketingOk, refresh = false, stopWhere = "under More ways to reach them" }: { contactId: string; first: string; maxLength: number; serviceOk: boolean; marketingOk: boolean; /** D79: read the page again once it's logged (the Inbox moves the conversation out of Needs reply). */ refresh?: boolean; /** Where "They asked to stop" is, from this page. */ stopWhere?: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [purpose, setPurpose] = useState<"service" | "marketing">("service");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string; body?: string } | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await phoneTextAction(contactId, { body, purpose });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: "Messages is opening with your text. Press send on your phone. It's logged here.", href: r.href, body: r.body });
      setBody("");
      if (refresh) router.refresh();
      window.location.href = r.href;
    } catch {
      setMsg({ ok: false, text: "That didn't work. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!msg?.body) return;
    try {
      await navigator.clipboard.writeText(msg.body);
      setMsg({ ...msg, text: "Copied. Paste it into Messages on your phone." });
    } catch {
      /* the text is shown below to select by hand */
    }
  }

  return (
    <form onSubmit={go} className="mlo-grid" id="phone-text">
      <label className="mlo-field">
        <span>Text {first || "them"} from my phone</span>
        <textarea rows={3} maxLength={maxLength} className="mlo-textarea" value={body} onChange={(e) => setBody(e.target.value)} required />
      </label>
      <div className="mlo-row-form">
        <select className="mlo-select" aria-label="What it's about" value={purpose} onChange={(e) => setPurpose(e.target.value === "marketing" ? "marketing" : "service")}>
          <option value="service">About their loan or account ({serviceOk ? "allowed now" : "not now"})</option>
          <option value="marketing">An offer or check-in ({marketingOk ? "allowed now" : "not now"})</option>
        </select>
        <button type="submit" className="mlo-btn" disabled={busy || !body.trim()}>{busy ? "Checking…" : "Open in Messages"}</button>
      </div>
      <p className="mlo-note">The same checks as any text, then Messages opens on your phone with it written; you press send, and it goes from your own number. Replies come to your phone. If they text STOP, press &ldquo;They asked to stop&rdquo; ({stopWhere}).</p>
      {msg ? (
        <div className={`mlo-flash ${msg.ok ? "mlo-flash--ok" : "mlo-flash--err"}`} role={msg.ok ? "status" : "alert"}>
          <p>{msg.text}</p>
          {msg.ok && msg.href ? (
            <p className="mlo-row-form" style={{ marginTop: 6 }}>
              <a href={msg.href} className="mlo-btn mlo-btn--ghost">Open Messages again</a>
              <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => void copy()}>Copy the text</button>
            </p>
          ) : null}
          {msg.ok && msg.body ? <p className="mlo-note" style={{ whiteSpace: "pre-wrap", userSelect: "all" }}>{msg.body}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
