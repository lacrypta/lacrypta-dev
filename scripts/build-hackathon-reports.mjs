#!/usr/bin/env node
// Parses the per-project markdown reports in data/hackathons/reports/{id}/*.md
// into a single structured reports.json used by the /hackathons routes.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const reportsDir = join(root, "data/hackathons/reports");
const outFile = join(root, "data/hackathons/reports.json");

function parseHeader(md) {
  const nameMatch = md.match(
    /^#\s+[\p{Extended_Pictographic}\s]*(.+?)\s*—\s*Reporte Final/mu,
  );
  const posMatch = md.match(/\*\*Posición:\*\*\s*(\d+)°/);
  const scoreMatch = md.match(/\*\*Score final:\s*([\d.]+)\*\*/);
  const teamMatch = md.match(/\*\*Equipo:\*\*\s*([^\n]+)/);
  const stackMatch = md.match(/\*\*Stack:\*\*\s*([^\n]+)/);
  return {
    title: nameMatch?.[1]?.trim(),
    position: posMatch ? Number(posMatch[1]) : null,
    finalScore: scoreMatch ? Number(scoreMatch[1]) : null,
    team: teamMatch
      ? teamMatch[1].split("·").map((s) => s.trim()).filter(Boolean)
      : [],
    stack: stackMatch
      ? stackMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

function parseOverallJudgesTable(md) {
  // Match the "Puntajes por Juez" table header block
  const block = md.match(
    /\|\s*Juez\s*\|\s*Modelo\s*\|\s*Puntaje\s*\|[\s\S]*?(?=\n---|\n###|\n##)/,
  );
  if (!block) return [];
  const rows = block[0]
    .split("\n")
    .filter((l) => l.trim().startsWith("|") && !/^\|\s*-+/.test(l));
  const out = [];
  for (const row of rows) {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 3) continue;
    if (/^juez$/i.test(cells[0])) continue;
    // Strip leading emojis + whitespace (handles surrogate pairs like 🤖, 🦍)
    const cleanName = cells[0]
      .replace(/^[\p{Extended_Pictographic}\s]+/u, "")
      .trim();
    out.push({
      name: cleanName,
      model: cells[1],
      score: Number(cells[2].replace(/\*/g, "")) || null,
    });
  }
  return out;
}

function parseJudgeSection(md) {
  // Each judge gets a `### <emoji> Name (Model) — score` heading with its own table
  const parts = md.split(/\n###\s+/).slice(1);
  const judges = [];
  for (const part of parts) {
    const firstLine = part.split("\n")[0] ?? "";
    const headerMatch = firstLine.match(
      /^[\p{Extended_Pictographic}\s]*([^\(]+?)\s*\(([^)]+)\)\s*—\s*([\d.]+)/u,
    );
    if (!headerMatch) continue;
    const name = headerMatch[1].trim();
    const model = headerMatch[2].trim();
    const score = Number(headerMatch[3]);

    // Extract category table rows
    const table = part.match(
      /\|\s*Categoría\s*\|\s*Puntaje\s*\|[\s\S]*?(?=\n\*\*Resumen|\n---|\n###|\n##|$)/,
    );
    const categories = [];
    if (table) {
      const rows = table[0]
        .split("\n")
        .filter((l) => l.trim().startsWith("|") && !/^\|\s*-+/.test(l));
      for (const row of rows) {
        const cells = row
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        if (cells.length < 2) continue;
        if (/^categoría$/i.test(cells[0])) continue;
        categories.push({
          name: cells[0],
          score: Number(cells[1]) || 0,
        });
      }
    }

    const summaryMatch = part.match(
      /\*\*Resumen:\*\*\s*([\s\S]*?)(?:\n---|\n###|\n##|$)/,
    );
    const summary = summaryMatch?.[1]?.trim();

    judges.push({ name, model, score, categories, summary });
  }
  return judges;
}

function parseConsolidatedFeedback(md) {
  const block = md.match(
    /##\s+💡?\s*Feedback Consolidado([\s\S]*?)(?:\n##|\n\*|$)/,
  );
  if (!block) return { strengths: [], improvements: [] };
  const section = (label) => {
    const re = new RegExp(`###\\s+${label}([\\s\\S]*?)(?:\\n###|\\n##|$)`, "i");
    const m = block[1].match(re);
    if (!m) return [];
    return m[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim())
      .filter(Boolean);
  };
  return {
    strengths: section("Fortalezas"),
    improvements: section("Áreas de Mejora"),
  };
}

function parseReport(md) {
  const header = parseHeader(md);
  const overallJudges = parseOverallJudgesTable(md);
  const judges = parseJudgeSection(md).map((j) => {
    // Merge the per-judge detail with overall table (model/score)
    const hint = overallJudges.find((o) =>
      o.name.toLowerCase().startsWith(j.name.toLowerCase().split(" ")[0]),
    );
    return {
      ...j,
      model: j.model || hint?.model,
      score: Number.isFinite(j.score) ? j.score : (hint?.score ?? null),
    };
  });
  const feedback = parseConsolidatedFeedback(md);
  return { ...header, judges, feedback };
}

const out = {};

for (const hackathonDir of readdirSync(reportsDir, { withFileTypes: true })) {
  if (!hackathonDir.isDirectory()) continue;
  const hackathonId = hackathonDir.name;
  const dir = join(reportsDir, hackathonId);
  const reports = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const slug = basename(f, ".md");
    const md = readFileSync(join(dir, f), "utf8");
    reports[slug] = parseReport(md);
  }
  if (Object.keys(reports).length > 0) {
    out[hackathonId] = reports;
  }
}

writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
const totalReports = Object.values(out).reduce(
  (a, r) => a + Object.keys(r).length,
  0,
);
console.log(
  `parsed ${totalReports} reports across ${Object.keys(out).length} hackathon(s) → ${outFile}`,
);
