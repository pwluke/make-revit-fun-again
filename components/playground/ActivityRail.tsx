"use client";

import type { CSSProperties } from "react";
import { ACTIVITY_ICONS } from "./icons";
import { EXTRA_MODES, MODE_ORDER, MODES, type ModeId } from "./modes";
import { usePlayground } from "./playground-context";

/** One rail card. Extracted verbatim so every entry in the rail renders the
 *  same markup, whether or not it is part of the five-step adventure. */
function ActivityCard({ id }: { id: ModeId }) {
  const { mode, setMode } = usePlayground();
  const config = MODES[id];
  const Icon = ACTIVITY_ICONS[id];
  const active = mode === id;
  return (
    <button
      type="button"
      className={`activity-card${active ? " active" : ""}`}
      style={{ "--activity": config.color } as CSSProperties}
      aria-current={active ? "step" : undefined}
      onClick={() => setMode(id, true)}
    >
      <span className={`activity-icon icon-${id}`} aria-hidden="true">
        <Icon />
      </span>
      <span>
        <strong>{config.activityTitle}</strong>
        <small>{config.activitySubtitle}</small>
      </span>
      <i>›</i>
    </button>
  );
}

export function ActivityRail() {
  const { mode, showToast } = usePlayground();
  const guide = MODES[mode];

  return (
    <aside className="activity-rail" aria-label="Model activities">
      <div className="rail-heading">
        <span className="eyebrow">Choose a way to play</span>
        <h1>
          What will you
          <br />
          discover?
        </h1>
      </div>

      {/* One list. EXTRA_MODES stays separate from MODE_ORDER because that
          array drives the five-step adventure's `nextMode` wrapping — but it
          renders on the end of the same nav, so the rail reads as one list. */}
      <nav className="activity-list">
        {[...MODE_ORDER, ...EXTRA_MODES].map((id) => (
          <ActivityCard key={id} id={id} />
        ))}
      </nav>

      <button
        className="helper-card"
        type="button"
        onClick={() => showToast(`${guide.guideName} says…`, guide.guide)}
      >
        <div className="helper-face" aria-hidden="true">
          <span>•</span>
          <span>•</span>
          <b>⌣</b>
        </div>
        <p>
          <strong>Need a hand?</strong>
          <br />
          Ask your grown-up or tap me!
        </p>
      </button>
    </aside>
  );
}
