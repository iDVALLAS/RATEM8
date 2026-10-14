import type { Metadata } from "next";
import CalcPage from "@/components/calc/CalcPage";
import AffordabilityCalc from "@/components/calc/AffordabilityCalc";
import { CALC_CONTENT } from "@/lib/content/calculators";

const c = CALC_CONTENT["affordability"];

export const metadata: Metadata = {
  title: c.metaTitle,
  description: c.metaDescription,
  alternates: { canonical: "/calculators/affordability" },
};

export default function Page() {
  return (
    <CalcPage slug="affordability">
      <AffordabilityCalc />
    </CalcPage>
  );
}
