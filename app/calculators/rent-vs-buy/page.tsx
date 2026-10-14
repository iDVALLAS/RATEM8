import type { Metadata } from "next";
import CalcPage from "@/components/calc/CalcPage";
import RentVsBuyCalc from "@/components/calc/RentVsBuyCalc";
import { CALC_CONTENT } from "@/lib/content/calculators";

const c = CALC_CONTENT["rent-vs-buy"];

export const metadata: Metadata = {
  title: c.metaTitle,
  description: c.metaDescription,
  alternates: { canonical: "/calculators/rent-vs-buy" },
};

export default function Page() {
  return (
    <CalcPage slug="rent-vs-buy">
      <RentVsBuyCalc />
    </CalcPage>
  );
}
