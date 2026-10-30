import M8ChatPage from "@/components/m8chat/M8ChatPage";
import PageShell from "@/components/PageShell";
import ChatShell from "@/components/chat/ChatShell";
import { copy } from "@/lib/copy";

export const metadata = {
  title: "M8 Chat — LoanM8",
  description:
    "Preview the M8 conversation experience — anti-steering rate display, hold-period analysis, and a real licensed loan officer ready to close.",
  robots: { index: false, follow: false },
};

/**
 * /chat — the M8 chat (v33 redesign, <M8ChatPage />), showing the scripted
 * Sarah / Bellevue refi conversation until real pricing and live M8 land.
 * It is where the homepage "I'm shopping a mortgage" button and the hero
 * Voice button (/chat?voice=1) go. /demo keeps the old <ChatExperience />
 * until L3 removes it.
 *
 * /chat?prep=1 is the v18 "Prep my application with M8" flow, which
 * keeps its AI disclosure gate (<ChatShell prep />).
 *
 * No model call here: live M8 is only the flagged tab on /demo.
 */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ prep?: string }> }) {
  const { prep } = await searchParams;
  if (prep !== "1") return <M8ChatPage />;
  return (
    <PageShell
      crumbs={[
        { name: "Home", path: "/" },
        { name: copy.chat.title, path: "/chat" },
      ]}
    >
      <ChatShell prep />
    </PageShell>
  );
}
