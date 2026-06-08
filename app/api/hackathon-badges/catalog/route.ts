import { connection, NextResponse } from "next/server";
import { getHackathon } from "@/lib/hackathons";
import { getCachedHackathonBadgeCatalogSnapshot } from "@/lib/hackathonBadgeCache";

export async function GET(req: Request) {
  await connection();
  const { searchParams } = new URL(req.url);
  const hackathonId = searchParams.get("hackathonId")?.trim() || "";
  if (!hackathonId) {
    return NextResponse.json({ error: "Falta hackathonId." }, { status: 400 });
  }
  if (!getHackathon(hackathonId)) {
    return NextResponse.json({ error: "Hackaton no encontrada." }, { status: 404 });
  }

  try {
    return NextResponse.json(
      await getCachedHackathonBadgeCatalogSnapshot(hackathonId),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo buscar catalogo de badges.",
      },
      { status: 500 },
    );
  }
}
