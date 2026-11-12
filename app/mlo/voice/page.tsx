import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { mloContent } from "@/lib/content/mlo";
import { listTenants } from "@/lib/pricing/tenants";
import { availableCandidates, currentVoice, SAMPLE_LINE, voiceOn } from "@/lib/voice/google";
import { saveVoiceAction } from "../actions";
import { FlashBox, MloNav } from "../MloChrome";
import VoicePicker from "./VoicePicker";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "M8 voice", robots: { index: false, follow: false } };

/**
 * /mlo/voice — the owner picks M8's voice (C15). M8 has its own voice,
 * never a person's: these are Google's stock voices.
 */
export default async function MloVoice({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const tenant = listTenants()[0];
  const on = voiceOn();
  const [voices, current] = on ? await Promise.all([availableCandidates(), currentVoice()]) : [[], ""];

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">{mloContent.title}</p>
        <h1 className="tagline text-4xl">{mloContent.nav.voice}</h1>
        <MloNav current="voice" tenantId={tenant.id} />
        <FlashBox flash={decodeFlash(f)} />
        {!on ? (
          <section className="mlo-section">
            <p className="mlo-note">
              Voice is off. It turns on when GOOGLE_CLOUD_API_KEY is set in Vercel (and M8_VOICE isn&apos;t &quot;false&quot;), then redeploy.
            </p>
          </section>
        ) : (
          <section className="mlo-section">
            <h2>Pick M8&apos;s voice</h2>
            <p className="mlo-note">
              Each voice reads the same line: &ldquo;{SAMPLE_LINE}&rdquo; Borrowers hear the one you choose when they turn on &ldquo;Read replies aloud&rdquo; in the chat, or tap Listen under a reply.
            </p>
            <VoicePicker voices={voices} current={current} action={saveVoiceAction} />
          </section>
        )}
      </div>
    </PageShell>
  );
}
