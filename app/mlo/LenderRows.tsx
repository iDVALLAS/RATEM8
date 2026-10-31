import type { LenderRecord } from "@/lib/pricing/lenders";

/** The lender result rows shared by scenario pricing and personal estimates (v37). */
export function LenderRows({ lenders, rows = 12, defaultFees, defaultProduct = "30-year fixed" }: { lenders: Pick<LenderRecord, "key" | "name">[]; rows?: number; defaultFees: string; defaultProduct?: string }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="mlo-row">
          <label className="mlo-field">Lender
            <select name={`r${i}.lender`} defaultValue="">
              <option value="">—</option>
              {lenders.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
            </select>
          </label>
          <label className="mlo-field">Product<input name={`r${i}.product`} defaultValue={defaultProduct} /></label>
          <label className="mlo-field">Result
            <select name={`r${i}.status`} defaultValue="eligible"><option value="eligible">Eligible</option><option value="ineligible">Not eligible</option></select>
          </label>
          <label className="mlo-field">Rate %<input name={`r${i}.rate`} inputMode="decimal" placeholder="6.250" /></label>
          <label className="mlo-field">Points %<input name={`r${i}.points`} inputMode="decimal" placeholder="0.500 or -0.250" /></label>
          <label className="mlo-field">Origination $<input name={`r${i}.orig`} inputMode="decimal" placeholder="0" /></label>
          <label className="mlo-field">Lender fees $<input name={`r${i}.fees`} inputMode="decimal" defaultValue={defaultFees} /></label>
          <label className="mlo-field">Lock days<input name={`r${i}.lock`} inputMode="numeric" defaultValue="30" /></label>
          <label className="mlo-field">IO months<input name={`r${i}.io`} inputMode="numeric" defaultValue="0" /></label>
          <div className="mlo-row__wide">
            <label className="mlo-field" style={{ flex: "1 1 100%" }}>Reason (if not eligible)<input name={`r${i}.reason`} /></label>
            {[["prepay", "Prepayment penalty"], ["balloon", "Balloon in first 7 years"], ["negam", "Negative amortization"], ["io", "Interest-only"], ["demand", "Demand feature"], ["shared", "Shared equity"]].map(([k, label]) => (
              <label key={k} className="mlo-check"><input type="checkbox" name={`r${i}.f.${k}`} />{label}</label>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
