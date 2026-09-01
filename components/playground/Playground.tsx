"use client";

import { ActivityRail } from "./ActivityRail";
import { JoinModal } from "./JoinModal";
import { MissionPanel } from "./MissionPanel";
import { ModelStage } from "./ModelStage";
import { PlayToast } from "./PlayToast";
import { PlaygroundProvider, usePlayground } from "./playground-context";
import { TopBar } from "./TopBar";
import "./playground.css";

function PlaygroundShell() {
  const { mode } = usePlayground();

  return (
    <div className="playground" data-mode={mode}>
      <TopBar />
      <div className="workspace">
        <ActivityRail />
        <ModelStage />
        <MissionPanel />
      </div>
      <PlayToast />
      <JoinModal />
    </div>
  );
}

export function Playground() {
  return (
    <PlaygroundProvider>
      <PlaygroundShell />
    </PlaygroundProvider>
  );
}
