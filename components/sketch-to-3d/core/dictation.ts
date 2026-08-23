/**
 * Speech-to-text for the "What did you draw?" prompt, on the browser's own
 * SpeechRecognition engine. No dependency, no API key, no fal spend — which
 * matters twice over: the proxy's rate limit (app/api/fal/proxy/route.ts) is
 * budgeted in *generations*, and routing dictation through it would let a child
 * exhaust their creations by talking.
 *
 * The cost is reach: this is Chrome/Edge only. Firefox ships no implementation
 * at all and Safari's is unreliable. `getSpeechRecognition` returning null is
 * therefore a NORMAL state, not an error — the mic button hides itself and
 * typing carries on working. Never gate submission on dictation.
 *
 * Everything here is deliberately DOM-type-free: the vitest environment is
 * "node" (vitest.config.ts), so importing lib.dom shapes would make this module
 * untestable. The structural types below are what the real objects satisfy.
 */

/** One candidate reading of a phrase. The engine ranks these; we take [0]. */
export type TranscriptAlternative = { transcript: string };

/**
 * ArrayLike rather than an array: the live objects are indexed collections with
 * a `length`, not real arrays, so `.map`/`.forEach` are unavailable on them.
 * ArrayLike is satisfied by both those and the plain arrays the tests pass.
 */
export type TranscriptResult = ArrayLike<TranscriptAlternative> & { isFinal: boolean };
export type TranscriptResultList = ArrayLike<TranscriptResult>;

/** The slice of the SpeechRecognition interface this feature actually touches. */
export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: TranscriptResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * Chrome and Edge expose this only under the `webkit` prefix to this day; the
 * unprefixed name is checked first so a future standard implementation is
 * picked up without a code change.
 *
 * Returns null when unavailable — including during SSR, where `window` does not
 * exist at all and this module is still imported by the client bundle's graph.
 */
export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Splits a results list into settled text and the still-changing tail.
 *
 * The engine re-sends the WHOLE list on every event, not just the new part, so
 * the caller must replace rather than accumulate — appending each event's
 * output is the classic bug here and produces "a dragon a dragon a dragon".
 *
 * Segments are concatenated raw and trimmed once at the end: Chrome emits a
 * leading space on continuation segments, which is exactly the word separator
 * we want, and trimming per-segment would weld words together.
 */
export function collectTranscript(results: TranscriptResultList): {
  final: string;
  interim: string;
} {
  let final = "";
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const text = result[0]?.transcript ?? "";
    if (result.isFinal) final += text;
    else interim += text;
  }
  return { final: final.trim(), interim: interim.trim() };
}

/**
 * Appends dictated text to whatever is already in the field.
 *
 * Append, not replace, so typing and talking compose: a child can type "a red"
 * and then say "dragon with wings". Replacing would silently destroy typed
 * input the moment the mic was tapped, which reads as a bug rather than a mode.
 */
export function mergeTranscript(existing: string, transcript: string): string {
  const addition = transcript.trim();
  if (!addition) return existing;
  const base = existing.trim();
  return base ? `${base} ${addition}` : addition;
}

/**
 * Maps a SpeechRecognition error code to something the person at the booth can
 * act on, mirroring `friendlyError` in SketchToWorld.tsx.
 *
 * null means SAY NOTHING. "aborted" fires every time we call stop() ourselves —
 * i.e. on every successful dictation the user ends by tapping the mic again —
 * so surfacing it would flash an error on the happy path. "no-speech" fires
 * after a silent timeout, which is a prompt to retry, not a fault.
 */
const DICTATION_ERRORS: Record<string, string | null> = {
  aborted: null,
  "no-speech": "Didn't catch that — tap the mic and say it again.",
  "not-allowed": "Microphone is blocked. Allow it in the address bar, or just type.",
  "service-not-allowed": "Microphone is blocked. Allow it in the address bar, or just type.",
  "audio-capture": "No microphone found — type it instead.",
  network: "Speech needs the internet. Type it instead.",
};

export function friendlyDictationError(code: string): string | null {
  // `in` rather than a truthiness check: "aborted" maps to null on purpose and
  // `??` would fall through to the generic message for exactly the code we most
  // want silenced.
  if (code in DICTATION_ERRORS) return DICTATION_ERRORS[code];
  return "Voice isn't working right now — type it instead.";
}
