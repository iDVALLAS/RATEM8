"use client";

import Scene from "@/components/motion/Scene";
import Stage from "@/components/motion/Stage";
import SlideHeadline, { splitLines } from "@/components/motion/SlideHeadline";
import Orb from "@/components/Orb";
import { principles, PRINCIPLES_VERSION } from "@/lib/principles";
import { copy } from "@/lib/copy";
import { seq } from "@/lib/useSceneTimeline";
import "./principles.css";

/**
 * PrinciplesManifesto — eight stacked sheets on the ambient stage, one
 * principle per viewport. Each sheet is a Scene with the mono
 * "// 01 of 08" label, the locked title as a SlideHeadline (accent
 * phrase in M8 Green, the rest at --fg-soft), the locked body line,
 * then the (unlocked) expansion. Chapters cycle night → forest → paper
 * so each sheet sliding over the last reads as a new chapter.
 *
 * The ambient Orb stays fixed on desktop so it "travels" with the
 * reader; it is decorative (aria-hidden inside Orb) and idle.
 */
const BACKGROUNDS = ["night", "forest", "paper"] as const;
const STEPS = seq(0, 250, 3);

function textEquivalent(n: number, title: string, body: string, expansion: string): string {
  const head = `Principle ${n} of ${principles.length}: ${title}`;
  return [head, body, expansion].filter(Boolean).join(" ") + " The title fades in word by word, then the body line and the explanation appear beneath it.";
}

export default function PrinciplesManifesto() {
  return (
    <div>
      <Stage>
        {principles.map((p, i) => {
          const bg = BACKGROUNDS[i % BACKGROUNDS.length];
          return (
            <Scene
              key={p.number}
              id={`principle-${p.number}`}
              label={copy.principles.counterFormat(p.number)}
              steps={STEPS}
              background={bg}
              className="pr-scene sheet-item"
              textEquivalent={textEquivalent(p.number, p.title, p.body, p.expansion)}
            >
              {({ step }) => (
                <div className="pr-scene__inner sheet-fill mx-auto w-full max-w-6xl px-4 sm:px-6">
                  <p className={`pr-num step-in ${step >= 0 ? "is-on" : ""}`}>Principle {String(p.number).padStart(2, "0")}</p>
                  <SlideHeadline
                    as="h2"
                    lines={splitLines(p.title)}
                    accent={p.accent}
                    dim={bg !== "paper"}
                    underline={i === 0}
                    className="mt-4 text-4xl sm:text-6xl lg:text-7xl"
                  />
                  {p.body ? <p className={`pr-body step-in ${step >= 1 ? "is-on" : ""}`}>{p.body}</p> : null}
                  <div className={`pr-expansion prose-m8 step-in ${step >= 2 ? "is-on" : ""}`}>
                    <p>{p.expansion}</p>
                  </div>
                </div>
              )}
            </Scene>
          );
        })}
      </Stage>

      <div className="pr-orb">
        <Orb size="ambient" state="idle" />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="pr-footer">
          <span className="mono-label">Version {PRINCIPLES_VERSION}</span>
          <span className="mono-label">
            <a href="/principles.md">plain-text version</a>
          </span>
        </p>
      </div>
    </div>
  );
}
