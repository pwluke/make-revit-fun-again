import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// A dev-time log of who has played, not a production database: `fs` is
// read-only (or entirely absent) on most hosted deployments, so this only
// persists while the app is run locally with `npm run dev`.
const FILE = path.join(process.cwd(), "data", "players.json");
const MAX_NAME_LENGTH = 40;

async function readRoster() {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const name =
    typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";

  if (!name) {
    return NextResponse.json({ error: "A name is required" }, { status: 400 });
  }

  const roster = await readRoster();
  roster.push({ name, joinedAt: new Date().toISOString() });

  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(roster, null, 2) + "\n");

  return NextResponse.json(
    { ok: true, count: roster.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
