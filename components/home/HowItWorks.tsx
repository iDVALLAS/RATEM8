import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";
import HowItWorksScene from "./HowItWorksScene";

/**
 * HowItWorks — three steps for borrowers, as a dashed-to-filled Scene.
 * Server wrapper: heading here, motion in HowItWorksScene.
 */
export default function HowItWorks() {
  return (
    <section className="hm-rule hm-section" aria-labelledby="how-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <div className="eyebrow">{copy.how.eyebrow}</div>
          <h2 id="how-heading" className="hm-h2 mt-4">
            {copy.how.heading}
          </h2>
        </div>
        <div className="mt-10">
          <HowItWorksScene
            steps={copy.how.steps.map((s) => ({ n: s.n, label: s.label, title: s.title, body: s.body }))}
            sceneLabel={homeContent.how.sceneLabel}
            counter={`${String(copy.how.steps.length).padStart(2, "0")} / ${homeContent.how.counterTotal}`}
            slotLabels={homeContent.how.slotLabels}
            textEquivalent={homeContent.how.textEquivalent}
          />
        </div>
      </div>
    </section>
  );
}
