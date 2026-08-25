"use client";

import { useEffect, useRef, useState } from "react";
import { SoundOnIcon } from "./icons";
import { usePlayground } from "./playground-context";
import { useBuildingStore } from "@/lib/building-store";

export function TopBar() {
  const {
    stars,
    sound,
    toggleSound,
    setMode,
    showToast,
    connection,
    connectionText,
  } = usePlayground();
  const buildings = useBuildingStore((s) => s.buildings);
  const activeId = useBuildingStore((s) => s.activeId);
  const busy = useBuildingStore((s) => s.busy);
  const buildingError = useBuildingStore((s) => s.error);
  const hydrate = useBuildingStore((s) => s.hydrate);
  const importFiles = useBuildingStore((s) => s.importFiles);
  const selectBuilding = useBuildingStore((s) => s.select);
  const removeBuilding = useBuildingStore((s) => s.remove);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (buildingError) showToast("That did not work", buildingError);
  }, [buildingError, showToast]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const result = await importFiles(Array.from(files));
    if (!result) return;
    setOpen(false);
    showToast(
      `${result.name} is open`,
      result.skipped > 0
        ? `${result.skipped} file(s) were skipped — the rest are saved on this device.`
        : "Saved on this device, so it is still here next time.",
    );
  };

  const active = buildings.find((building) => building.id === activeId);

  return (
    <header className="topbar">
      <a
        className="brand"
        href="/"
        aria-label="Make Revit Fun Again home"
        onClick={(event) => {
          event.preventDefault();
          setMode("explore", true);
        }}
      >
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="brand-wordmark">
          <small>MAKE</small>
          <strong>REVIT</strong>
          <em>FUN AGAIN!</em>
        </span>
      </a>

      {/* Centre column. Two separate controls — one adds a building, the other
          chooses between them — but they share this cell, because the header
          grid has exactly three columns and a fourth child would shove the
          profile area out of its own. */}
      <div className="header-centre">
      <div className="upload-control">
        <button
          type="button"
          className="upload-button"
          aria-label="Upload a building"
          title="Pick the *_voxels.json files for one building"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <span aria-hidden="true">↥</span>
          <span>{busy ? "Reading\u2026" : "Upload building"}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".json,application/json"
          className="sr-only"
          onChange={(event) => {
            void onFiles(event.target.files);
            // Reset so picking the same file twice still fires a change.
            event.target.value = "";
          }}
        />
      </div>

      <div className="model-status" aria-label="Current building">
        <span className="model-thumb project" aria-hidden="true">
          {active?.origin === "upload" ? <b>JSON</b> : "⌂"}
        </span>
        <span className="model-copy">
          <strong>{active ? active.name : "No building"}</strong>
          <small>
            <i className={connection === "live" ? undefined : connection} />
            <span>{connectionText}</span>
          </small>
        </span>
        <button
          type="button"
          className="icon-button chevron"
          aria-label="Choose another building"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          ⌄
        </button>

        {open ? (
          <div className="model-menu" role="menu">
            {buildings.map((building) => (
              <div
                key={building.id}
                className={`model-option${building.id === activeId ? " current" : ""}`}
              >
                <button
                  type="button"
                  className="model-option-open"
                  onClick={() => {
                    void selectBuilding(building.id);
                    setOpen(false);
                  }}
                >
                  <span
                    className={`model-option-thumb${building.origin === "builtin" ? " live" : ""}`}
                    aria-hidden="true"
                  >
                    {building.origin === "builtin" ? "⌂" : <b>JSON</b>}
                  </span>
                  <span className="model-option-copy">
                    <strong>{building.name}</strong>
                    <small>{building.detail}</small>
                  </span>
                </button>
                {building.origin === "upload" ? (
                  <button
                    type="button"
                    className="model-option-remove"
                    aria-label={`Delete ${building.name}`}
                    title="Delete this building"
                    onClick={() => {
                      void removeBuilding(building.id);
                      showToast(building.name, "Deleted from this device.");
                    }}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}

            <p className="model-menu-empty">
              Upload one <code>*_voxels.json</code> per layer to add your own.
            </p>
          </div>
        ) : null}
      </div>

      </div>

      <div className="profile-area">
        <div className="star-score" aria-label={`${stars} stars earned`}>
          <span>★</span>
          <strong>{stars}</strong>
        </div>
        <button
          type="button"
          className={`sound-button icon-button${sound ? "" : " muted"}`}
          aria-label={`Turn sound ${sound ? "off" : "on"}`}
          aria-pressed={sound}
          onClick={toggleSound}
        >
          <SoundOnIcon />
        </button>
        <button
          type="button"
          className="avatar"
          aria-label="Open Amira's profile"
          onClick={() =>
            showToast("Hi, Amira!", "Your creative adventures and stars live here.")
          }
        >
          A<span />
        </button>
      </div>
    </header>
  );
}
