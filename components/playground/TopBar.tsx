"use client";

import { useRef, useState } from "react";
import { SoundOnIcon } from "./icons";
import { usePlayground } from "./playground-context";
import {
  formatSize,
  projectFromFile,
  useProjectStore,
} from "./projectStore";

export function TopBar() {
  const {
    stars,
    sound,
    toggleSound,
    setMode,
    showToast,
    connection,
    connectionText,
    modelName,
  } = usePlayground();
  const projects = useProjectStore((s) => s.projects);
  const selectedId = useProjectStore((s) => s.selectedId);
  const addProject = useProjectStore((s) => s.add);
  const selectProject = useProjectStore((s) => s.select);
  const removeProject = useProjectStore((s) => s.remove);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let last = "";
    for (const file of Array.from(files)) {
      const project = projectFromFile(file);
      addProject(project);
      last = project.name;
    }
    setOpen(true);
    showToast(
      "Project uploaded",
      `${last} is in your model list. Pick it to open it.`,
    );
  };

  const active = projects.find((p) => p.id === selectedId);

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

      <div className="model-status" aria-label="Current model stream status">
        <span className="model-thumb" aria-hidden="true">
          ⌂
        </span>
        <span className="model-copy">
          <strong>{active ? active.name : modelName}</strong>
          <small>
            <i className={connection === "live" ? undefined : connection} />
            <span>{connectionText}</span>
          </small>
        </span>
        {/* Upload sits left of the chevron: it is how the list gets longer,
            so it belongs with the list rather than over in the profile area. */}
        <button
          type="button"
          className="icon-button upload-button"
          aria-label="Upload a project"
          title="Upload a project"
          onClick={() => fileRef.current?.click()}
        >
          ↥<span>Upload project</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.glb,.gltf,.obj,.ifc,.rvt,.3dm"
          className="sr-only"
          onChange={(event) => {
            onFiles(event.target.files);
            // Reset so picking the same file twice still fires a change.
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="icon-button chevron"
          aria-label="Choose another model"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          ⌄
        </button>

        {open ? (
          <div className="model-menu" role="menu">
            <button
              type="button"
              className={`model-option${selectedId === null ? " current" : ""}`}
              onClick={() => {
                selectProject(null);
                setOpen(false);
              }}
            >
              <span className="model-option-thumb live" aria-hidden="true">⌂</span>
              <span className="model-option-copy">
                <strong>{modelName}</strong>
                <small>{connectionText}</small>
              </span>
            </button>

            {projects.length === 0 ? (
              <p className="model-menu-empty">
                Upload a project to see it here.
              </p>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`model-option${selectedId === project.id ? " current" : ""}`}
                  onClick={() => {
                    selectProject(project.id);
                    setOpen(false);
                    showToast(project.name, "Opened from your uploads.");
                  }}
                >
                  <span className="model-option-thumb" aria-hidden="true">
                    {project.preview ? (
                      <img src={project.preview} alt="" />
                    ) : (
                      <b>{project.kind}</b>
                    )}
                  </span>
                  <span className="model-option-copy">
                    <strong>{project.name}</strong>
                    <small>{formatSize(project.size)} · {project.kind}</small>
                  </span>
                  <span
                    className="model-option-remove"
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${project.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeProject(project.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation();
                        removeProject(project.id);
                      }
                    }}
                  >
                    ✕
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
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
