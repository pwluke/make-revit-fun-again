"use client";

import { usePlayground } from "./playground-context";

export function PlayToast() {
  const { toast, toastVisible } = usePlayground();

  return (
    <div
      className={`toast${toastVisible ? " visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span>★</span>
      <p>
        <strong>{toast.title}</strong>
        <small>{toast.message}</small>
      </p>
    </div>
  );
}
