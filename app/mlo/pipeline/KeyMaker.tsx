"use client";

import { useState } from "react";
import { createKeyAction } from "./actions";

/** Makes an intake key and shows it once (D6). */
export default function KeyMaker({ endpoint }: { endpoint: string }) {
  const [label, setLabel] = useState("ARIVE");
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mlo-grid">
      <div className="mlo-row-form">
        <input className="mlo-input" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Name for this connection" maxLength={60} />
        <button
          type="button"
          className="mlo-btn"
          style={{ marginTop: 0 }}
          onClick={async () => {
            const r = await createKeyAction(label);
            if ("key" in r) setKey(r.key);
            else setError(r.error);
          }}
        >
          Make a connection key
        </button>
      </div>
      {error ? <p className="mlo-flash mlo-flash--err" role="alert">{error}</p> : null}
      {key ? (
        <div className="mlo-flash mlo-flash--ok" role="status">
          <p><strong>Copy this now; it won&apos;t be shown again.</strong></p>
          <p className="mlo-note">Send loan updates (POST, JSON) to:</p>
          <code className="mlo-code">{endpoint}</code>
          <p className="mlo-note">with the header <code>X-CC-Key</code> set to:</p>
          <code className="mlo-code">{key}</code>
          <p className="mlo-note">If your loan system only takes a web address, use: <code className="mlo-code">{`${endpoint}?key=${key}`}</code></p>
        </div>
      ) : null}
    </div>
  );
}
