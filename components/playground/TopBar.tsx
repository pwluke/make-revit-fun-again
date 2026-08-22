"use client";

import { SoundOnIcon } from "./icons";
import { usePlayground } from "./playground-context";

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
          <strong>{modelName}</strong>
          <small>
            <i className={connection === "live" ? undefined : connection} />
            <span>{connectionText}</span>
          </small>
        </span>
        <button
          type="button"
          className="icon-button chevron"
          aria-label="Choose another model"
          onClick={() =>
            showToast(
              modelName,
              "This playground is ready for another live model stream.",
            )
          }
        >
          ⌄
        </button>
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
