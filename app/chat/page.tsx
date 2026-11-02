import M8LiveChat from "@/components/M8LiveChat";
import PageShell from "@/components/PageShell";
import ChatShell from "@/components/chat/ChatShell";
import { copy } from "@/lib/copy";
import { RETENTION, storageOn } from "@/lib/m8/store";

export const metadata = {
  title: "M8 Chat — LoanM8",
  description:
    "Ask M8, an AI built for mortgages, how a loan works, what you can afford or what your Loan Estimate means. A licensed loan officer verifies every recommendation.",
  // C5 opens indexing (robots and sitemap) at launch.
  robots: { index: false, follow: false },
};

/**
 * /chat — the live M8 chat (C1, owner 2026-11-01). Public even while the
 * rest of the site is in stealth (middleware.ts). The scripted Sarah demo
 * and the scripted/live tabs are gone.
 *
 * /chat?prep=1 is still the v18 "Prep my application with M8" flow, which
 * keeps its own AI disclosure gate (<ChatShell prep />).
 */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ prep?: string }> }) {
  const { prep } = await searchParams;
  const crumbs = [
    { name: "Home", path: "/" },
    { name: copy.chat.title, path: "/chat" },
  ];
  if (prep === "1") {
    return (
      <PageShell crumbs={crumbs}>
        <ChatShell prep />
      </PageShell>
    );
  }
  return (
    <PageShell mainClassName="live-chat-main">
      <h1 className="sr-only">{copy.chat.title}</h1>
      <div className="live-chat-frame">
        <M8LiveChat storageOn={storageOn()} retention={RETENTION} />
      </div>
    </PageShell>
  );
}
