(() => {
  "use strict";

  const MODES = {
    explore: {
      pill: "Free explore",
      title: "The whole school is yours!",
      guideName: "Pip",
      guide: "Try spinning the model, then pick a floor to peek inside!",
      companion: "👷🏾",
      mission: "Meet your building",
      next: "Pull the building apart",
    },
    explode: {
      pill: "Layer explorer",
      title: "How does the school fit together?",
      guideName: "Zig",
      guide: "Use the slider—or turn on the camera and move your hands—to pull the layers apart!",
      companion: "🤖",
      mission: "Look between the layers",
      next: "Draw your own big idea",
    },
    sketch: {
      pill: "Sketch to 3D",
      title: "Draw right on the model!",
      guideName: "Doodle",
      guide: "Pick a color and use your finger, stylus, or mouse to draw your big idea.",
      companion: "🖍️",
      mission: "Make your mark",
      next: "Remix a room with your idea",
    },
    remix: {
      pill: "Room remix",
      title: "Make this space feel like you!",
      guideName: "Moxie",
      guide: "Paint the walls and tap furniture, plants, lights, or your saved sketch to add them.",
      companion: "🦊",
      mission: "Design a happy room",
      next: "Finish with a treasure hunt",
    },
    treasure: {
      pill: "Final adventure",
      title: "Find all three hidden treasures!",
      guideName: "Scout",
      guide: "Look high, low, and around the trees. Tap every question mark you discover!",
      companion: "🦉",
      mission: "The final treasure hunt",
      next: "Play the adventure again",
    },
  };

  const MODE_ORDER = ["explore", "explode", "sketch", "remix", "treasure"];
  const ITEM_EMOJI = { chair: "🪑", plant: "🪴", lamp: "💡", sketch: "✏️" };

  const state = {
    mode: "explore",
    stars: 128,
    sound: true,
    rotation: 0,
    zoom: 1,
    floor: "all",
    explode: 0,
    spun: false,
    ink: "#f05d72",
    inkPicked: false,
    sketchDrawn: false,
    sketchSaved: false,
    paintedColors: new Set(),
    placedItems: [],
    treasures: new Set(),
    rewardedModes: new Set(),
  };

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const body = document.body;
  const activityCards = $$(".activity-card");
  const viewport = $("#modelViewport");
  const buildingWrap = $("#buildingWrap");
  const building = $("#building");
  const toolbar = $("#stageToolbar");
  const modePill = $("#modePill");
  const stageTitle = $("#stageTitle");
  const guideName = $("#guideName");
  const guideText = $("#guideText");
  const missionTitle = $("#missionTitle");
  const missionSteps = $("#missionSteps");
  const progressBar = $("#progressBar");
  const progressText = $("#progressText");
  const rewardPreview = $(".reward-preview");
  const rewardText = $(".reward-preview strong");
  const starCount = $("#starCount");
  const toast = $("#toast");
  const toastTitle = $(".toast strong");
  const toastMessage = $(".toast small");
  const nextDescription = $("#nextDescription");
  const explodeRange = $("#explodeRange");
  const orbitHint = $("#orbitHint");
  let toastTimer;

  function showToast(title, message) {
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  function playTone(frequency = 520, duration = 0.08) {
    if (!state.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "square";
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
      oscillator.addEventListener("ended", () => context.close());
    } catch {
      // Audio feedback is optional in the prototype.
    }
  }

  function addStars(amount) {
    state.stars += amount;
    starCount.textContent = state.stars;
    $(".star-score").setAttribute("aria-label", `${state.stars} stars earned`);
  }

  function getMission() {
    if (state.mode === "explode") {
      return [
        { title: "Lift the roof", detail: "Move the slider or wave your hands", done: state.explode >= 10 },
        { title: "Find the middle", detail: "Pull the layers farther apart", done: state.explode >= 42 },
        { title: "See every layer", detail: "Open the building all the way", done: state.explode >= 82 },
      ];
    }

    if (state.mode === "sketch") {
      return [
        { title: "Pick a crayon", detail: "Choose a drawing color", done: state.inkPicked },
        { title: "Draw your idea", detail: "Use touch, stylus, or mouse", done: state.sketchDrawn },
        { title: "Save it for remix", detail: "Tap “Save my idea”", done: state.sketchSaved },
      ];
    }

    if (state.mode === "remix") {
      return [
        { title: "Paint the walls", detail: "Choose a happy new color", done: state.paintedColors.size > 0 },
        { title: "Add something", detail: "Pick an item from the inventory", done: state.placedItems.length > 0 },
        { title: "Use your own idea", detail: "Place your Sketch to 3D creation", done: state.placedItems.includes("sketch") },
      ];
    }

    if (state.mode === "treasure") {
      return [1, 2, 3].map((number) => ({
        title: `Find treasure ${number}`,
        detail: "Tap a hidden question mark",
        done: state.treasures.has(number),
      }));
    }

    return [
      { title: "Say hello!", detail: "Open the live school model", done: true },
      { title: "Spin it around", detail: "Drag anywhere on the model", done: state.spun },
      { title: "Peek inside", detail: "Choose a floor below", done: state.floor !== "all" },
    ];
  }

  function renderMission() {
    const steps = getMission();
    const completed = steps.filter((step) => step.done).length;
    const finished = completed === steps.length;

    missionSteps.replaceChildren(
      ...steps.map((step, index) => {
        const item = document.createElement("li");
        if (step.done) item.classList.add("done");

        const marker = document.createElement("span");
        marker.textContent = step.done ? "✓" : String(index + 1);
        const copy = document.createElement("p");
        const title = document.createElement("strong");
        const detail = document.createElement("small");
        title.textContent = step.title;
        detail.textContent = step.detail;
        copy.append(title, detail);
        item.append(marker, copy);
        return item;
      }),
    );

    progressBar.style.width = `${(completed / steps.length) * 100}%`;
    progressText.textContent = `${completed} of ${steps.length}`;

    if (finished && !state.rewardedModes.has(state.mode)) {
      state.rewardedModes.add(state.mode);
      addStars(15);
      rewardPreview.classList.add("collected");
      rewardText.textContent = "Collected!";
      showToast("Mission complete!", "You earned 15 stars.");
      playTone(760, 0.16);
    } else {
      rewardPreview.classList.toggle("collected", state.rewardedModes.has(state.mode));
      rewardText.textContent = state.rewardedModes.has(state.mode) ? "Collected!" : "+15 stars";
    }
  }

  function setMode(mode, announce = false) {
    if (!MODES[mode]) return;
    state.mode = mode;
    const config = MODES[mode];

    body.dataset.mode = mode;
    viewport.dataset.mode = mode;
    viewport.className = `model-viewport mode-${mode}`;
    toolbar.dataset.mode = mode;

    activityCards.forEach((card) => {
      const active = card.dataset.mode === mode;
      card.classList.toggle("active", active);
      if (active) card.setAttribute("aria-current", "step");
      else card.removeAttribute("aria-current");
    });

    modePill.textContent = config.pill;
    stageTitle.textContent = config.title;
    guideName.textContent = `${config.guideName} says`;
    guideText.textContent = config.guide;
    missionTitle.textContent = config.mission;
    const currentIndex = MODE_ORDER.indexOf(mode);
    const nextMode = MODE_ORDER[(currentIndex + 1) % MODE_ORDER.length];
    nextDescription.textContent = config.next;
    $("#nextLabel").textContent = mode === "treasure" ? "Play again" : "Next adventure";
    $("#surpriseButton").dataset.nextMode = nextMode;

    renderMission();
    if (announce) {
      showToast(config.pill, `${config.guideName} is ready to help!`);
      playTone(430 + currentIndex * 55);
    }
  }

  activityCards.forEach((card) => {
    card.addEventListener("click", () => setMode(card.dataset.mode, true));
  });

  $("#surpriseButton").addEventListener("click", (event) => {
    setMode(event.currentTarget.dataset.nextMode, true);
  });

  $(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    setMode("explore", true);
  });

  $("#helperButton").addEventListener("click", () => {
    const config = MODES[state.mode];
    showToast(`${config.guideName} says…`, config.guide);
  });

  // Model orbit, zoom, reset, floor selection, and fullscreen.
  let dragging = false;
  let dragStartX = 0;
  let dragStartRotation = 0;

  viewport.addEventListener("pointerdown", (event) => {
    if (state.mode === "sketch" || event.target.closest("button, .gesture-panel, .remix-palette, .remix-inventory")) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartRotation = state.rotation;
    building.classList.add("dragging");
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const distance = event.clientX - dragStartX;
    state.rotation = dragStartRotation + distance * 0.12;
    building.style.setProperty("--model-rotation", `${state.rotation}deg`);
    if (!state.spun && Math.abs(distance) > 8) {
      state.spun = true;
      orbitHint.classList.add("hidden");
      renderMission();
    }
  });

  function endDrag() {
    dragging = false;
    building.classList.remove("dragging");
  }

  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  function updateZoom(nextZoom) {
    state.zoom = Math.min(1.55, Math.max(0.65, nextZoom));
    building.style.setProperty("--model-zoom", state.zoom.toFixed(2));
  }

  $("#zoomIn").addEventListener("click", () => updateZoom(state.zoom + 0.1));
  $("#zoomOut").addEventListener("click", () => updateZoom(state.zoom - 0.1));
  viewport.addEventListener("wheel", (event) => {
    if (event.ctrlKey || Math.abs(event.deltaY) > 0) {
      event.preventDefault();
      updateZoom(state.zoom + (event.deltaY < 0 ? 0.08 : -0.08));
    }
  }, { passive: false });

  $$("[data-floor]").filter((element) => element.matches("button")).forEach((button) => {
    button.addEventListener("click", () => {
      state.floor = button.dataset.floor;
      buildingWrap.dataset.floor = state.floor;
      $$("button[data-floor]").forEach((item) => item.classList.toggle("active", item === button));
      renderMission();
      playTone(490);
    });
  });

  function setExplode(value, fromCamera = false) {
    state.explode = Math.min(100, Math.max(0, Number(value)));
    building.style.setProperty("--explode", state.explode);
    explodeRange.value = String(Math.round(state.explode));
    if (!fromCamera || state.explode % 4 < 1) renderMission();
  }

  explodeRange.addEventListener("input", (event) => setExplode(event.target.value));

  $("#resetButton").addEventListener("click", () => {
    state.rotation = 0;
    state.zoom = 1;
    state.floor = "all";
    setExplode(0);
    building.style.setProperty("--model-rotation", "0deg");
    building.style.setProperty("--model-zoom", "1");
    buildingWrap.dataset.floor = "all";
    $$("button[data-floor]").forEach((button) => button.classList.toggle("active", button.dataset.floor === "all"));
    showToast("Ready to explore", "The model is back to its starting view.");
  });

  $("#fullscreenButton").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $(".model-stage").requestFullscreen();
    } catch {
      showToast("Fullscreen unavailable", "Your browser did not allow fullscreen mode.");
    }
  });

  document.addEventListener("fullscreenchange", () => {
    const active = Boolean(document.fullscreenElement);
    $("#fullscreenButton").setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
  });

  // Touch-friendly sketch canvas.
  const canvas = $("#sketchCanvas");
  const context = canvas.getContext("2d");
  let drawing = false;

  function resizeCanvas() {
    const bounds = viewport.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
    canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function canvasPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const point = canvasPoint(event);
    context.lineTo(point.x, point.y);
    context.strokeStyle = state.ink;
    context.lineWidth = 5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
    if (!state.sketchDrawn) {
      state.sketchDrawn = true;
      renderMission();
    }
  });

  canvas.addEventListener("pointerup", () => { drawing = false; });
  canvas.addEventListener("pointercancel", () => { drawing = false; });

  $$("[data-ink]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ink = button.dataset.ink;
      state.inkPicked = true;
      $$("[data-ink]").forEach((item) => item.classList.toggle("active", item === button));
      renderMission();
      playTone(600);
    });
  });

  $("#clearSketch").addEventListener("click", () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    state.sketchDrawn = false;
    state.sketchSaved = false;
    renderMission();
  });

  $("#saveSketch").addEventListener("click", () => {
    if (!state.sketchDrawn) {
      showToast("Draw something first", "Make a mark on the model, then save your idea.");
      return;
    }
    state.sketchSaved = true;
    renderMission();
    showToast("Idea saved!", "Your sketch is waiting in the Remix inventory.");
    playTone(720, 0.13);
  });

  new ResizeObserver(resizeCanvas).observe(viewport);
  resizeCanvas();

  // Remix colors and draggable-looking inventory placements.
  function shadeHex(hex, amount) {
    const value = Number.parseInt(hex.slice(1), 16);
    const red = Math.max(0, Math.min(255, (value >> 16) + amount));
    const green = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
    const blue = Math.max(0, Math.min(255, (value & 255) + amount));
    return `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;
  }

  $$("[data-color]").forEach((button) => {
    button.addEventListener("click", () => {
      const color = button.dataset.color;
      building.style.setProperty("--wall-light", color);
      building.style.setProperty("--wall-mid", shadeHex(color, -28));
      state.paintedColors.add(color);
      renderMission();
      playTone(560);
    });
  });

  $$("[data-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.dataset.item;
      if (item === "sketch" && !state.sketchSaved) {
        showToast("Save a sketch first", "Visit Sketch to 3D, draw an idea, and save it.");
        return;
      }

      const placed = document.createElement("span");
      placed.className = "placed-item";
      placed.textContent = ITEM_EMOJI[item];
      placed.style.left = `${22 + (state.placedItems.length * 17) % 56}%`;
      placed.style.top = `${30 + (state.placedItems.length * 13) % 38}%`;
      placed.setAttribute("aria-hidden", "true");
      buildingWrap.append(placed);
      state.placedItems.push(item);
      renderMission();
      showToast(`${button.querySelector("small").textContent} added!`, "Your room is becoming one of a kind.");
      playTone(660);
    });
  });

  // Treasure hunt.
  $$("[data-treasure]").forEach((marker) => {
    marker.addEventListener("click", () => {
      const number = Number(marker.dataset.treasure);
      if (state.treasures.has(number)) return;
      state.treasures.add(number);
      marker.classList.add("found");
      marker.textContent = "★";
      addStars(5);
      renderMission();
      showToast("Treasure found!", "You found a bonus 5-star surprise.");
      playTone(820, 0.12);
    });
  });

  // Webcam motion prototype for Pull It Apart.
  const cameraButton = $("#cameraButton");
  const gestureVideo = $("#gestureVideo");
  const cameraPlaceholder = $("#cameraPlaceholder");
  const gestureStatus = $("#gestureStatus");
  const motionMeter = $("#motionMeter");
  const motionCanvas = document.createElement("canvas");
  motionCanvas.width = 32;
  motionCanvas.height = 24;
  const motionContext = motionCanvas.getContext("2d", { willReadFrequently: true });
  let cameraStream = null;
  let previousFrame = null;
  let motionFrame = 0;
  let lastMotionRead = 0;

  function stopCamera() {
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    gestureVideo.srcObject = null;
    cameraPlaceholder.style.display = "block";
    cameraButton.textContent = "Start camera";
    gestureStatus.textContent = "Turn on the camera, then move your hands.";
    motionMeter.style.width = "0%";
    previousFrame = null;
    cancelAnimationFrame(motionFrame);
  }

  function readMotion(timestamp) {
    motionFrame = requestAnimationFrame(readMotion);
    if (!cameraStream || timestamp - lastMotionRead < 100 || gestureVideo.readyState < 2) return;
    lastMotionRead = timestamp;
    motionContext.drawImage(gestureVideo, 0, 0, 32, 24);
    const pixels = motionContext.getImageData(0, 0, 32, 24).data;
    const frame = new Uint8Array(32 * 24);
    let difference = 0;

    for (let index = 0; index < frame.length; index += 1) {
      const pixel = index * 4;
      frame[index] = (pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2]) / 3;
      if (previousFrame) difference += Math.abs(frame[index] - previousFrame[index]);
    }

    previousFrame = frame;
    if (!difference) return;
    const motion = Math.min(100, (difference / frame.length / 255) * 900);
    motionMeter.style.width = `${motion}%`;
    gestureStatus.textContent = motion > 55 ? "Big movement—look at those layers!" : motion > 18 ? "I can see your hands moving!" : "Wave both hands a little more.";
    setExplode(motion, true);
  }

  cameraButton.addEventListener("click", async () => {
    if (cameraStream) {
      stopCamera();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("Camera unavailable", "Use the pull-apart slider instead.");
      return;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320 }, audio: false });
      gestureVideo.srcObject = cameraStream;
      await gestureVideo.play();
      cameraPlaceholder.style.display = "none";
      cameraButton.textContent = "Stop camera";
      gestureStatus.textContent = "Move your hands to separate the layers!";
      previousFrame = null;
      motionFrame = requestAnimationFrame(readMotion);
    } catch {
      cameraStream = null;
      showToast("Camera permission needed", "Allow camera access, or use the slider below the model.");
    }
  });

  window.addEventListener("beforeunload", stopCamera);

  // Sound and small header interactions.
  $("#soundButton").addEventListener("click", (event) => {
    state.sound = !state.sound;
    event.currentTarget.classList.toggle("muted", !state.sound);
    event.currentTarget.setAttribute("aria-pressed", String(state.sound));
    event.currentTarget.setAttribute("aria-label", `Turn sound ${state.sound ? "off" : "on"}`);
    if (state.sound) playTone(520);
  });

  $(".chevron").addEventListener("click", () => showToast("Riverside School", "This prototype is ready for another live model stream."));
  $(".avatar").addEventListener("click", () => showToast("Hi, Amira!", "Your creative adventures and stars live here."));

  // Keep the custom pixel hand under the pointer while the anchored guide
  // character follows it with only their eyes, head, and torso.
  const pixelCursor = $("#pixelCursor");
  const guideCharacter = $(".guide-character");

  window.addEventListener("pointermove", (event) => {
    pixelCursor.style.transform = `translate3d(${event.clientX - 5}px,${event.clientY - 2}px,0)`;
    pixelCursor.classList.add("visible");

    if (guideCharacter) {
      const bounds = guideCharacter.getBoundingClientRect();
      const offsetX = event.clientX - (bounds.left + bounds.width / 2);
      const offsetY = event.clientY - (bounds.top + bounds.height / 2);
      const distance = Math.max(1, Math.hypot(offsetX, offsetY));
      const strength = Math.min(1, distance / 180);
      guideCharacter.style.setProperty("--look-x", `${(offsetX / distance) * strength}`);
      guideCharacter.style.setProperty("--look-y", `${(offsetY / distance) * strength}`);
    }
  });

  window.addEventListener("pointerdown", () => pixelCursor.classList.add("pressed"));
  window.addEventListener("pointerup", () => pixelCursor.classList.remove("pressed"));
  document.documentElement.addEventListener("mouseleave", () => {
    pixelCursor.classList.remove("visible");
    guideCharacter?.style.setProperty("--look-x", "0");
    guideCharacter?.style.setProperty("--look-y", "0");
  });

  // Lightweight stream adapter contract for Rhino/Revit prototype integrations.
  function setConnection(status, message) {
    const dot = $("#connectionDot");
    dot.classList.remove("offline", "syncing");
    if (status === "offline") dot.classList.add("offline");
    if (status === "syncing") dot.classList.add("syncing");
    $("#connectionText").textContent = message || (status === "offline" ? "Model stream offline" : status === "syncing" ? "Receiving model update…" : "Live model connected");
  }

  function receiveModelUpdate(payload = {}) {
    setConnection("syncing");
    if (payload.name) $("#modelName").textContent = payload.name;
    if (Number.isFinite(payload.rotation)) {
      state.rotation = payload.rotation;
      building.style.setProperty("--model-rotation", `${state.rotation}deg`);
    }
    if (Number.isFinite(payload.explode)) setExplode(payload.explode);
    if (["all", "roof", "upper", "ground"].includes(payload.floor)) {
      state.floor = payload.floor;
      buildingWrap.dataset.floor = payload.floor;
      $$("button[data-floor]").forEach((button) => button.classList.toggle("active", button.dataset.floor === payload.floor));
    }
    if (payload.wallColor && /^#[0-9a-f]{6}$/i.test(payload.wallColor)) {
      building.style.setProperty("--wall-light", payload.wallColor);
      building.style.setProperty("--wall-mid", shadeHex(payload.wallColor, -28));
    }
    building.animate([{ opacity: 0.72 }, { opacity: 1 }], { duration: 380 });
    window.setTimeout(() => setConnection(payload.connected === false ? "offline" : "live", payload.message), 350);
  }

  window.MRFAPrototype = {
    receiveModelUpdate,
    setConnection,
    setMode,
    getState: () => ({ ...state, paintedColors: [...state.paintedColors], treasures: [...state.treasures], rewardedModes: [...state.rewardedModes] }),
  };

  window.addEventListener("message", (event) => {
    if (event.data?.type === "MRFA_MODEL_UPDATE") receiveModelUpdate(event.data.payload);
  });

  document.addEventListener("mrfa:model-update", (event) => receiveModelUpdate(event.detail));

  setMode("explore");
})();