import M8ChatPage from "@/components/m8chat/M8ChatPage";
import PageShell from "@/components/PageShell";
import ChatShell from "@/components/chat/ChatShell";
import DemoPasswordGate from "@/components/DemoPasswordGate";
import M8LiveChat from "@/components/M8LiveChat";
import QuoteFlow from "@/components/chat/QuoteFlow";
import { AI_DISCLOSURE, CONFIG, STATE_NAMES_LINE } from "@/lib/config";
import { copy } from "@/lib/copy";
import { isTesterAuthed } from "@/lib/preview-auth";

const baseMetadata = {
  title: "M8 Chat — LoanM8",
  description: "Talk to M8, an AI built for mortgages, and reach your licensed loan officer.",
};

/**
 * /chat — the M8 chat (<M8ChatPage />). Where the homepage "I'm shopping a
 * mortgage" button and the hero Voice button (/chat?voice=1) go.
 *
 * /chat?prep=1 — the "Prep my application with M8" flow (<ChatShell prep />).
 *
 * /chat?quote=1 — v37 (L4) M8 quote mode (<QuoteFlow />), behind
 * PERSONAL_QUOTES: M8 collects the scenario for a personal estimate.
 *
 * /chat?preview=1 — L3's hidden QA flag (was /demo): the tester password,
 * then two-way chat with M8 (<M8LiveChat />) when M8_LIVE_CHAT is on and a
 * model key is set. Never linked, never indexed.
 */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ prep?: string; preview?: string; quote?: string }> }) {
  const { prep, preview, quote } = await searchParams;
  if (quote === "1" && CONFIG.pricing.personalQuotes) {
    return (
      <PageShell crumbs={[{ name: "Home", path: "/" }, { name: "Rates", path: "/rates" }, { name: copy.chat.title, path: "/chat?quote=1" }]}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
          <h1 className="tagline text-3xl sm:text-5xl leading-tight mb-2">{copy.pricing.estimateCta}</h1>
          <p className="mb-6 text-sm" role="note" style={{ color: "var(--fg-soft)" }}>{AI_DISCLOSURE} {copy.quoteMode.disclosure}</p>
          <QuoteFlow statesLine={STATE_NAMES_LINE} />
        </div>
      </PageShell>
    );
  }
  if (preview === "1") {
    if (!(await isTesterAuthed())) return <DemoPasswordGate contactEmail={CONFIG.demoContactEmail} />;
    return (
      <PageShell>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
          {CONFIG.featureFlags.demoLiveChat ? <M8LiveChat /> : <p className="card">{copy.m8chat.previewOff}</p>}
        </div>
      </PageShell>
    );
  }
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

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  return preview === "1" ? { ...baseMetadata, robots: { index: false, follow: false } } : baseMetadata;
}
