"use client";

import { useState } from "react";
import { SceneCanvas } from "@/components/canvas/SceneCanvas";
import {
  MinecraftControls,
  MinecraftScene,
} from "@/components/minecraft/App";
import { RhinoScene } from "@/components/rhino/RhinoScene";
import { db } from "@/lib/db";

type SceneId = "rhino" | "minecraft";

export function World() {
  const [scene, setScene] = useState<SceneId>("rhino");
  const { isLoading, error, data } = db.useQuery({ meshes: {} });
  const meshes = data?.meshes ?? [];

  return (
    <MinecraftControls>
      <SceneCanvas>
        {scene === "rhino" ? (
          <RhinoScene meshes={meshes} />
        ) : (
          <MinecraftScene />
        )}
      </SceneCanvas>

      <div className="pointer-events-auto absolute top-4 left-4 z-10 flex gap-1 rounded-full bg-black/50 p-1 text-xs text-white backdrop-blur-sm">
        {(["rhino", "minecraft"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setScene(id)}
            className={`rounded-full px-3 py-1.5 capitalize transition ${
              scene === id ? "bg-white text-black" : "hover:bg-white/15"
            }`}
          >
            {id === "rhino" ? "Rhino stream" : "Minecraft"}
          </button>
        ))}
      </div>

      {scene === "rhino" ? (
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80">
          {error
            ? `InstantDB: ${error.message}`
            : isLoading
              ? "Connecting to InstantDB…"
              : meshes.length === 0
                ? "No streamed meshes yet · drag to orbit · scroll to zoom"
                : `${meshes.length} mesh${meshes.length === 1 ? "" : "es"} · drag to orbit · scroll to zoom`}
        </p>
      ) : (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          />
          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80">
            Click to look around · WASD to move · Space to jump · Click a block
            to place another
          </p>
        </>
      )}
    </MinecraftControls>
  );
}
