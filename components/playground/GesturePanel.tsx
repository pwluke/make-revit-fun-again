"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayground } from "./playground-context";

export function GesturePanel() {
  const { setExplode, showToast } = usePlayground();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  const previousFrame = useRef<Uint8Array | null>(null);
  const lastRead = useRef(0);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState(
    "Turn on the camera, then move your hands.",
  );
  const [motion, setMotion] = useState(0);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    previousFrame.current = null;
    window.cancelAnimationFrame(frameRef.current);
    setActive(false);
    setMotion(0);
    setStatus("Turn on the camera, then move your hands.");
  };

  const startCamera = async () => {
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
      setActive(true);
      setStatus("Move your hands to separate the layers!");
      previousFrame.current = null;

      const motionCanvas = document.createElement("canvas");
      motionCanvas.width = 32;
      motionCanvas.height = 24;
      const motionContext = motionCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!motionContext) return;

      const readMotion = (timestamp: number) => {
        frameRef.current = window.requestAnimationFrame(readMotion);
        if (
          !streamRef.current ||
          timestamp - lastRead.current < 100 ||
          video.readyState < 2
        ) {
          return;
        }
        lastRead.current = timestamp;
        motionContext.drawImage(video, 0, 0, 32, 24);
        const pixels = motionContext.getImageData(0, 0, 32, 24).data;
        const frame = new Uint8Array(32 * 24);
        let difference = 0;

        for (let index = 0; index < frame.length; index += 1) {
          const pixel = index * 4;
          frame[index] =
            (pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2]) / 3;
          if (previousFrame.current) {
            difference += Math.abs(frame[index] - previousFrame.current[index]);
          }
        }

        previousFrame.current = frame;
        if (!difference) return;
        const next = Math.min(100, (difference / frame.length / 255) * 900);
        setMotion(next);
        setExplode(next);
        setStatus(
          next > 55
            ? "Big movement—look at those layers!"
            : next > 18
              ? "I can see your hands moving!"
              : "Wave both hands a little more.",
        );
      };

      frameRef.current = window.requestAnimationFrame(readMotion);
    } catch {
      streamRef.current = null;
      showToast(
        "Camera permission needed",
        "Allow camera access, or use the slider below the model.",
      );
    }
  };

  return (
    <div className="gesture-panel">
      <div className="camera-preview">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Webcam hand gesture preview"
        />
        {!active ? <span>👋</span> : null}
      </div>
      <div>
        <strong>Pull with your hands!</strong>
        <small>{status}</small>
        <div className="motion-meter">
          <span style={{ width: `${motion}%` }} />
        </div>
      </div>
      <button type="button" onClick={active ? stopCamera : startCamera}>
        {active ? "Stop camera" : "Start camera"}
      </button>
    </div>
  );
}
