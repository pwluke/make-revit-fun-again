import { NextResponse } from "next/server";

export async function GET() {
  const appId = process.env.INSTANTDB_APP_ID;
  const adminToken = process.env.INSTANTDB_ADMIN_TOKEN;

  if (!appId || !adminToken) {
    return NextResponse.json(
      {
        configured: false,
        meshes: [],
        message: "Add InstantDB credentials to connect a live Rhino or Revit model.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch("https://api.instantdb.com/admin/query", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "App-Id": appId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { meshes: {} } }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`InstantDB returned ${response.status}`);
    }

    const data = await response.json();
    const meshes = Array.isArray(data.meshes) ? data.meshes : [];

    return NextResponse.json(
      {
        configured: true,
        meshes,
        updatedAt: meshes.reduce(
          (latest, mesh) => Math.max(latest, Number(mesh.updatedAt) || 0),
          0,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        meshes: [],
        error: error instanceof Error ? error.message : "Model stream unavailable",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}