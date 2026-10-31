import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import BookingCTA from "@/components/BookingCTA";
import PricingDisplay from "@/components/pricing/PricingDisplay";
import { CONFIG, isPlaceholder, mloById, RATE_DISCLAIMER_BODY, RATE_DISCLAIMER_LEAD } from "@/lib/config";
import { quotesCopy } from "@/lib/content/quotes";
import { stateOfficerLine } from "@/lib/licensing";
import { scenarioLine, loanAmount } from "@/lib/quotes/scenario";
import { disclaimerFor, keyValid } from "@/lib/quotes/service";
import { isQuoteId, loadQuote } from "@/lib/quotes/store";

/**
 * /estimate/{id}?k={key} — a borrower's approved personal estimate (v37).
 * The key comes from the email (an HMAC of the id); without it the page
 * is a 404, so ids can't be guessed into estimates. Never indexed.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your estimate", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> };

const t = quotesCopy.estimate;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default async function EstimatePage({ params, searchParams }: Props) {
  const [{ id }, { k }] = await Promise.all([params, searchParams]);
  if (!CONFIG.pricing.personalQuotes || !isQuoteId(id) || !keyValid(id, k)) notFound();
  const q = await loadQuote(id);
  if (!q) notFound();
  const s = q.requested.scenario;
  const mlo = mloById(q.approved?.mloId ?? q.requested.mloId);
  const loan = loanAmount(s);

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <p className="eyebrow mb-2">{`// ${t.title} · ${q.id}`}</p>
        <h1 className="tagline text-3xl sm:text-5xl leading-tight mb-3">{scenarioLine(s).split(" · ").slice(0, 2).join(" · ")}</h1>
        <p className="mb-6" style={{ color: "var(--muted)" }}>{scenarioLine(s)}</p>

        {q.status === "approved" && q.priced ? (
          <>
            {q.approved?.note ? (
              <section className="card mb-6" aria-label={t.noteLead}>
                <p className="eyebrow mb-1">{t.noteLead}</p>
                <p style={{ color: "var(--fg)" }}>{q.approved.note}</p>
              </section>
            ) : null}
            <p className="mb-4 text-sm" role="note" style={{ color: "var(--fg)" }}>
              <strong style={{ fontWeight: 500 }}>{disclaimerFor(q)}</strong>
            </p>
            <PricingDisplay display={{ run: q.priced.run, mode: "snapshot", notes: [] }} />
            <ul className="mt-4 text-sm" style={{ color: "var(--fg-soft)" }}>
              <li>{fill(t.lenderFees, { uw: usd(CONFIG.pricing.fees.underwriting), proc: usd(CONFIG.pricing.fees.processing) })}</li>
              <li>{fill(t.closing, { pct: String(CONFIG.pricing.closingCostPct), amount: usd((loan * CONFIG.pricing.closingCostPct) / 100) })}</li>
            </ul>
            <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>{RATE_DISCLAIMER_LEAD} {RATE_DISCLAIMER_BODY}</p>
          </>
        ) : (
          <p className="card">{q.status === "rejected" ? t.rejected : t.pending}</p>
        )}

        {mlo ? (
          <section className="card mt-8 flex flex-wrap items-center gap-4" aria-label="Your loan officer">
            {!isPlaceholder(mlo.photo) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mlo.photo} alt="" width={64} height={64} style={{ borderRadius: "9999px", objectFit: "cover" }} />
            ) : null}
            <div style={{ flex: "1 1 16rem" }}>
              <p style={{ color: "var(--fg)" }}>{mlo.name}</p>
              <p className="text-sm" style={{ color: "var(--fg-soft)" }}>{stateOfficerLine(mlo, q.requested.state)}</p>
            </div>
            <BookingCTA kind="borrower" intake={false}>{t.book}</BookingCTA>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
