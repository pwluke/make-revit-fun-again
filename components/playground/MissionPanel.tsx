"use client";

import { useLaserTagStore } from "@/components/lasertag/laserTagStore";
import { getMission, MODES } from "./modes";
import { usePlayground } from "./playground-context";
import { useCursorLook } from "./use-cursor-look";

export function MissionPanel() {
  const guideRef = useCursorLook<HTMLDivElement>();
  const botsTagged = useLaserTagStore((s) => s.tagged.length);
  const botTotal = useLaserTagStore((s) => s.total);
  const {
    mode,
    setMode,
    nextMode,
    explode,
    spun,
    floor,
    inkPicked,
    sketchDrawn,
    sketchSaved,
    paintedColors,
    placedItems,
    treasures,
    rewardedModes,
  } = usePlayground();

  const config = MODES[mode];
  const steps = getMission(mode, {
    explode,
    spun,
    floor,
    inkPicked,
    sketchDrawn,
    sketchSaved,
    paintedCount: paintedColors.length,
    placedItems: placedItems.map((item) => item.item),
    treasures,
    botsTagged,
    botTotal,
  });
  const completed = steps.filter((step) => step.done).length;
  const collected = rewardedModes.includes(mode);

  return (
    <aside className="mission-panel">
      <div className="guide-bubble">
        <div ref={guideRef} className="guide-character" aria-hidden="true">
          <div className="hard-hat" />
          <div className="head">
            <i />
            <i />
            <b />
          </div>
          <div className="body" />
        </div>
        <div>
          <span className="eyebrow">{config.guideName} says</span>
          <p>{config.guide}</p>
        </div>
      </div>

      <section className="mission-card">
        <div className="mission-card-head">
          <span className="mission-icon">◎</span>
          <div>
            <span className="eyebrow">Today&apos;s mini mission</span>
            <h3>{config.mission}</h3>
          </div>
        </div>
        <div className="progress-track">
          <span style={{ width: `${(completed / steps.length) * 100}%` }} />
        </div>
        <p className="progress-copy">
          <strong>
            {completed} of {steps.length}
          </strong>{" "}
          steps complete
        </p>
        <ol className="mission-steps">
          {steps.map((step, index) => (
            <li key={step.title} className={step.done ? "done" : undefined}>
              <span>{step.done ? "✓" : String(index + 1)}</span>
              <p>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </p>
            </li>
          ))}
        </ol>
        <div className={`reward-preview${collected ? " collected" : ""}`}>
          <span>★</span>
          <p>
            <small>Mission reward</small>
            <strong>{collected ? "Collected!" : "+15 stars"}</strong>
          </p>
        </div>
      </section>

      <button
        type="button"
        className="next-adventure"
        onClick={() => setMode(nextMode, true)}
      >
        <span>{mode === "treasure" ? "Play again" : "Next adventure"}</span>
        <small>{config.next}</small>
        <b>↗</b>
      </button>
    </aside>
  );
}
