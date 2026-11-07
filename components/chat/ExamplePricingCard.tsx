"use client";

import { copy } from "@/lib/copy";
import { fillMlo } from "@/lib/mlo-match";
import type { PricingCard } from "@/lib/m8/shared";
import { useNamedMlo } from "@/components/mlo/MloContext";

/**
 * ExamplePricingCard — today's priced example under an M8 reply (C7).
 *
 * Shows the three anti-steering options (lowest rate, lowest rate without
 * risky features, lowest points and origination) of the loan officer's
 * daily snapshot for a standard scenario close to the borrower's. Every
 * figure was computed on the server (lib/pricing/build.ts); this only
 * formats. Each rate sits next to its APR, the price date and time are
 * shown, and the card says it isn't a quote or a commitment to lend.
 */

const OPTION_LABEL = {
  lowest_rate: copy.pricing.cards.lowestRate,
  lowest_rate_no_risky_features: copy.pricing.cards.lowestNoRisk,
  lowest_points_and_fees: copy.pricing.cards.lowestCost,
} as const;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${n.toFixed(3)}%`;

export function pricedParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }),
  };
}

export default function ExamplePricingCard({ card }: { card: PricingCard }) {
  const t = copy.chat.live.example;
  const mlo = useNamedMlo();
  const { date, time } = pricedParts(card.pricedAt);
  const priced = (mlo ? fillMlo(t.pricedNamed, mlo) : t.priced).replace("{date}", date).replace("{time}", time);

  return (
    <section className="m8-example" aria-label={t.eyebrow}>
      <p className="m8-example__eyebrow">{t.eyebrow}</p>
      <p className="m8-example__title">
        {card.title} · {card.location}
      </p>
      <p className="m8-example__priced">{priced}</p>

      <ol className="m8-example__options">
        {card.options.map((o) => (
          <li key={o.option} className="m8-example__option">
            <div className="m8-example__head">
              <span className="m8-example__label">{OPTION_LABEL[o.option]}</span>
              <span className="m8-example__lender">{o.lender}</span>
            </div>
            <div className="m8-example__rates">
              <span>
                <b>{pct(o.rate)}</b> {t.rate}
              </span>
              <span>
                <b>{pct(o.apr)}</b> {t.apr}
              </span>
            </div>
            <p className="m8-example__line">
              {t.payment} {money(o.payment)}
              {t.perMonth}
              {o.mortgageInsurance ? ` · ${t.mi} ${money(o.mortgageInsurance)}${t.perMonth}` : ""}
            </p>
            <p className="m8-example__line m8-example__line--muted">
              {o.pointsPct > 0
                ? t.points.replace("{pct}", o.pointsPct.toFixed(3)).replace("{amount}", money(o.pointsDollars))
                : o.pointsPct < 0
                  ? t.credit.replace("{pct}", Math.abs(o.pointsPct).toFixed(3)).replace("{amount}", money(Math.abs(o.pointsDollars)))
                  : t.noPoints}
              {" · "}
              {t.fees.replace("{orig}", money(o.originationFee)).replace("{fees}", money(o.lenderFees))}
              {" · "}
              {t.lock.replace("{days}", String(o.lockDays))}
            </p>
            {o.risky ? <p className="m8-example__risky">{t.risky}</p> : null}
          </li>
        ))}
      </ol>

      <p className="m8-example__line m8-example__line--muted">{t.compared.replace("{n}", String(card.eligibleCount))}</p>
      <details className="m8-example__assumptions">
        <summary>{t.assumptions}</summary>
        <ul>
          {card.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
      <p className="m8-example__footer">{mlo ? fillMlo(t.footerNamed, mlo) : t.footer}</p>
    </section>
  );
}
