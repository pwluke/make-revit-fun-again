"use client";

/**
 * Game sound effects, synthesised with Web Audio rather than loaded as
 * files: nothing to fetch, nothing to license, and a demo on venue wifi
 * can never be caught without its audio.
 *
 * The palette is deliberately cute — short, soft-edged, mostly triangle
 * and sine voices in a major pentatonic. Nothing here should startle a
 * child who is wearing headphones.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function audio() {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  // Browsers start the context suspended until a gesture; every effect is
  // triggered by play, so resuming here is enough.
  if (ctx.state === "suspended") void ctx.resume();
  return muted ? null : ctx;
}

export function setSfxMuted(next: boolean) {
  muted = next;
}

export function isSfxMuted() {
  return muted;
}

/** One short pitched voice with a percussive envelope. */
function blip(
  when: number,
  freq: number,
  {
    type = "triangle" as OscillatorType,
    dur = 0.12,
    gain = 0.16,
    to = freq,
  } = {},
) {
  const c = ctx;
  if (!c || !master) return;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, when + dur);
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(gain, when + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(env).connect(master);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;
function noise(c: AudioContext) {
  if (noiseBuffer) return noiseBuffer;
  const samples = Math.floor(c.sampleRate * 0.3);
  const buffer = c.createBuffer(1, samples, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
  }
  noiseBuffer = buffer;
  return buffer;
}

/** A soft filtered thump — the body of footsteps and impacts. */
function thump(
  when: number,
  {
    freq = 900,
    sweepTo = 300,
    dur = 0.1,
    gain = 0.1,
    q = 1.2,
  } = {},
) {
  const c = ctx;
  if (!c || !master) return;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, when);
  filter.frequency.exponentialRampToValueAtTime(sweepTo, when + dur);
  filter.Q.value = q;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(gain, when + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(filter).connect(env).connect(master);
  src.start(when);
  src.stop(when + dur + 0.02);
}

// --- footsteps ------------------------------------------------------------

/** Alternates so a walk cycle sounds like two feet, not one repeated tap. */
let stepFoot = 0;

/** A soft padded step. `direction` is 1 walking forward, -1 backing up —
 *  backing up gets a lower, slower scuff so you can hear which way you go. */
export function playFootstep(direction: number) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const back = direction < 0;
  stepFoot ^= 1;
  const tilt = stepFoot ? 1 : 0.88;
  thump(t, {
    freq: (back ? 420 : 720) * tilt,
    sweepTo: back ? 170 : 260,
    dur: back ? 0.15 : 0.11,
    gain: 0.075,
    q: back ? 0.8 : 1.3,
  });
  // A tiny pitched tick on top keeps it from reading as static.
  blip(t, (back ? 150 : 220) * tilt, {
    type: "sine",
    dur: 0.07,
    gain: 0.05,
    to: back ? 110 : 150,
  });
}

// --- building and breaking ------------------------------------------------

/** Placing a block: a bright two-note "pop-tick" that lands upward. */
export function playPlace() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  blip(t, 520, { type: "triangle", dur: 0.09, gain: 0.13, to: 660 });
  blip(t + 0.055, 880, { type: "sine", dur: 0.1, gain: 0.1 });
  thump(t, { freq: 1400, sweepTo: 700, dur: 0.06, gain: 0.05 });
}

/** Breaking blocks: a crumble whose weight scales with how many went.
 *  Kept cuter than a real smash — a rattle, then a soft settling note. */
export function playBreak(count = 1) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const heft = Math.min(1, count / 8);
  thump(t, {
    freq: 900 - heft * 250,
    sweepTo: 180,
    dur: 0.16 + heft * 0.1,
    gain: 0.12 + heft * 0.06,
    q: 0.9,
  });
  // Two or three tumbling clacks, lower as more bricks go.
  const clacks = 2 + Math.round(heft * 2);
  for (let i = 0; i < clacks; i++) {
    blip(t + 0.03 + i * 0.045, 330 - heft * 90 - i * 25, {
      type: "triangle",
      dur: 0.08,
      gain: 0.07,
      to: 190 - i * 15,
    });
  }
}

// --- collecting a power ---------------------------------------------------

/** Unlocking an ability: a rising pentatonic sparkle, then a warm chord.
 *  This is the biggest moment in the game, so it is the only cue allowed
 *  to run past a fifth of a second. */
export function playPowerUp() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const rise = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  rise.forEach((f, i) => {
    blip(t + i * 0.075, f, { type: "triangle", dur: 0.16, gain: 0.13 });
    // A shimmer an octave up, quieter, for sparkle.
    blip(t + i * 0.075 + 0.02, f * 2, { type: "sine", dur: 0.1, gain: 0.045 });
  });
  // Settling major chord under the last note.
  const chord = [523.25, 659.25, 783.99];
  chord.forEach((f) =>
    blip(t + 0.3, f, { type: "sine", dur: 0.5, gain: 0.075 }),
  );
}

/** Toggling a power on or off from the slot row — a small confirmation. */
export function playToggle(on: boolean) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  blip(t, on ? 660 : 440, {
    type: "sine",
    dur: 0.1,
    gain: 0.1,
    to: on ? 880 : 330,
  });
}

/** Web zip: a rising whoosh with a tick at the anchor point. */
export function playWebZip() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  blip(t, 300, { type: "sine", dur: 0.26, gain: 0.1, to: 900 });
  thump(t, { freq: 500, sweepTo: 2200, dur: 0.24, gain: 0.05, q: 0.7 });
  blip(t + 0.22, 1200, { type: "triangle", dur: 0.07, gain: 0.07 });
}

/** Finding a fossil fragment: a hollow bone-y knock, then a bright chime.
 *  Deliberately different from playPowerUp — a piece of a set, not a power. */
export function playFragment(index: number, total: number) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  thump(t, { freq: 620, sweepTo: 240, dur: 0.13, gain: 0.09, q: 1.6 });
  // The chime climbs a pentatonic step per fragment, so the set audibly
  // fills up and the last one lands highest.
  const steps = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  const note = steps[Math.min(index, steps.length - 1)];
  blip(t + 0.04, note, { type: "triangle", dur: 0.2, gain: 0.12 });
  blip(t + 0.06, note * 2, { type: "sine", dur: 0.14, gain: 0.05 });
  if (index + 1 >= total) return; // the reveal fanfare takes over
}

/** The skeleton is complete: a longer rising flourish under the reveal card. */
export function playDinoComplete() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    blip(t + i * 0.09, f, { type: "triangle", dur: 0.26, gain: 0.13 });
    blip(t + i * 0.09 + 0.02, f * 2, { type: "sine", dur: 0.16, gain: 0.05 });
  });
  [523.25, 659.25, 783.99, 1046.5].forEach((f) =>
    blip(t + 0.5, f, { type: "sine", dur: 0.7, gain: 0.07 }),
  );
}
