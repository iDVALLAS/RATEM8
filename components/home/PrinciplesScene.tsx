"use client";

import Scene from "@/components/motion/Scene";
import PrincipleCard from "@/components/PrincipleCard";
import { seq } from "@/lib/useSceneTimeline";
import type { Principle } from "@/lib/principles";

/**
 * PrinciplesScene — the eight, laid out as an op-ed page: an
 * asymmetric grid on desktop, one column on a phone. Cards step in one
 * at a time (120 ms apart) when the section enters the viewport.
 */
type PrinciplesSceneProps = {
  principles: Principle[];
  listLabel: string;
  label: string;
  counterTotal: string;
  textEquivalent: string;
};

/** Desktop column spans for an 8-card op-ed layout (6-column grid). */
const SPANS = ["hm-p--w4", "hm-p--w2", "hm-p--w2", "hm-p--w4", "hm-p--w3", "hm-p--w3", "hm-p--w4", "hm-p--w2"];

const STEPS = seq(0, 120, 8);

export default function PrinciplesScene({ principles, listLabel, label, counterTotal, textEquivalent }: PrinciplesSceneProps) {
  return (
    <Scene label={label} steps={STEPS} textEquivalent={textEquivalent} className="hm-principles-scene" counter={`${counterTotal} / ${counterTotal}`}>
      {({ step }) => (
        <ol className="hm-principles__grid list-none p-0 m-0 px-4 sm:px-6 pb-4" aria-label={listLabel}>
          {principles.map((p, i) => (
            <li key={p.number} className={`step-in ${step >= i ? "is-on" : ""} ${SPANS[i] ?? ""}`}>
              <PrincipleCard number={p.number} title={p.title} body={p.body} accent={p.accent} />
            </li>
          ))}
        </ol>
      )}
    </Scene>
  );
}
