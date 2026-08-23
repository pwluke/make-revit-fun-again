import { NextResponse, type NextRequest } from "next/server";
import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";

// The proxy exists so FAL_KEY never reaches the browser bundle. It does NOT stop
// anyone from calling this route directly — it is public and unauthenticated, and
// every call spends real money. Hence the two controls below.
//
// Control 1: pin the proxy to our model families. Without this, whoever finds
// the route can run ANY fal model on our key, including video models that cost
// orders of magnitude more than the $0.525 a sketch generation does. This is the
// stronger of the two controls — it caps what an attacker can do, not just how often.
//
// Four families are permitted:
//   hunyuan3d-v3                 mesh mode ("Detailed 3D"), sketch -> 3D
//   fast-sdxl-controlnet-canny   shared bridge stage for sprite AND fast modes
//   birefnet                     sprite mode's background cutout
//   trellis                      fast mode ("Fast 3D"), bridge image -> 3D
//
// ADDING A MODE MEANS ADDING ITS ENDPOINT HERE. Fast 3D shipped without this
// entry and was rejected by the proxy every time — it only ever appeared to work
// because the benchmark scripts call fal directly and never touch this route.
//
// `allowedEndpoints` is only enforced on POST, and skipped for *.fal.ai domains,
// so storage uploads (rest.fal.ai) and status polling (GET) are unaffected.
const handlers = createRouteHandler({
  allowedEndpoints: [
    "fal-ai/hunyuan3d-v3/**",
    "fal-ai/fast-sdxl-controlnet-canny/**",
    "fal-ai/birefnet/**",
    "fal-ai/trellis/**",
  ],
});

export const GET = handlers.GET;
export const PUT = handlers.PUT;

// Control 2: per-IP rate limit. In-memory, so it resets on every cold start and is
// per-instance rather than global — crude, but the alternative is nothing. The
// durable backstop is the spend cap configured in the fal dashboard, which lives
// outside this code and therefore survives bugs in it.
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Counted in STAGE CALLS, not creations — this limiter sees individual fal
 * submissions and cannot tell which pipeline they belong to. The modes cost
 * different amounts of budget:
 *
 *   mesh    1 stage   (hunyuan3d-v3)
 *   fast    2 stages  (controlnet bridge -> trellis)
 *   sprite  2 stages  (controlnet bridge -> birefnet)
 *
 * At the original value of 5 that was only two-and-a-half sprite creations
 * before a 429, which is under a minute of ordinary testing and well under what
 * one child at a booth might do. 20 stages ~= 10 two-stage creations per 10
 * minutes per IP.
 *
 * Override with FAL_RATE_LIMIT while developing. The durable protection against
 * runaway spend is the fal dashboard's spend cap, which lives outside this code
 * and therefore survives bugs in it — this limiter is only the first line.
 */
const MAX_GENERATIONS = Number(process.env.FAL_RATE_LIMIT ?? 20);

const hits = new Map<string, number[]>();

/**
 * Only queue submissions spend money. Storage uploads go to rest.fal.ai and status
 * polls are GETs, so counting every POST would exhaust a user's quota on uploads
 * alone and reject their first real generation.
 */
function isGenerationSubmit(request: NextRequest): boolean {
  const target = request.headers.get("x-fal-target-url") ?? "";
  return target.includes("fal.run");
}

function clientKey(request: NextRequest): string {
  // x-real-ip is set by the platform (e.g. Vercel) and can't be spoofed by
  // the caller — prefer it when present.
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // x-forwarded-for is "client, proxy1, proxy2, ...": each hop APPENDS its
  // observed peer, so the LEFTMOST entry is whatever the original client
  // sent in its own request header — fully attacker-controlled. Reading
  // `.split(",")[0]` let anyone mint a fresh rate-limit bucket per request
  // just by sending a random value there, defeating the cap entirely at
  // $0.525/generation. The entry appended by the closest trusted proxy is
  // the LAST one, so use that instead. Do not "simplify" this back to [0].
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }

  return "unknown";
}

export async function POST(request: NextRequest): Promise<Response> {
  if (isGenerationSubmit(request)) {
    const key = clientKey(request);
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

    if (recent.length >= MAX_GENERATIONS) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    recent.push(now);
    hits.set(key, recent);

    // Keep the map from growing without bound as IPs age out.
    for (const [otherKey, timestamps] of hits) {
      if (timestamps.every((at) => now - at >= WINDOW_MS)) hits.delete(otherKey);
    }
  }

  return handlers.POST(request);
}
