"use client";

import {
  ChevronDown,
  ChevronRight,
  Cuboid,
  Expand,
  Gift,
  Layers3,
  Maximize2,
  Pencil,
  RefreshCw,
  Rotate3D,
  Sparkles,
  Star,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MinecraftControls, MinecraftScene } from "@/components/minecraft/App";
import { SceneCanvas } from "@/components/canvas/SceneCanvas";
import styles from "./ModelPlayground.module.css";

type ModeId = "explore" | "explode" | "sketch" | "remix" | "treasure";
type FloorId = "all" | "roof" | "upper" | "ground";
type Toast = { title: string; message: string } | null;

type MissionStep = {
  title: string;
  detail: string;
  done: boolean;
};

const MODES: Record<
  ModeId,
  {
    label: string;
    description: string;
    pill: string;
    title: string;
    guideName: string;
    guide: string;
    mission: string;
    next: string;
    color: string;
    tint: string;
    icon: typeof Layers3;
  }
> = {
  explore: {
    label: "Explore",
    description: "Walk around the model",
    pill: "Free explore",
    title: "The whole school is yours!",
    guideName: "Pip",
    guide: "Click the world, use WASD to move, and choose a view to peek inside!",
    mission: "Meet your building",
    next: "Pull the building apart",
    color: "#5f63df",
    tint: "#eeeeff",
    icon: Layers3,
  },
  explode: {
    label: "Pull It Apart",
    description: "See how it is built",
    pill: "Layer explorer",
    title: "How does the school fit together?",
    guideName: "Zig",
    guide: "Use the slider—or turn on the camera and move your hands—to reveal the layers!",
    mission: "Look between the layers",
    next: "Draw your own big idea",
    color: "#2cae87",
    tint: "#e5f7f1",
    icon: Expand,
  },
  sketch: {
    label: "Sketch to 3D",
    description: "Draw your big idea",
    pill: "Sketch to 3D",
    title: "Draw right on the model!",
    guideName: "Doodle",
    guide: "Pick a color and use your finger, stylus, or mouse to draw your big idea.",
    mission: "Make your mark",
    next: "Remix a room with your idea",
    color: "#f09b3d",
    tint: "#fff2e2",
    icon: Pencil,
  },
  remix: {
    label: "Remix a Room",
    description: "Make the space yours",
    pill: "Room remix",
    title: "Make this space feel like you!",
    guideName: "Moxie",
    guide: "Paint the world and add furniture, plants, lights, or your saved sketch.",
    mission: "Design a happy room",
    next: "Finish with a treasure hunt",
    color: "#568dc9",
    tint: "#eaf2fb",
    icon: Cuboid,
  },
  treasure: {
    label: "Treasure Hunt",
    description: "Find hidden surprises",
    pill: "Final adventure",
    title: "Find all three hidden treasures!",
    guideName: "Scout",
    guide: "Look high, low, and near the edge of the world. Tap every question mark!",
    mission: "The final treasure hunt",
    next: "Play the adventure again",
    color: "#e85675",
    tint: "#fdebf0",
    icon: Gift,
  },
};

const MODE_ORDER = Object.keys(MODES) as ModeId[];
const FLOOR_OPTIONS: { id: FloorId; label: string }[] = [
  { id: "all", label: "Whole model" },
  { id: "roof", label: "Roof" },
  { id: "upper", label: "Upper floor" },
  { id: "ground", label: "Ground" },
];
const INKS = ["#f05d72", "#5362d9", "#1d9779"];
const WALL_COLORS = ["#ff846f", "#f6c951", "#66cbb1", "#797de8"];
const INVENTORY = [
  { id: "chair", label: "Chair", emoji: "🪑" },
  { id: "plant", label: "Plant", emoji: "🪴" },
  { id: "lamp", label: "Lamp", emoji: "💡" },
  { id: "sketch", label: "My idea", emoji: "✏️" },
] as const;

function playTone(enabled: boolean, frequency = 520, duration = 0.08) {
  if (!enabled) return;
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "square";
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Sound feedback is optional.
  }
}

export default function ModelPlayground({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<ModeId>("explore");
  const [stars, setStars] = useState(128);
  const [sound, setSound] = useState(true);
  const [floor, setFloor] = useState<FloorId>("all");
  const [enteredWorld, setEnteredWorld] = useState(false);
  const [spun, setSpun] = useState(false);
  const [explode, setExplode] = useState(0);
  const [ink, setInk] = useState(INKS[0]);
  const [inkPicked, setInkPicked] = useState(false);
  const [sketchDrawn, setSketchDrawn] = useState(false);
  const [sketchSaved, setSketchSaved] = useState(false);
  const [wallColor, setWallColor] = useState<string | null>(null);
  const [placedItems, setPlacedItems] = useState<(typeof INVENTORY)[number]["id"][]>([]);
  const [treasures, setTreasures] = useState<number[]>([]);
  const [rewardedModes, setRewardedModes] = useState<ModeId[]>([]);
  const [toast, setToast] = useState<Toast>(null);
  const [gameKey, setGameKey] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [gestureStatus, setGestureStatus] = useState("Turn on the camera, then move your hands.");
  const [motion, setMotion] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const stageRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sketchRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const motionFrameRef = useRef(0);
  const previousFrameRef = useRef<Uint8Array | null>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = MODES[mode];
  const pageStyle = {
    "--mode-color": config.color,
    "--mode-tint": config.tint,
    "--world-tint": wallColor ?? "transparent",
    "--reveal": `${explode / 100}`,
  } as CSSProperties;

  const showToast = useCallback((title: string, message: string) => {
    setToast({ title, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === stageRef.current);
    const onPointerLock = () => {
      if (document.pointerLockElement) setEnteredWorld(true);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("pointerlockchange", onPointerLock);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("pointerlockchange", onPointerLock);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    cancelAnimationFrame(motionFrameRef.current);
    previousFrameRef.current = null;
    setCameraActive(false);
    setMotion(0);
    setGestureStatus("Turn on the camera, then move your hands.");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    const canvas = sketchRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const resize = () => {
      const bounds = viewport.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    return () => observer.disconnect();
  }, []);

  const missionSteps = useMemo<MissionStep[]>(() => {
    if (mode === "explode") {
      return [
        { title: "Lift the roof", detail: "Move the slider or wave your hands", done: explode >= 10 },
        { title: "Find the middle", detail: "Reveal more of the structure", done: explode >= 42 },
        { title: "See every layer", detail: "Open the model all the way", done: explode >= 82 },
      ];
    }
    if (mode === "sketch") {
      return [
        { title: "Pick a crayon", detail: "Choose a drawing color", done: inkPicked },
        { title: "Draw your idea", detail: "Use touch, stylus, or mouse", done: sketchDrawn },
        { title: "Save it for remix", detail: "Tap “Save my idea”", done: sketchSaved },
      ];
    }
    if (mode === "remix") {
      return [
        { title: "Paint the world", detail: "Choose a happy new color", done: wallColor !== null },
        { title: "Add something", detail: "Pick an item from the inventory", done: placedItems.length > 0 },
        { title: "Use your own idea", detail: "Place your saved sketch", done: placedItems.includes("sketch") },
      ];
    }
    if (mode === "treasure") {
      return [1, 2, 3].map((number) => ({
        title: `Find treasure ${number}`,
        detail: "Tap a hidden question mark",
        done: treasures.includes(number),
      }));
    }
    return [
      { title: "Enter the world", detail: "Click the Minecraft canvas", done: enteredWorld },
      { title: "Look around", detail: "Move your mouse in the world", done: spun },
      { title: "Peek inside", detail: "Choose a view below", done: floor !== "all" },
    ];
  }, [enteredWorld, explode, floor, inkPicked, mode, placedItems, sketchDrawn, sketchSaved, spun, treasures, wallColor]);

  const completed = missionSteps.filter((step) => step.done).length;
  const missionComplete = completed === missionSteps.length;
  const rewardCollected = rewardedModes.includes(mode);

  const selectMode = (nextMode: ModeId, announce = true) => {
    if (mode === "explode" && nextMode !== "explode") stopCamera();
    setMode(nextMode);
    if (document.pointerLockElement) document.exitPointerLock();
    if (announce) {
      const next = MODES[nextMode];
      showToast(next.pill, `${next.guideName} is ready to help!`);
      playTone(sound, 430 + MODE_ORDER.indexOf(nextMode) * 55);
    }
  };

  const resetWorld = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    setGameKey((key) => key + 1);
    setFloor("all");
    setExplode(0);
    showToast("Ready to explore", "The Minecraft world is back at its starting view.");
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      showToast("Fullscreen unavailable", "Your browser did not allow fullscreen mode.");
    }
  };

  const startCamera = async () => {
    if (streamRef.current) {
      stopCamera();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("Camera unavailable", "Use the pull-apart slider instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraActive(true);
      setGestureStatus("Move your hands to reveal the layers!");
      const motionCanvas = document.createElement("canvas");
      motionCanvas.width = 32;
      motionCanvas.height = 24;
      motionCanvasRef.current = motionCanvas;
      let lastRead = 0;
      const readMotion = (timestamp: number) => {
        motionFrameRef.current = requestAnimationFrame(readMotion);
        if (!streamRef.current || timestamp - lastRead < 100 || video.readyState < 2) return;
        lastRead = timestamp;
        const context = motionCanvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(video, 0, 0, 32, 24);
        const pixels = context.getImageData(0, 0, 32, 24).data;
        const frame = new Uint8Array(32 * 24);
        let difference = 0;
        for (let index = 0; index < frame.length; index += 1) {
          const pixel = index * 4;
          frame[index] = (pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2]) / 3;
          if (previousFrameRef.current) difference += Math.abs(frame[index] - previousFrameRef.current[index]);
        }
        previousFrameRef.current = frame;
        if (!difference) return;
        const nextMotion = Math.min(100, (difference / frame.length / 255) * 900);
        setMotion(nextMotion);
        setExplode(nextMotion);
        setGestureStatus(
          nextMotion > 55
            ? "Big movement—look at those layers!"
            : nextMotion > 18
              ? "I can see your hands moving!"
              : "Wave both hands a little more.",
        );
      };
      motionFrameRef.current = requestAnimationFrame(readMotion);
    } catch {
      streamRef.current = null;
      showToast("Camera permission needed", "Allow camera access, or use the slider below the model.");
    }
  };

  const sketchPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = sketchPoint(event);
    const context = event.currentTarget.getContext("2d");
    context?.beginPath();
    context?.moveTo(point.x, point.y);
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = sketchPoint(event);
    context.lineTo(point.x, point.y);
    context.strokeStyle = ink;
    context.lineWidth = 5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
    if (!sketchDrawn) setSketchDrawn(true);
  };

  const clearSketch = () => {
    const canvas = sketchRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSketchDrawn(false);
    setSketchSaved(false);
  };

  const saveSketch = () => {
    if (!sketchDrawn) {
      showToast("Draw something first", "Make a mark on the model, then save your idea.");
      return;
    }
    setSketchSaved(true);
    showToast("Idea saved!", "Your sketch is waiting in the Remix inventory.");
    playTone(sound, 720, 0.13);
  };

  const placeItem = (item: (typeof INVENTORY)[number]) => {
    if (item.id === "sketch" && !sketchSaved) {
      showToast("Save a sketch first", "Visit Sketch to 3D, draw an idea, and save it.");
      return;
    }
    setPlacedItems((items) => [...items, item.id]);
    showToast(`${item.label} added!`, "Your world is becoming one of a kind.");
    playTone(sound, 660);
  };

  const findTreasure = (number: number) => {
    if (treasures.includes(number)) return;
    setTreasures((found) => [...found, number]);
    setStars((count) => count + 5);
    showToast("Treasure found!", "You found a bonus 5-star surprise.");
    playTone(sound, 820, 0.12);
  };

  const collectReward = () => {
    if (!missionComplete || rewardCollected) return;
    setRewardedModes((modes) => [...modes, mode]);
    setStars((count) => count + 15);
    showToast("Mission complete!", "You earned 15 stars.");
    playTone(sound, 760, 0.16);
  };

  const nextMode = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];

  return (
    <main className={`${styles.playground} ${className}`} style={pageStyle}>
      <header className={styles.topbar}>
        <button className={styles.brand} type="button" onClick={() => selectMode("explore")} aria-label="Make Revit Fun Again home">
          <span className={styles.brandMark} aria-hidden="true"><span /><span /><span /></span>
          <span className={styles.brandWordmark}><small>MAKE</small><strong>REVIT</strong><em>FUN AGAIN!</em></span>
        </button>

        <button className={styles.modelStatus} type="button" onClick={() => showToast("Riverside School", "Your live Minecraft model is connected and ready.")}>
          <span className={styles.modelThumb} aria-hidden="true">⌂</span>
          <span className={styles.modelCopy}><strong>Snowden Tower</strong><small><i />Live model connected</small></span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>

        <div className={styles.profileArea}>
          <div className={styles.starScore} aria-label={`${stars} stars earned`}><span><Star size={16} fill="currentColor" /></span><strong>{stars}</strong></div>
          <button
            className={`${styles.iconButton} ${!sound ? styles.muted : ""}`}
            type="button"
            aria-label={`Turn sound ${sound ? "off" : "on"}`}
            aria-pressed={sound}
            onClick={() => {
              setSound((enabled) => !enabled);
              if (!sound) playTone(true);
            }}
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </button>
          <button className={styles.avatar} type="button" onClick={() => showToast("Hi, Amira!", "Your creative adventures and stars live here.")} aria-label="Open Amira's profile">A<span /></button>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.activityRail} aria-label="Model activities">
          <div className={styles.railHeading}><span className={styles.eyebrow}>Choose a way to play</span><h1>What will you<br />discover?</h1></div>
          <nav className={styles.activityList}>
            {MODE_ORDER.map((id, index) => {
              const activity = MODES[id];
              const Icon = activity.icon;
              const active = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`${styles.activityCard} ${active ? styles.active : ""}`}
                  style={{ "--activity": activity.color } as CSSProperties}
                  onClick={() => selectMode(id)}
                  aria-current={active ? "step" : undefined}
                >
                  <span className={styles.activityIcon}><Icon aria-hidden="true" /><b>{index + 1}</b></span>
                  <span><strong>{activity.label}</strong><small>{activity.description}</small></span>
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
          </nav>
          <button className={styles.helperCard} type="button" onClick={() => showToast(`${config.guideName} says…`, config.guide)}>
            <span className={styles.helperFace} aria-hidden="true"><i>•</i><i>•</i><b>⌣</b></span>
            <span><strong>Need a hand?</strong><small>Ask your grown-up or tap me!</small></span>
          </button>
        </aside>

        <section ref={stageRef} className={styles.modelStage} aria-label="Interactive Minecraft architectural model">
          <div className={styles.stageTop}>
            <div><span className={styles.modePill}>{config.pill}</span><h2>{config.title}</h2></div>
            <div className={styles.stageActions}>
              <button className={styles.roundAction} type="button" onClick={resetWorld} aria-label="Reset model view" title="Reset view"><RefreshCw /></button>
              <button className={styles.roundAction} type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} title="Fullscreen"><Maximize2 /></button>
            </div>
          </div>

          <div
            ref={viewportRef}
            className={`${styles.modelViewport} ${styles[`mode_${mode}`]}`}
            onPointerMove={() => {
              if (document.pointerLockElement && !spun) setSpun(true);
            }}
          >
            <div className={styles.worldTint} aria-hidden="true" />
            <MinecraftControls key={gameKey}>
              <SceneCanvas className={styles.gameCanvas} camera={{ fov: 45, position: [32, 24, 32] }}>
                <MinecraftScene />
              </SceneCanvas>
            </MinecraftControls>

            {!enteredWorld && mode !== "sketch" && (
              <div className={styles.enterHint}><span><Rotate3D /></span><strong>Click to enter the world</strong><small>WASD to move · mouse to look · Esc to exit</small></div>
            )}
            <div className={styles.crosshair} aria-hidden="true" />

            {mode === "treasure" && [1, 2, 3].map((number) => (
              <button
                key={number}
                type="button"
                className={`${styles.treasureMarker} ${styles[`marker${number}`]} ${treasures.includes(number) ? styles.found : ""}`}
                onClick={() => findTreasure(number)}
                aria-label={`Find treasure ${number}`}
              >
                {treasures.includes(number) ? "★" : "?"}
              </button>
            ))}

            <canvas
              ref={sketchRef}
              className={styles.sketchCanvas}
              aria-label="Drawing canvas"
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={() => { drawingRef.current = false; }}
              onPointerCancel={() => { drawingRef.current = false; }}
            />

            {mode === "remix" && (
              <>
                <div className={styles.remixPalette} aria-label="World color choices"><span>Paint the world</span>{WALL_COLORS.map((color) => <button key={color} type="button" style={{ "--swatch": color } as CSSProperties} onClick={() => { setWallColor(color); playTone(sound, 560); }} aria-label={`Paint ${color}`} />)}</div>
                <div className={styles.remixInventory} aria-label="Room item inventory"><span>Tap to add</span>{INVENTORY.map((item) => <button key={item.id} type="button" onClick={() => placeItem(item)}><b>{item.emoji}</b><small>{item.label}</small></button>)}</div>
                {placedItems.map((itemId, index) => {
                  const item = INVENTORY.find((entry) => entry.id === itemId)!;
                  return <span key={`${itemId}-${index}`} className={styles.placedItem} style={{ left: `${22 + (index * 17) % 56}%`, top: `${30 + (index * 13) % 38}%` }} aria-hidden="true">{item.emoji}</span>;
                })}
              </>
            )}

            {mode === "explode" && (
              <div className={styles.gesturePanel}>
                <div className={styles.cameraPreview}><video ref={videoRef} muted playsInline aria-label="Webcam hand gesture preview" />{!cameraActive && <span>👋</span>}</div>
                <div><strong>Pull with your hands!</strong><small>{gestureStatus}</small><div className={styles.motionMeter}><span style={{ width: `${motion}%` }} /></div></div>
                <button type="button" onClick={startCamera}>{cameraActive ? "Stop camera" : "Start camera"}</button>
              </div>
            )}

            <div className={styles.viewCube} aria-hidden="true"><span>TOP</span><span>FRONT</span><span>SIDE</span></div>
          </div>

          <div className={styles.stageToolbar}>
            {(mode === "explore" || mode === "treasure" || mode === "remix") && (
              <div className={styles.toolGroup}><span className={styles.toolLabel}>Show me</span>{FLOOR_OPTIONS.map((option) => <button key={option.id} type="button" className={`${styles.toolChip} ${floor === option.id ? styles.active : ""}`} onClick={() => { setFloor(option.id); playTone(sound, 490); }}>{option.label}</button>)}</div>
            )}
            {mode === "explode" && (
              <div className={`${styles.toolGroup} ${styles.explodeTools}`}><span className={styles.toolLabel}>Pull apart</span><input type="range" min="0" max="100" value={Math.round(explode)} onChange={(event) => setExplode(Number(event.target.value))} aria-label="Pull model layers apart" /><Sparkles aria-hidden="true" /></div>
            )}
            {mode === "sketch" && (
              <div className={styles.toolGroup}><span className={styles.toolLabel}>Draw with</span>{INKS.map((color) => <button key={color} type="button" className={`${styles.colorDot} ${ink === color ? styles.active : ""}`} style={{ "--ink": color } as CSSProperties} onClick={() => { setInk(color); setInkPicked(true); playTone(sound, 600); }} aria-label={`Use ${color} pencil`} />)}<button type="button" className={styles.toolChip} onClick={clearSketch}>Clear drawing</button><button type="button" className={`${styles.toolChip} ${styles.saveSketch}`} onClick={saveSketch}>Save my idea</button></div>
            )}
          </div>
        </section>

        <aside className={styles.missionPanel}>
          <div className={styles.guideBubble}>
            <div className={styles.guideCharacter} aria-hidden="true"><div className={styles.hardHat} /><div className={styles.head}><i /><i /><b /></div><div className={styles.body} /></div>
            <div><span className={styles.eyebrow}>{config.guideName} says</span><p>{config.guide}</p></div>
          </div>

          <section className={styles.missionCard}>
            <div className={styles.missionCardHead}><span className={styles.missionIcon}>◎</span><div><span className={styles.eyebrow}>Today&apos;s mini mission</span><h3>{config.mission}</h3></div></div>
            <div className={styles.progressTrack}><span style={{ width: `${(completed / missionSteps.length) * 100}%` }} /></div>
            <p className={styles.progressCopy}><strong>{completed} of {missionSteps.length}</strong> steps complete</p>
            <ol className={styles.missionSteps}>{missionSteps.map((step, index) => <li key={step.title} className={step.done ? styles.done : ""}><span>{step.done ? "✓" : index + 1}</span><p><strong>{step.title}</strong><small>{step.detail}</small></p></li>)}</ol>
            <button className={`${styles.rewardPreview} ${rewardCollected ? styles.collected : ""}`} type="button" disabled={!missionComplete || rewardCollected} onClick={collectReward} aria-label={missionComplete && !rewardCollected ? "Collect 15 mission stars" : undefined}><Star fill="currentColor" /><span><small>Mission reward</small><strong>{rewardCollected ? "Collected!" : missionComplete ? "Collect +15 stars" : "+15 stars"}</strong></span></button>
          </section>

          <button className={styles.nextAdventure} type="button" onClick={() => selectMode(nextMode)}><span>{mode === "treasure" ? "Play again" : "Next adventure"}</span><small>{config.next}</small><b>↗</b></button>
        </aside>
      </div>

      <div className={`${styles.toast} ${toast ? styles.visible : ""}`} role="status" aria-live="polite"><Star fill="currentColor" />{toast && <p><strong>{toast.title}</strong><small>{toast.message}</small></p>}</div>
    </main>
  );
}