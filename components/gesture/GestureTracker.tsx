"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useGestureStore, type GestureLabel } from "./store";
import { sketchStore } from "@/components/sketch3d/core/strokeStore";
import {
  PINCH_CLOSE,
  PINCH_OPEN,
  classifyPose,
  dist,
  type HandPose,
  type Landmark,
} from "./pose";
import {
  BackIcon,
  GoIcon,
  LookIcon,
  HammerIcon,
  LeapIcon,
  PinchIcon,
  PurseIcon,
  ThumbIcon,
} from "./icons";

// Detection cadence. The face runs every tick (steering latency matters);
// hands run every other tick — held poses survive 15fps, and the split
// keeps integrated GPUs comfortable.
const DETECT_INTERVAL_MS = 33;
// Head rotation below this is "rest" — small natural head wobble must not
// drift the camera.
const HEAD_DEADZONE = 0.06; // rad, ~3.5 deg
// Flip these if steering feels inverted on some cameras.
const HEAD_YAW_SIGN = 1;
const HEAD_PITCH_SIGN = 1;
// Minimum gap between one-shot actions (jump/build/break).
const ACTION_COOLDOWN_MS = 250;
// Gap between repeats while the purse is held. Slower than the one-shot
// cooldown, so a single deliberate pinch never takes two blocks.
const BREAK_REPEAT_MS = 600;
const MIN_SCORE = 0.55;

// MediaPipe hand skeleton (21 landmarks).
const HAND_LINKS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const LEGEND: { key: Exclude<GestureLabel, null>; word: string; Icon: typeof LookIcon }[] = [
  { key: "look", word: "Look", Icon: LookIcon },
  { key: "go", word: "Go", Icon: GoIcon },
  { key: "back", word: "Back", Icon: BackIcon },
  { key: "jump", word: "Jump", Icon: ThumbIcon },
  { key: "leap", word: "Leap", Icon: LeapIcon },
  { key: "build", word: "Build", Icon: PinchIcon },
  { key: "hammer", word: "Smash", Icon: HammerIcon },
];


export default function GestureTracker() {
  const active = useGestureStore((s) => s.active);
  const status = useGestureStore((s) => s.status);
  const faceTracking = useGestureStore((s) => s.faceTracking);
  const handTracking = useGestureStore((s) => s.handTracking);
  const label = useGestureStore((s) => s.label);
  const setActive = useGestureStore((s) => s.setActive);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let hands: import("@mediapipe/tasks-vision").GestureRecognizer | null = null;
    let face: import("@mediapipe/tasks-vision").FaceLandmarker | null = null;

    const store = useGestureStore.getState();

    // --- per-session mutable state ---------------------------------------
    let tickCount = 0;
    let lastDetect = 0;
    // head
    const headMatrix = new THREE.Matrix4();
    const headEuler = new THREE.Euler(0, 0, 0, "YXZ");
    let neutralYaw: number | null = null;
    let neutralPitch = 0;
    const smoothHead = { yaw: 0, pitch: 0 };
    let nose: Landmark | null = null;
    // hands (cached between hand ticks so held poses do not flicker)
    let handLms: Landmark[][] = [];
    let handPoses: HandPose[] = [];
    let pinchRatio: number | null = null; // tightest pinch among pinch-capable hands
    let pinchHand: Landmark[] | null = null;
    // one-shots
    let pinchIsOpen = true;
    let prevThumb = false;
    let prevSwing = false;
    let prevLeap = false;
    let purseHand: Landmark[] | null = null;
    let lastAction = 0;
    // orbit (fist drag)

    function headAngles(matrixData: number[] | undefined) {
      if (!matrixData) return null;
      headMatrix.fromArray(matrixData);
      headEuler.setFromRotationMatrix(headMatrix);
      // MediaPipe reports the head pose in camera space: turning left gives
      // +yaw, looking up gives -x — remap so positive pitch means up.
      return {
        yaw: HEAD_YAW_SIGN * headEuler.y,
        pitch: HEAD_PITCH_SIGN * -headEuler.x,
      };
    }

    function drawOverlay(frameLabel: GestureLabel) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      if (video.videoWidth && canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Mirror the overlay to match the mirrored video.
      ctx.setTransform(-1, 0, 0, 1, w, 0);
      const busy = frameLabel && frameLabel !== "look";
      const color = busy ? "#f59e0b" : "#38bdf8";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (const lm of handLms) {
        ctx.beginPath();
        for (const [a, b] of HAND_LINKS) {
          ctx.moveTo(lm[a].x * w, lm[a].y * h);
          ctx.lineTo(lm[b].x * w, lm[b].y * h);
        }
        ctx.stroke();
        for (const p of lm) {
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // The pinched block, drawn between thumb and index tips.
      if (frameLabel === "build" && pinchHand) {
        const t = pinchHand[4];
        const i = pinchHand[8];
        const px = ((t.x + i.x) / 2) * w;
        const py = ((t.y + i.y) / 2) * h;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(px - 6, py - 6, 12, 12);
        ctx.strokeRect(px - 6, py - 6, 12, 12);
      }
      // The gathered fingertips doing the breaking, so it is obvious which
      // hand the recognizer locked onto.
      if (frameLabel === "hammer" && purseHand) {
        const tips = [4, 8, 12, 16, 20].map((t) => purseHand![t]);
        const cx = (tips.reduce((sum, p) => sum + p.x, 0) / tips.length) * w;
        const cy = (tips.reduce((sum, p) => sum + p.y, 0) / tips.length) * h;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // "I can see your face" marker on the nose.
      if (nose) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(nose.x * w, nose.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function processFrame(now: number) {
      const faceSeen = neutralYaw !== null && nose !== null;

      let frameLabel: GestureLabel = null;
      let move = 0;

      let sawFist = false;
      let sawPalm = false;
      let sawBack = false;
      let sawThumb = false;
      let sawPinch = false;
      let sawPurse = false;
      handPoses.forEach((pose, i) => {
        if (pose === "fist") sawFist = true;
        else if (pose === "palm") sawPalm = true;
        else if (pose === "back") sawBack = true;
        else if (pose === "thumb") sawThumb = true;
        else if (pose === "pinch") sawPinch = true;
        else if (pose === "purse") {
          sawPurse = true;
          purseHand = handLms[i];
        }
      });
      if (!sawPurse) purseHand = null;

      // Pinch-to-build with hysteresis: closing places one block; the pinch
      // must open again before the next close builds another.
      if (pinchRatio !== null && pinchRatio < PINCH_CLOSE) {
        if (pinchIsOpen && now - lastAction > ACTION_COOLDOWN_MS) {
          store.queueBuild();
          lastAction = now;
        }
        pinchIsOpen = false;
      } else if (pinchRatio === null || pinchRatio > PINCH_OPEN) {
        pinchIsOpen = true;
      }

      // Walking: palm toward the camera = forward, back of hand = backward.
      if (sawPalm) move = 1;
      else if (sawBack) move = -1;

      // A walking hand AND a thumb up together is a leap: a jump that
      // carries you forward, for getting onto the stairs ahead. It is
      // checked before the plain jump so the combo never fires both.
      const wantLeap = sawThumb && (sawPalm || sawBack);
      if (wantLeap) {
        if (!prevLeap && now - lastAction > ACTION_COOLDOWN_MS) {
          store.queueLeap();
          lastAction = now;
        }
      } else if (sawThumb && !prevThumb && now - lastAction > ACTION_COOLDOWN_MS) {
        store.queueJump();
        lastAction = now;
      }
      prevLeap = wantLeap;
      prevThumb = sawThumb;

      // Hammer: a closed fist swings at whatever the crosshair is on, and
      // keeps swinging while it is held — re-forming the pose for every
      // brick is exhausting. In Laser Tag the same fist pulls the trigger
      // instead; LaserTag.tsx reads breakQueued and decides.
      const swinging = sawFist || sawPurse;
      if (swinging && now - lastAction > (prevSwing ? BREAK_REPEAT_MS : ACTION_COOLDOWN_MS)) {
        store.queueBreak();
        lastAction = now;
      }
      prevSwing = swinging;

      if (swinging) frameLabel = "hammer";
      else if (sawPinch) frameLabel = "build";
      else if (wantLeap) frameLabel = "leap";
      else if (sawThumb) frameLabel = "jump";
      else if (sawPalm) frameLabel = "go";
      else if (sawBack) frameLabel = "back";
      else if (faceSeen) frameLabel = "look";

      store.setFrame({
        faceTracking: faceSeen,
        handTracking: handLms.length > 0,
        label: frameLabel,
        headYaw: smoothHead.yaw,
        headPitch: smoothHead.pitch,
        move,
        jumpHeld: sawThumb,
      });
      drawOverlay(frameLabel);
    }

    async function start() {
      store.setStatus("starting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
        });
        if (disposed) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        // Loaded lazily so the wasm + models only ever load after the user
        // opts in. Everything is served locally from /public — no CDN
        // needed, which matters on hackathon venue wifi.
        const { FilesetResolver, GestureRecognizer, FaceLandmarker } = await import(
          "@mediapipe/tasks-vision"
        );
        const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const make = async (delegate: "GPU" | "CPU") => {
          const h = await GestureRecognizer.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: "/models/gesture_recognizer.task", delegate },
            runningMode: "VIDEO",
            numHands: 2,
          });
          const f = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFacialTransformationMatrixes: true,
          });
          return { h, f };
        };
        try {
          ({ h: hands, f: face } = await make("GPU"));
        } catch {
          ({ h: hands, f: face } = await make("CPU"));
        }
        if (disposed) return;
        store.setStatus("on");

        const tick = () => {
          raf = requestAnimationFrame(tick);
          const now = performance.now();
          if (now - lastDetect < DETECT_INTERVAL_MS) return;
          const v = videoRef.current;
          if (!v || v.readyState < 2 || !hands || !face) return;
          lastDetect = now;

          // Face: every tick.
          const fr = face.detectForVideo(v, now);
          const angles = headAngles(fr.facialTransformationMatrixes?.[0]?.data);
          nose = fr.faceLandmarks?.[0]?.[1] ?? null;
          if (angles) {
            if (neutralYaw === null) {
              // First sight of the face defines "straight ahead".
              neutralYaw = angles.yaw;
              neutralPitch = angles.pitch;
            }
            let relYaw = angles.yaw - neutralYaw;
            let relPitch = angles.pitch - neutralPitch;
            relYaw = Math.abs(relYaw) < HEAD_DEADZONE ? 0 : relYaw - Math.sign(relYaw) * HEAD_DEADZONE;
            relPitch =
              Math.abs(relPitch) < HEAD_DEADZONE ? 0 : relPitch - Math.sign(relPitch) * HEAD_DEADZONE;
            smoothHead.yaw += (relYaw - smoothHead.yaw) * 0.35;
            smoothHead.pitch += (relPitch - smoothHead.pitch) * 0.35;
          } else {
            // Face lost: stop steering and recalibrate neutral on return,
            // since the user probably moved.
            neutralYaw = null;
            smoothHead.yaw = 0;
            smoothHead.pitch = 0;
          }

          // Hands: every other tick.
          if (tickCount % 2 === 0) {
            const hr = hands.recognizeForVideo(v, now);
            handLms = (hr.landmarks ?? []) as Landmark[][];
            pinchRatio = null;
            pinchHand = null;
            handPoses = handLms.map((lm, i) => {
              const g = hr.gestures?.[i]?.[0];
              const canned = g && g.score >= MIN_SCORE ? g.categoryName : "None";
              const handedness = hr.handedness?.[i]?.[0]?.categoryName ?? "Right";
              const pose = classifyPose(canned, lm, handedness);
              if (pose === "pinch") {
                const ratio = dist(lm[4], lm[8]) / (dist(lm[0], lm[9]) || 1);
                if (pinchRatio === null || ratio < pinchRatio) {
                  pinchRatio = ratio;
                  pinchHand = lm;
                }
              }
              return pose;
            });
          }
          tickCount++;

          processFrame(now);
        };
        tick();
      } catch (err) {
        if (!disposed) {
          console.error("Gesture tracking failed to start:", err);
          store.setStatus("error");
        }
      }
    }

    start();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      hands?.close();
      face?.close();
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      useGestureStore.getState().reset();
    };
  }, [active]);

  if (!active) {
    return (
      <button
        onClick={() => {
          sketchStore.getState().setDrawMode(false);
          setActive(true);
        }}
        className="absolute right-4 bottom-4 z-10 flex items-center gap-2 rounded-full bg-white/90 px-4 py-2.5 text-sm font-bold text-slate-700 shadow-lg ring-1 ring-slate-900/10 transition hover:bg-amber-200"
      >
        <GoIcon className="h-5 w-5" />
        Hands
      </button>
    );
  }

  return (
    <div className="absolute right-4 bottom-4 z-10 flex flex-col items-end gap-2">
      {/* Gesture legend — one icon, one word each */}
      <div className="grid grid-cols-3 gap-0.5 rounded-2xl bg-white/90 px-1.5 py-1.5 shadow-lg ring-1 ring-slate-900/10">
        {LEGEND.map(({ key, word, Icon }) => (
          <div
            key={key}
            className={
              "flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 transition-colors " +
              (label === key ? "bg-amber-300 text-slate-900" : "text-slate-500")
            }
          >
            <Icon className="h-6 w-6" />
            <span className="text-[10px] font-bold tracking-wide">{word}</span>
          </div>
        ))}
      </div>

      {/* Camera window with tracking overlay */}
      <div className="relative aspect-[4/3] w-56 overflow-hidden rounded-2xl bg-slate-900 shadow-lg ring-1 ring-slate-900/10">
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-cover"
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <button
          onClick={() => setActive(false)}
          aria-label="Turn off hand control"
          className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/60 text-xs font-bold text-white transition hover:bg-slate-900/90"
        >
          ✕
        </button>
        {status !== "on" || !faceTracking || !handTracking ? (
          <p className="absolute right-0 bottom-1.5 left-0 text-center text-xs font-bold text-white/90 drop-shadow">
            {status === "starting" && "Waking up the camera…"}
            {status === "error" && "Camera not allowed"}
            {status === "on" && !faceTracking && "Look at the camera 👀"}
            {status === "on" && faceTracking && !handTracking && "Show me your hand ✋"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
