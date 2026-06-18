import { ImageResponse } from "next/og";
import {
  HACKATHONS,
  formatSats,
  getHackathon,
  getHackathonProjects,
  getProject,
  hackathonSlug,
  hackathonSlugForId,
  prizeForProject,
} from "@/lib/hackathons";
import {
  getNostrProject,
  getNostrSubmissionsSnapshot,
} from "@/lib/nostrCache";

export const alt = "Proyecto · Hackatón · La Crypta Dev";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  const hackathonIds = new Set(HACKATHONS.map((h) => h.id));
  // Dedup keys off the canonical id; the route segment is the public slug.
  const seen = new Set<string>();
  const out: { id: string; projectId: string }[] = [];

  for (const h of HACKATHONS) {
    for (const p of getHackathonProjects(h.id)) {
      const key = `${h.id}/${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: hackathonSlug(h), projectId: p.id });
    }
  }

  const { projects } = await getNostrSubmissionsSnapshot();
  for (const p of projects) {
    if (!p.hackathon || !hackathonIds.has(p.hackathon)) continue;
    const key = `${p.hackathon}/${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: hackathonSlugForId(p.hackathon), projectId: p.id });
  }

  return out;
}

const STATUS_COLOR: Record<string, string> = {
  official: "#f7931a",
  winner: "#ffd700",
  finalist: "#22d3ee",
  submitted: "#a855f7",
  building: "#a1a1aa",
  idea: "#71717a",
};

function medal(position: number | null | undefined) {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return null;
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>;
}) {
  const { id: routeParam, projectId } = await params;
  const h = getHackathon(routeParam);
  if (!h) {
    const { default: DefaultOG } = await import("../../../opengraph-image");
    return DefaultOG();
  }
  // Data lookups key off the canonical id, not the slug.
  const id = h.id;

  const curated = getProject(id, projectId);
  let name: string;
  let description: string;
  let status: string;
  let position: number | null = null;
  let prize: number | null = null;

  if (curated) {
    name = curated.name;
    description = curated.description;
    status = curated.status;
    position = curated.report?.position ?? null;
    prize = prizeForProject(id, projectId)?.prize ?? null;
  } else {
    const fromNostr = await getNostrProject(id, projectId);
    if (!fromNostr) {
      const { default: HackathonOG } = await import("../opengraph-image");
      return HackathonOG({ params });
    }
    name = fromNostr.name;
    description = fromNostr.description;
    status = fromNostr.status;
  }

  const statusColor = STATUS_COLOR[status] ?? "#a1a1aa";
  const positionMedal = medal(position);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "radial-gradient(ellipse 80% 60% at 30% 0%, rgba(247,147,26,0.16), transparent 60%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(168,85,247,0.16), transparent 60%), #05070e",
          color: "#f4f4f5",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            letterSpacing: 4,
            color: "#a1a1aa",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          <div style={{ display: "flex", fontSize: 28 }}>{h.icon}</div>
          {h.name} · Hackatón #{String(h.number).padStart(2, "0")}
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 32 }}>
          {positionMedal && (
            <div style={{ fontSize: 180, lineHeight: 1, display: "flex" }}>
              {positionMedal}
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: 80,
                fontWeight: 800,
                letterSpacing: -2,
                lineHeight: 1.0,
                display: "flex",
                wordBreak: "break-word",
              }}
            >
              {name}
            </div>
            {description && (
              <div
                style={{
                  fontSize: 30,
                  color: "#a1a1aa",
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {description}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            fontFamily: "monospace",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: `2px solid ${statusColor}`,
                color: statusColor,
                display: "flex",
              }}
            >
              {status}
            </span>
            {prize != null && (
              <span
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  background: "rgba(247,147,26,0.12)",
                  border: "2px solid rgba(247,147,26,0.4)",
                  color: "#f7931a",
                  display: "flex",
                }}
              >
                🏆 {formatSats(prize)} sats
              </span>
            )}
          </div>
          <div style={{ color: "#71717a" }}>lacrypta.dev</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
