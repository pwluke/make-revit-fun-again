"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collectTranscript,
  friendlyDictationError,
  getSpeechRecognition,
  type SpeechRecognitionLike,
} from "../core/dictation";

export type DictationState = "idle" | "listening";

export type Dictation = {
  /** False on Firefox and anywhere else without the engine — hide the button. */
  supported: boolean;
  state: DictationState;
  /** Live, unsettled words. Show them; never write them into the field. */
  interim: string;
  error: string | null;
  /** Tap-to-talk, tap-again-to-stop. */
  toggle: () => void;
  /** Hard stop with no transcript delivered — for closing the overlay. */
  cancel: () => void;
};

/**
 * Wraps the browser speech engine as tap-to-talk, calling `onFinal` exactly
 * once per session with the settled transcript.
 *
 * `onFinal` is invoked from `onend`, not from `onresult`. The engine re-sends
 * the entire results list on every event, so emitting from `onresult` delivers
 * the same words again each time it fires and the caller appends duplicates.
 * Holding the latest snapshot in a ref and flushing once at the end makes that
 * class of bug structurally impossible rather than merely unlikely.
 */
export function useDictation(onFinal: (text: string) => void): Dictation {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<DictationState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const onFinalRef = useRef(onFinal);

  // Kept in a ref so the engine's event handlers — bound once, at construction —
  // always reach the current callback without being rebuilt on every render.
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  // Detected after mount rather than during render: `window` does not exist
  // during SSR, so reading it inline would render "unsupported" on the server
  // and "supported" on the client, which is a hydration mismatch.
  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
  }, []);

  useEffect(() => {
    // abort(), not stop(): stop() would still deliver a transcript to a
    // component that is on its way out.
    return () => recognitionRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    let recognition = recognitionRef.current;
    if (!recognition) {
      // Constructed lazily. Building it on mount is wasted work for every child
      // who only ever types, and some builds treat construction as the point
      // where the microphone permission becomes relevant.
      recognition = new Recognition();
      // continuous=false ends the session on its own at the natural end of a
      // phrase — the right shape for a short prompt like "a red dragon", and it
      // means a child who walks away is not left with a hot microphone.
      recognition.continuous = false;
      // Interim results exist purely for feedback. A mic button with no visible
      // response for two seconds reads as broken, and the child taps it again.
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = navigator.language || "en-US";

      recognition.onresult = (event) => {
        const collected = collectTranscript(event.results);
        // Replace, never append: `event.results` is cumulative.
        finalRef.current = collected.final;
        setInterim(collected.interim);
      };

      recognition.onerror = (event) => {
        // null means this code is expected noise (notably "aborted", which we
        // cause ourselves every time the user taps the mic to stop).
        setError(friendlyDictationError(event.error));
      };

      recognition.onend = () => {
        const text = finalRef.current;
        finalRef.current = "";
        setInterim("");
        setState("idle");
        if (text) onFinalRef.current(text);
      };

      recognitionRef.current = recognition;
    }

    setError(null);
    setInterim("");
    finalRef.current = "";

    try {
      recognition.start();
      setState("listening");
    } catch {
      // start() throws InvalidStateError if the engine is already running. The
      // state guard in `toggle` normally prevents that, but the engine can also
      // end on its own between render and click, so treat it as a no-op rather
      // than letting it escape into the overlay.
      setState("listening");
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === "listening") {
      // stop() finishes the current phrase and still fires onend, which is what
      // delivers the transcript. abort() here would throw the words away.
      recognitionRef.current?.stop();
      return;
    }
    start();
  }, [state, start]);

  const cancel = useCallback(() => {
    recognitionRef.current?.abort();
    finalRef.current = "";
    setInterim("");
    setError(null);
    setState("idle");
  }, []);

  return { supported, state, interim, error, toggle, cancel };
}
