import type { Metadata } from "next";
import CalcPage from "@/components/calc/CalcPage";
import TemporaryBuydownCalc from "@/components/calc/TemporaryBuydownCalc";
import { CALC_CONTENT } from "@/lib/content/calculators";

const c = CALC_CONTENT["temporary-buydown"];

export const metadata: Metadata = {
  title: c.metaTitle,
  description: c.metaDescription,
  alternates: { canonical: "/calculators/temporary-buydown" },
};

export default function Page() {
  return (
    <CalcPage slug="temporary-buydown">
      <TemporaryBuydownCalc />
    </CalcPage>
  );
}
