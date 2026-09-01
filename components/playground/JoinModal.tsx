"use client";

import { useEffect, useState } from "react";
import {
  MAX_PLAYER_NAME_LENGTH,
  usePlayerIdentity,
} from "@/lib/player-identity";

/**
 * Asks a first-time visitor for a name, once per browser.
 *
 * Gated on `hydrated` rather than shown unconditionally: `hydrate()` reads
 * localStorage synchronously inside an effect, so there is one render where
 * neither is known yet. Rendering nothing for that render (instead of
 * assuming "no name") is what stops this flashing over a returning player's
 * saved name.
 */
export function JoinModal() {
  const hydrated = usePlayerIdentity((state) => state.hydrated);
  const ready = usePlayerIdentity((state) => state.ready);
  const hydrate = usePlayerIdentity((state) => state.hydrate);
  const join = usePlayerIdentity((state) => state.join);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated || ready) return null;

  const submit = () => {
    if (submitting) return;
    setSubmitting(true);
    const name = join(draft);
    // Best-effort: a network hiccup here should never block a kid from
    // playing. The name already works locally — this only feeds the repo log.
    fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
  };

  return (
    <div className="join-modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose your name">
      <div className="join-modal">
        <span className="join-modal-icon" aria-hidden="true">👋</span>
        <h2>What&apos;s your name, explorer?</h2>
        <p>Everyone in the model will see it above your head.</p>
        <input
          autoFocus
          value={draft}
          maxLength={MAX_PLAYER_NAME_LENGTH}
          placeholder="Type your name"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <button type="button" className="join-modal-submit" onClick={submit}>
          Let&apos;s play!
        </button>
      </div>
    </div>
  );
}
