import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { checklist, GROUP_LABELS, type SetupItem } from "@/lib/setup/checklist";
import Chat from "./Chat";
import "../mlo.css";
import "./setup-help.css";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Setup assistant", robots: { index: false, follow: false } };

/** /mlo/setup-help?topic= — the AI setup assistant beside the live checklist (D50). */
export default async function SetupHelp({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  if (!me) {
    return (
      <PageShell>
        <div className="mlo-wrap"><h1 className="tagline text-4xl">Setup assistant</h1><p className="mlo-note"><Link href="/sign-in">Sign in with your email</Link> to use it.</p></div>
      </PageShell>
    );
  }
  const items = await checklist(me);
  const pick = topic ? items.find((i) => i.id === topic) : undefined;
  const firstAsk = pick && !pick.done ? `Help me with this step: ${pick.label}.` : topic === "texting" ? "Help me set up texting with Twilio." : null;
  const done = items.filter((i) => i.done).length;
  const groups = (Object.keys(GROUP_LABELS) as SetupItem["group"][]).filter((g) => items.some((i) => i.group === g));
  return (
    <PageShell>
      <div className="mlo-wrap sh-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Setup assistant</h1>
        <div className="sh-grid">
          <section className="mlo-section sh-main" aria-label="Chat with the setup assistant">
            <Chat firstAsk={firstAsk} topic={topic ?? null} />
          </section>
          <aside className="mlo-section sh-side" aria-label="Your setup">
            <h2>Your setup · {done} of {items.length}</h2>
            <div className="jr-progress" style={{ margin: "8px 0 12px" }}><span style={{ width: `${Math.round((done / items.length) * 100)}%` }} /></div>
            {groups.map((g) => (
              <div key={g} className="sh-group">
                <p className="eyebrow">{GROUP_LABELS[g]}</p>
                <ul>
                  {items.filter((i) => i.group === g).map((i) => (
                    <li key={i.id} className={i.done ? "is-done" : ""}>
                      <span aria-hidden="true" className="sh-dot">{i.done ? "✓" : ""}</span>
                      <span>{i.done ? i.label : <Link href={`/mlo/setup-help?topic=${i.id}`}>{i.label}</Link>}<span className="sr-only">{i.done ? " (done)" : " (to do)"}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mlo-note">Refresh the page to update this list. The assistant always reads it fresh.</p>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
