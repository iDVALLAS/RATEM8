"use client";

import { useState } from "react";
import { createKeyAction } from "./actions";
import { TechSteps } from "../NotOnYet";

/**
 * Makes a connection key and shows it once (D6). D76: as one connection
 * address (the key rides in it), so a loan officer pastes a single thing
 * into Zapier or their vendor. The header form is in the owner's
 * technical steps.
 */
export default function KeyMaker({ endpoint, defaultLabel = "ARIVE", owner = false, button = "Make my connection address" }: { endpoint: string; what?: string; defaultLabel?: string; owner?: boolean; button?: string }) {
  const [label, setLabel] = useState(defaultLabel);
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const address = key ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}key=${key}` : "";
  return (
    <div className="mlo-grid">
      <div className="mlo-row-form">
        <input className="mlo-input" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Name for this connection" maxLength={60} />
        <button
          type="button"
          className="mlo-btn"
          onClick={async () => {
            const r = await createKeyAction(label);
            if ("key" in r) setKey(r.key);
            else setError(r.error);
          }}
        >
          {button}
        </button>
      </div>
      {error ? <p className="mlo-flash mlo-flash--err" role="alert">{error}</p> : null}
      {key ? (
        <div className="mlo-flash mlo-flash--ok" role="status">
          <p><strong>Copy this now; it won&apos;t be shown again.</strong> Keep it private, like a password.</p>
          <code className="mlo-code">{address}</code>
          <div className="mlo-actions">
            <button
              type="button"
              className="mlo-btn mlo-btn--ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy the address"}
            </button>
          </div>
          <TechSteps owner={owner}>
            <p className="mlo-note">For a system that takes a header instead: POST JSON to <code className="mlo-code">{endpoint}</code> with the header <code>X-CC-Key</code> set to <code className="mlo-code">{key}</code>.</p>
          </TechSteps>
        </div>
      ) : null}
    </div>
  );
}
