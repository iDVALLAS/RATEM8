"use client";

import { useId, useMemo, useState } from "react";
import Slider from "@/components/calc/Slider";
import MiniChart from "@/components/calc/MiniChart";
import { ResultCard, ResultRow } from "@/components/calc/ResultCard";
import { ShowWork, AssumptionsList, CalcDisclaimer } from "@/components/calc/ShowWork";
import { rentVsBuy } from "@/lib/calc";
import { formatDollars } from "@/lib/calc/format";
import { CALC_CONTENT } from "@/lib/content/calculators";

const content = CALC_CONTENT["rent-vs-buy"];

const fmtMoneyShort = (n: number) => {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  return a >= 1000 ? `${sign}$${Math.round(a / 1000)}k` : `${sign}$${Math.round(a)}`;
};

export default function RentVsBuyCalc() {
  const panelId = useId();
  const [panelOpen, setPanelOpen] = useState(false);

  // Core inputs
  const [monthlyRent, setMonthlyRent] = useState(2_200);
  const [homePrice, setHomePrice] = useState(450_000);
  const [downPaymentPct, setDownPaymentPct] = useState(10);
  const [rate, setRate] = useState(6.5);
  const [horizonYears, setHorizonYears] = useState(7);

  // Assumptions
  const [rentIncreasePct, setRentIncreasePct] = useState(3);
  const [propertyTaxPct, setPropertyTaxPct] = useState(1.0);
  const [insuranceAnnual, setInsuranceAnnual] = useState(1_500);
  const [maintenancePct, setMaintenancePct] = useState(1.0);
  const [hoaMonthly, setHoaMonthly] = useState(0);
  const [appreciationPct, setAppreciationPct] = useState(3);
  const [sellingCostPct, setSellingCostPct] = useState(6);
  const [buyingCosts, setBuyingCosts] = useState(8_000);
  const [investmentReturnPct, setInvestmentReturnPct] = useState(5);

  const r = useMemo(
    () =>
      rentVsBuy({
        monthlyRent,
        rentIncreasePct,
        homePrice,
        downPaymentPct,
        rate,
        propertyTaxPct,
        insuranceAnnual,
        maintenancePct,
        hoaMonthly,
        appreciationPct,
        sellingCostPct,
        buyingCosts,
        horizonYears: Math.max(1, Math.round(horizonYears)),
        investmentReturnPct,
      }),
    [
      monthlyRent,
      rentIncreasePct,
      homePrice,
      downPaymentPct,
      rate,
      propertyTaxPct,
      insuranceAnnual,
      maintenancePct,
      hoaMonthly,
      appreciationPct,
      sellingCostPct,
      buyingCosts,
      horizonYears,
      investmentReturnPct,
    ]
  );

  const ok = Number.isFinite(r.rentNetCost) && Number.isFinite(r.buyNetCost) && r.yearly.length > 0;
  const buyCheaper = ok && r.buyNetCost < r.rentNetCost;
  const gap = ok ? Math.abs(r.rentNetCost - r.buyNetCost) : 0;
  const yrs = Math.max(1, Math.round(horizonYears));

  const verdict = !ok
    ? "These inputs did not produce a result. Check that the home price and rent are above zero."
    : gap < 1
    ? `Over ${yrs} years the two paths net out about even on these assumptions.`
    : buyCheaper
    ? `Over ${yrs} years, buying nets ${formatDollars(gap)} cheaper than renting on these assumptions.`
    : `Over ${yrs} years, renting nets ${formatDollars(gap)} cheaper than buying on these assumptions.`;

  const breakevenText = r.breakevenYear === null ? "Not within horizon" : `Year ${r.breakevenYear}`;
  const breakevenPoint = r.breakevenYear !== null ? r.yearly.find((y) => y.year === r.breakevenYear) : undefined;

  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <p className="principle-label">Your situation</p>
        <Slider label="Monthly rent" value={monthlyRent} onChange={setMonthlyRent} min={300} max={10_000} step={50} prefix="$" hint="What you pay now, or would pay." />
        <Slider label="Home price" value={homePrice} onChange={setHomePrice} min={50_000} max={2_500_000} step={5_000} prefix="$" />
        <Slider label="Down payment" value={downPaymentPct} onChange={setDownPaymentPct} min={0} max={100} step={1} suffix="%" hint={`${formatDollars(homePrice * (downPaymentPct / 100))} of the price.`} />
        <Slider label="Your rate — enter your own" value={rate} onChange={setRate} min={0} max={15} step={0.125} suffix="%" hint="From your quote. LoanM8 does not display rates." />
        <Slider label="Horizon" value={horizonYears} onChange={setHorizonYears} min={1} max={30} step={1} suffix="yrs" hint="How long you expect to stay before selling." />

        <div className={`calc-panel ${panelOpen ? "is-open" : ""}`}>
          <button type="button" className="calc-panel__toggle" aria-expanded={panelOpen} aria-controls={panelId} onClick={() => setPanelOpen((v) => !v)}>
            <span>
              <span className="principle-label">Assumptions panel</span>
              <span className="block text-xs mt-1 font-light" style={{ color: "var(--muted)" }}>
                Nine dials that move the answer. None are forecasts.
              </span>
            </span>
          </button>
          <div id={panelId} className="calc-panel__body">
            <Slider label="Rent increase per year" value={rentIncreasePct} onChange={setRentIncreasePct} min={0} max={10} step={0.5} suffix="%" />
            <Slider label="Home appreciation per year" value={appreciationPct} onChange={setAppreciationPct} min={-5} max={10} step={0.5} suffix="%" hint="Not a forecast. Try zero." />
            <Slider label="Property tax" value={propertyTaxPct} onChange={setPropertyTaxPct} min={0} max={4} step={0.05} suffix="% / yr" hint="Of home value, per year." />
            <Slider label="Homeowners insurance" value={insuranceAnnual} onChange={setInsuranceAnnual} min={0} max={10_000} step={100} prefix="$" suffix="/ yr" />
            <Slider label="Maintenance" value={maintenancePct} onChange={setMaintenancePct} min={0} max={4} step={0.25} suffix="% / yr" hint="Of home value, per year." />
            <Slider label="HOA" value={hoaMonthly} onChange={setHoaMonthly} min={0} max={1_500} step={25} prefix="$" suffix="/ mo" />
            <Slider label="Selling costs" value={sellingCostPct} onChange={setSellingCostPct} min={0} max={12} step={0.5} suffix="%" hint="Of the sale price: agent fees, transfer taxes, concessions." />
            <Slider label="Buying costs" value={buyingCosts} onChange={setBuyingCosts} min={0} max={40_000} step={500} prefix="$" hint="Closing costs paid once when you buy." />
            <Slider label="Renter's investment return" value={investmentReturnPct} onChange={setInvestmentReturnPct} min={0} max={12} step={0.5} suffix="% / yr" hint="Earned on the down payment and buying costs the renter keeps." />
          </div>
        </div>
      </div>

      <div className="calc-results calc-grid__results">
        <div className="calc-results" aria-live="polite" aria-atomic="true">
          <ResultCard title={`Net cost after ${yrs} years`} highlight={buyCheaper}>
            <ResultRow label="Renting, net" value={ok ? formatDollars(r.rentNetCost) : "—"} hint="Rent paid minus investment growth" emphasis={!buyCheaper && ok} />
            <ResultRow label="Buying, net" value={ok ? formatDollars(r.buyNetCost) : "—"} hint="Cash out minus equity after selling" emphasis={buyCheaper} />
            <ResultRow label="Break-even" value={ok ? breakevenText : "—"} hint="First year buying nets cheaper" />
          </ResultCard>
          <p className="calc-note">{verdict}</p>
          <ResultCard title="Under the hood">
            <ResultRow label="Total rent paid" value={ok ? formatDollars(r.totalRentPaid) : "—"} />
            <ResultRow label="Total cash out to own" value={ok ? formatDollars(r.totalOwnershipOutlay) : "—"} hint="Down payment, buying costs, payments, tax, insurance, maintenance, HOA" />
            <ResultRow label="Home value at horizon" value={ok ? formatDollars(r.homeValueAtHorizon) : "—"} />
            <ResultRow label="Equity after selling" value={ok ? formatDollars(r.equityAtSale) : "—"} />
          </ResultCard>
        </div>

        <ResultCard title="Net cost by year">
          <MiniChart
            series={[
              { name: "Buying, net", points: r.yearly.map((y) => ({ x: y.year, y: y.buyNet })) },
              { name: "Renting, net", points: r.yearly.map((y) => ({ x: y.year, y: y.rentNet })) },
            ]}
            formatX={(x) => `Yr ${Math.round(x)}`}
            formatY={fmtMoneyShort}
            xLabel="Year"
            yLabel="Net cost"
            marker={breakevenPoint ? { x: breakevenPoint.year, y: breakevenPoint.buyNet, label: `Break-even, year ${breakevenPoint.year}` } : null}
            ariaLabel="Net cost of buying and of renting at the end of each year over the horizon, with the break-even year marked if buying becomes cheaper"
            caption="Lower is cheaper. A negative net cost means that path came out ahead of what was paid in."
            tableRows={Math.min(8, r.yearly.length)}
          />
        </ResultCard>

        <CalcDisclaimer />
        <ShowWork formulas={content.formulas} notes={content.formulaNotes} assumptions={r.assumptions} />
        <AssumptionsList assumptions={r.assumptions} />
      </div>
    </div>
  );
}
