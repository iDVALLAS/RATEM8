"use client";

import { useState } from "react";
import { Icon } from "@/app/mlo/icons";

/**
 * D77: the header's Call. The contact rules are checked and the call is
 * logged on their conversation first, then the phone app opens with the
 * number (a plain tel: link without JavaScript).
 */
export default function CallButton({ tel, label, action }: { tel: string; label: string; action: () => Promise<{ ok: true; tel: string } | { ok: false; error: string }> }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <a
        className="cc-act"
        href={`tel:${tel}`}
        aria-busy={busy || undefined}
        onClick={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setMsg(null);
          const r = await action().catch(() => ({ ok: false as const, error: "Couldn't log the call. Try again." }));
          setBusy(false);
          if (r.ok) window.location.href = `tel:${r.tel}`;
          else setMsg(r.error);
        }}
      >
        <Icon name="phone" />
        <span>{label}</span>
      </a>
      {msg ? <p className="cc-contact-actions__msg" role="alert">{msg}</p> : null}
    </>
  );
}
