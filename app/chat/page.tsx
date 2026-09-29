import PageShell from "@/components/PageShell";
import ChatShell from "@/components/chat/ChatShell";
import { copy } from "@/lib/copy";

export const metadata = {
  title: "M8 Chat — LoanM8",
  description:
    "Talk with M8, LoanM8's AI. It explains how a mortgage works; a licensed loan officer verifies every deal. Scripted demo until live chat opens.",
};

/**
 * /chat — the public M8 chat shell. UI only.
 *
 * Disclosure gate first, then the orb, the scripted demo, the disabled
 * input, the booking CTA, and the disabled voice modal. No model call
 * while CONFIG.featureFlags.chatLiveAi is false.
 */
export default function ChatPage() {
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: copy.chat.title, path: "/chat" },
      ]}
    >
      <ChatShell />
    </PageShell>
  );
}
