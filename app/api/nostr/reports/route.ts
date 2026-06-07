import { NextRequest, NextResponse } from "next/server";
import { getCachedHackathonReportsSnapshot } from "@/lib/nostrReportsCache";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hackathonId = (searchParams.get("hackathonId") ?? "").trim();
  const projectId = (searchParams.get("projectId") ?? "").trim();
  if (!hackathonId) {
    return NextResponse.json({ error: "Falta hackathonId." }, { status: 400 });
  }
  const snapshot = await getCachedHackathonReportsSnapshot(hackathonId);
  if (projectId) {
    return NextResponse.json({
      hackathonId,
      projectId,
      report: snapshot.reports[projectId] ?? null,
      generatedAt: snapshot.generatedAt,
      relays: snapshot.relays,
    });
  }
  return NextResponse.json(snapshot);
}
