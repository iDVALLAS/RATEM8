import type { Metadata } from "next";
import CalcPage from "@/components/calc/CalcPage";
import RefinanceBreakevenCalc from "@/components/calc/RefinanceBreakevenCalc";
import { CALC_CONTENT } from "@/lib/content/calculators";

const c = CALC_CONTENT["refinance-breakeven"];

export const metadata: Metadata = {
  title: c.metaTitle,
  description: c.metaDescription,
  alternates: { canonical: "/calculators/refinance-breakeven" },
};

export default function Page() {
  return (
    <CalcPage slug="refinance-breakeven">
      <RefinanceBreakevenCalc />
    </CalcPage>
  );
}
