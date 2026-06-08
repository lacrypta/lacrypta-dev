import { connection, NextResponse } from "next/server";
import { getCachedHackathonBadgeDefinitionsSnapshot } from "@/lib/hackathonBadgeCache";

type DefinitionsBody = {
  aTags?: unknown;
};

function parseATags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string"))]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 64);
}

export async function POST(req: Request) {
  await connection();
  let body: DefinitionsBody;
  try {
    body = (await req.json()) as DefinitionsBody;
  } catch {
    return NextResponse.json({ error: "Body JSON invalido." }, { status: 400 });
  }

  const aTags = parseATags(body.aTags);
  if (aTags.length === 0) {
    return NextResponse.json({ definitions: {} });
  }

  try {
    return NextResponse.json(
      await getCachedHackathonBadgeDefinitionsSnapshot(aTags),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron buscar definiciones de badges.",
      },
      { status: 500 },
    );
  }
}
