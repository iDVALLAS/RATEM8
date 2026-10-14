import { Sheet } from "@/components/motion/Stage";
import SceneLabel from "@/components/motion/SceneLabel";
import SlideHeadline, { splitLines } from "@/components/motion/SlideHeadline";
import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";
import HowItWorksSteps from "./HowItWorksSteps";
import { MloText } from "@/components/mlo/MloContext";

/**
 * HowItWorks — three steps for borrowers as a forest sheet on the
 * stage: slide headline, then a scroll-driven step list with the orb
 * and a tiny brief card pinned beside it. Server wrapper; the step
 * list is in HowItWorksSteps. Under the steps, the "Less overhead.
 * Lower costs." band (v19).
 */
export default function HowItWorks() {
  const how = homeContent.how;
  return (
    <Sheet chapter="forest" className="hm-sheet" aria-labelledby="how-heading">
      <SceneLabel label={how.sceneLabel} counter={`${String(copy.how.steps.length).padStart(2, "0")} / ${how.counterTotal}`} />
      <p className="sr-only">{how.textEquivalent}</p>
      <div className="hm-sheet__inner sheet-fill mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <div className="eyebrow">{copy.how.eyebrow}</div>
          <SlideHeadline id="how-heading" as="h2" lines={splitLines(copy.how.heading)} accent={how.accent} dim className="hm-h2 mt-4" />
        </div>
        <HowItWorksSteps
          steps={copy.how.steps.map((s) => ({ label: s.label, title: s.title, body: "bodyNamed" in s ? <MloText generic={s.body} named={s.bodyNamed} /> : s.body }))}
          ariaLabel={how.listLabel}
          orbPrefix={how.orbPrefix}
        />
        {/* v19 (Item 3a): a short band under the steps. Cost structure only; no rate claim. */}
        <div className="hm-savings">
          <div>
            <div className="code-label">{copy.savings.eyebrow}</div>
            <SlideHeadline id="savings-heading" as="h3" lines={splitLines(copy.savings.heading)} accent={copy.savings.accent} className="hm-savings__h mt-3" />
          </div>
          <p className="hm-sub hm-savings__body">{copy.savings.body}</p>
        </div>
      </div>
    </Sheet>
  );
}
