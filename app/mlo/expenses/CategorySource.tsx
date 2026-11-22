"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_KEYS, type Category } from "@/lib/expenses/categories";
import { isLeadSpendCategory } from "@/lib/leads/source-key";
import SourcePicker, { type PickerOption } from "../SourcePicker";

/**
 * D83: an expense's category, and its Lead source on lines that can be lead
 * spend (ads, lead software, cards and postage, closing gifts). The source
 * is pre-selected when the vendor or the words named one; the loan officer
 * confirms or changes it.
 */
export default function CategorySource({ category, leadSource, options }: { category: Category; leadSource: string | null; options: PickerOption[] }) {
  const [cat, setCat] = useState<string>(category);
  return (
    <>
      <label className="mlo-field"><span>Category</span>
        <select name="category" value={cat} onChange={(e) => setCat(e.target.value)} className="mlo-select">
          {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORIES[k].label} (line {CATEGORIES[k].line})</option>)}
        </select>
      </label>
      {isLeadSpendCategory(cat) ? <SourcePicker options={options} defaultValue={leadSource} none /> : null}
    </>
  );
}
