"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";

/**
 * ReferralTracker — records which AI assistant (if any) sent the visitor.
 *
 * Sends ONE custom event per page load to Vercel Analytics with the
 * referrer host bucketed to a known list. No PII, no cookies, no
 * fingerprinting. Documented in docs/ai-visibility-checklist.md.
 */
const AI_HOSTS: Record<string, string> = {
  "chatgpt.com": "chatgpt",
  "chat.openai.com": "chatgpt",
  "perplexity.ai": "perplexity",
  "www.perplexity.ai": "perplexity",
  "claude.ai": "claude",
  "gemini.google.com": "gemini",
  "copilot.microsoft.com": "copilot",
  "www.bing.com": "bing",
  "duckduckgo.com": "duckduckgo",
};

export default function ReferralTracker() {
  useEffect(() => {
    try {
      const ref = document.referrer;
      if (!ref) return;
      const host = new URL(ref).hostname;
      const source = AI_HOSTS[host];
      if (source) {
        track("ai_referral", { source, path: window.location.pathname });
      }
      const agentOrigin = new URLSearchParams(window.location.search).get("agent");
      if (agentOrigin && /^[a-z0-9_-]{1,40}$/i.test(agentOrigin)) {
        track("agent_origin", { agent: agentOrigin.toLowerCase(), path: window.location.pathname });
      }
    } catch {
      /* never break the page for analytics */
    }
  }, []);
  return null;
}
