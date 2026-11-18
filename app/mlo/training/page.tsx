import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/mlo/page-auth";
import PageShell from "@/components/PageShell";
import { decodeFlash } from "@/lib/mlo/flash";
import { mloContent } from "@/lib/content/mlo";
import { listTenants } from "@/lib/pricing/tenants";
import { getStore } from "@/lib/pricing/store";
import { OWNER_RULES, TRAINING_MAX_CHARS, TRAINING_SETTINGS_ID } from "@/lib/prompts/m8-owner";
import { saveTrainingAction } from "../actions";
import { FlashBox, MloNav } from "../MloChrome";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "M8 training", robots: { index: false, follow: false } };

/**
 * /mlo/training — the owner's notes for M8 (C19): what to say, where to
 * send people, how the business works. Added after M8's production prompt
 * on every chat; the prompt's compliance rules still win.
 */
export default async function MloTraining({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireAdminPage();
  const { f } = await searchParams;
  const tenant = listTenants()[0];
  const store = getStore();
  const current = await store.latestSettings(TRAINING_SETTINGS_ID).catch(() => null);

  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">{mloContent.title}</p>
        <h1 className="tagline text-4xl">{mloContent.nav.training}</h1>
        <MloNav current="training" tenantId={tenant.id} />
        <FlashBox flash={decodeFlash(f)} />
        {!store.writable ? <div className="mlo-flash mlo-flash--err" role="alert">{store.reason}</div> : null}

        <section className="mlo-section">
          <h2>Your notes for M8</h2>
          <p className="mlo-note">
            Write plainly, the way you&apos;d brief a new assistant: what to say, what not to say, where to send people, how you work. M8 reads this on every chat
            (typed and voice) from the next message. Its compliance rules still win: it won&apos;t quote rates outside a pricing result, promise approval, or drop the
            disclosures, whatever this says. Don&apos;t paste borrower information here.
          </p>
          <form action={saveTrainingAction}>
            <textarea
              name="training"
              className="mlo-textarea"
              rows={18}
              maxLength={TRAINING_MAX_CHARS}
              defaultValue={current?.trainingText ?? ""}
              placeholder={"Examples:\n- When someone asks about a HELOC, explain it plainly and offer the box to call me.\n- We don't do reverse mortgages; say so and suggest they ask a HUD-approved counselor.\n- If someone is buying with an agent, ask for the agent's name."}
            />
            <p className="mlo-note">
              Up to {TRAINING_MAX_CHARS.toLocaleString("en-US")} characters.
              {current ? ` Last saved by ${current.updatedBy}, version ${current.version}.` : ""}
            </p>
            <button type="submit" className="mlo-btn">
              Save training
            </button>
          </form>
        </section>

        <section className="mlo-section">
          <h2>Standing rules (built in)</h2>
          <p className="mlo-note">From your review of the 2026-11-16 test chat. M8 also gets the time of day so it knows whether calls are open.</p>
          <pre className="mlo-pre">{OWNER_RULES.trim()}</pre>
        </section>
      </div>
    </PageShell>
  );
}
