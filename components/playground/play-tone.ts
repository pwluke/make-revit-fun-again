export function playTone(enabled: boolean, frequency = 520, duration = 0.08) {
  if (!enabled || typeof window === "undefined") return;

  try {
    const Context =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Context) return;

    const context = new Context();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "square";
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + duration,
    );
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    oscillator.addEventListener("ended", () => {
      void context.close();
    });
  } catch {
    // Audio feedback is optional, matching the prototype.
  }
}
