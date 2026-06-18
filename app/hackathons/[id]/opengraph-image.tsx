import { ImageResponse } from "next/og";
import {
  HACKATHONS,
  PROGRAM,
  formatSats,
  getHackathon,
  hackathonSlug,
} from "@/lib/hackathons";

export const alt = "Hackatón · La Crypta Dev";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return HACKATHONS.map((h) => ({ id: hackathonSlug(h) }));
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Beginner: "#22c55e",
  Intermediate: "#22d3ee",
  Advanced: "#a855f7",
  Expert: "#f7931a",
};

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const h = getHackathon(id);
  if (!h) {
    // Default fallback (should be unreachable through generateStaticParams).
    const { default: DefaultOG } = await import("../../opengraph-image");
    return DefaultOG();
  }

  const difficultyColor = DIFFICULTY_COLOR[h.difficulty] ?? "#a1a1aa";
  const firstDate = h.dates[0]?.date.slice(8, 10);
  const lastDate = h.dates[h.dates.length - 1]?.date.slice(8, 10);
  const dateRange =
    firstDate && lastDate ? `${firstDate}–${lastDate} ${h.monthShort} ${h.year}` : "";

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
            "radial-gradient(ellipse 80% 60% at 30% 0%, rgba(247,147,26,0.18), transparent 60%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(168,85,247,0.18), transparent 60%), #05070e",
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
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#f7931a",
              boxShadow: "0 0 24px #f7931a",
            }}
          />
          La Crypta Dev · Hackatón #{String(h.number).padStart(2, "0")}
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 32 }}>
          <div style={{ fontSize: 180, lineHeight: 1, display: "flex" }}>
            {h.icon}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
            <div
              style={{
                fontSize: 92,
                fontWeight: 800,
                letterSpacing: -2,
                lineHeight: 1.0,
                display: "flex",
              }}
            >
              {h.name}
            </div>
            <div
              style={{
                fontSize: 36,
                color: "#a1a1aa",
                lineHeight: 1.3,
                display: "flex",
              }}
            >
              {h.focus}
            </div>
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
                border: `2px solid ${difficultyColor}`,
                color: difficultyColor,
                display: "flex",
              }}
            >
              {"⭐".repeat(h.stars)} {h.difficulty}
            </span>
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
              {formatSats(PROGRAM.prizePerHackathon)} sats
            </span>
            {dateRange && (
              <span style={{ color: "#a1a1aa", display: "flex" }}>
                {dateRange}
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
