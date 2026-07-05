import { ImageResponse } from "next/og";
import { formatSats, prizeForProject } from "@/lib/hackathons";
import {
  getCanonicalProjectRefs,
  resolveProjectParam,
} from "@/lib/projectResolver";

export const alt = "Proyecto · La Crypta Dev";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  try {
    const refs = await getCanonicalProjectRefs();
    return refs.map((r) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

const STATUS_COLOR: Record<string, string> = {
  official: "#f7931a",
  live: "#22c55e",
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
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolveProjectParam(slug);
  if (resolved.kind !== "project") {
    const { default: DefaultOG } = await import("../../opengraph-image");
    return DefaultOG();
  }

  const project = resolved.curated ?? resolved.home ?? resolved.nostr;
  if (!project) {
    const { default: DefaultOG } = await import("../../opengraph-image");
    return DefaultOG();
  }

  const h = resolved.hackathon;
  const name = project.name;
  const description = project.description;
  const status = project.status;
  const position = resolved.curated?.report?.position ?? null;
  const prize =
    resolved.curated && resolved.curated.hackathon
      ? (prizeForProject(resolved.curated.hackathon, resolved.curated.id)?.prize ??
        null)
      : null;

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
          {h ? (
            <>
              <div style={{ display: "flex", fontSize: 28 }}>{h.icon}</div>
              {h.name} · Hackatón #{String(h.number).padStart(2, "0")}
            </>
          ) : (
            <>Proyectos · La Crypta Dev</>
          )}
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
