import ChatExperience from "@/components/ChatExperience";

export const metadata = {
  title: "M8 Chat — RateM8",
  description:
    "Preview the M8 conversation experience — anti-steering rate display, hold-period analysis, and a real licensed loan officer ready to close.",
  // Legacy URL during stealth. /demo is the canonical preview route.
  // Hidden by middleware while stealth is on; post-stealth, this can
  // either redirect to /demo or stand on its own as the chat surface.
  robots: { index: false, follow: false },
};

/**
 * /chat — legacy entry point that now renders the same shared
 * ChatExperience component used by /demo. v7 had the chat content
 * inlined here; v9 extracts it into a shared component so both
 * routes stay in sync without duplication.
 */
export default function ChatPage() {
  return <ChatExperience />;
}
