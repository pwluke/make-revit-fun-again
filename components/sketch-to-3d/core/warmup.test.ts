import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module reads NEXT_PUBLIC_WARM_ENDPOINTS at import time and calls fal at
// module scope, so both are controlled before each dynamic import below.
// Parameters are declared even though the body ignores them: without them the
// mock's inferred arg tuple is empty and `call[0]` fails to typecheck, which is
// exactly the assertion every test here depends on.
const subscribe = vi.fn((_endpoint: string, _options?: unknown) =>
  Promise.resolve({ data: {} }),
);

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    subscribe,
  },
}));

async function loadWarmup(enabled: boolean) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_WARM_ENDPOINTS = enabled ? "1" : "0";
  const mod = await import("./warmup");
  mod.resetWarmState();
  return mod;
}

beforeEach(() => {
  subscribe.mockClear();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_WARM_ENDPOINTS;
});

describe("warmForMode", () => {
  it("does nothing at all unless explicitly enabled", async () => {
    const { warmForMode } = await loadWarmup(false);
    warmForMode("fast");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("warms exactly the endpoints the mode will use", async () => {
    const { warmForMode } = await loadWarmup(true);
    warmForMode("fast");
    const endpoints = subscribe.mock.calls.map((call) => call[0]);
    expect(endpoints).toEqual([
      "fal-ai/fast-sdxl-controlnet-canny",
      "fal-ai/trellis",
    ]);
  });

  it("does not warm the expensive mesh endpoint for fast mode", async () => {
    const { warmForMode } = await loadWarmup(true);
    warmForMode("fast");
    const endpoints = subscribe.mock.calls.map((call) => call[0]);
    expect(endpoints).not.toContain("fal-ai/hunyuan3d-v3/sketch-to-3d");
  });

  // Each warm is a billed generation, so repeat opens must not each pay again.
  it("rate-limits repeat warms within the interval", async () => {
    const { warmForMode } = await loadWarmup(true);
    warmForMode("fast", 0);
    const firstCount = subscribe.mock.calls.length;
    warmForMode("fast", 60_000);
    expect(subscribe.mock.calls.length).toBe(firstCount);
  });

  it("warms again once the interval has passed", async () => {
    const { warmForMode } = await loadWarmup(true);
    warmForMode("fast", 0);
    const firstCount = subscribe.mock.calls.length;
    warmForMode("fast", 5 * 60 * 1000);
    expect(subscribe.mock.calls.length).toBe(firstCount * 2);
  });

  // The rate-limit is per endpoint, and fast/sprite share the bridge. Warming
  // sprite right after fast should only pay for the endpoint they do NOT share.
  it("rate-limits per endpoint, not per mode", async () => {
    const { warmForMode } = await loadWarmup(true);
    warmForMode("fast", 0);
    subscribe.mockClear();
    warmForMode("sprite", 1000);
    const endpoints = subscribe.mock.calls.map((call) => call[0]);
    expect(endpoints).toEqual(["fal-ai/birefnet"]);
  });

  it("never rejects when the warm call fails", async () => {
    subscribe.mockImplementationOnce(() => Promise.reject(new Error("cold")));
    const { warmForMode } = await loadWarmup(true);
    expect(() => warmForMode("fast")).not.toThrow();
  });
});

describe("warmAll", () => {
  it("covers every endpoint across all modes, without duplicates", async () => {
    const { warmAll } = await loadWarmup(true);
    warmAll(0);
    const endpoints = subscribe.mock.calls.map((call) => call[0]);
    expect(new Set(endpoints)).toEqual(
      new Set([
        "fal-ai/fast-sdxl-controlnet-canny",
        "fal-ai/birefnet",
        "fal-ai/trellis",
        "fal-ai/hunyuan3d-v3/sketch-to-3d",
      ]),
    );
    // The bridge is shared by fast and sprite — the per-endpoint rate limit must
    // stop it being warmed twice in a single sweep.
    expect(endpoints.length).toBe(new Set(endpoints).size);
  });
});
