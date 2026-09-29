import type { Metadata } from "next";
import CalcPage from "@/components/calc/CalcPage";
import PointsBreakevenCalc from "@/components/calc/PointsBreakevenCalc";
import { CALC_CONTENT } from "@/lib/content/calculators";

const c = CALC_CONTENT["points-breakeven"];

export const metadata: Metadata = {
  title: c.metaTitle,
  description: c.metaDescription,
  alternates: { canonical: "/calculators/points-breakeven" },
};

export default function Page() {
  return (
    <CalcPage slug="points-breakeven">
      <PointsBreakevenCalc />
    </CalcPage>
  );
}
