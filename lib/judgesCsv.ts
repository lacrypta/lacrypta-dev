/**
 * Parse + match helpers for the judges' scores CSV, shared by the admin upload
 * UI (client) and the API route (server). No dependencies — the repo has no CSV
 * library and the format is simple: `project,<judge1>,<judge2>,…`.
 */

export type JudgesCsvRow = { project: string; scores: number[] };
export type JudgesCsv = { judges: string[]; rows: JudgesCsvRow[] };

/** Split one CSV line, honouring double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse the judges CSV. Header must be `project,<judge1>,<judge2>,…`. Each data
 * row is a project name followed by one numeric score per judge. Throws on a
 * malformed header; non-numeric/blank scores become NaN (validate downstream).
 */
export function parseJudgesCsv(text: string): JudgesCsv {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("CSV vacío.");
  const header = splitCsvLine(lines[0] as string);
  if (header.length < 2 || (header[0] ?? "").toLowerCase() !== "project") {
    throw new Error('El encabezado debe empezar con la columna "project".');
  }
  const judges = header.slice(1).filter((j) => j.length > 0);
  if (judges.length === 0) throw new Error("El CSV no tiene columnas de jueces.");
  const rows: JudgesCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const project = cells[0] ?? "";
    if (!project) continue;
    const scores = judges.map((_, i) => {
      const raw = cells[i + 1];
      if (raw === undefined || raw === "") return NaN;
      return Number(raw);
    });
    rows.push({ project, scores });
  }
  return { judges, rows };
}

/** Normalise a name for project↔CSV matching (diacritics, case, whitespace). */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type JudgesMatch = {
  judges: string[];
  /** projectId → raw scores aligned to judges[]. */
  scores: Record<string, number[]>;
  matched: { project: string; projectId: string; name: string; scores: number[] }[];
  /** CSV project names that didn't match any votable project. */
  unmatched: string[];
  /** CSV rows with a non-numeric / missing score. */
  invalid: string[];
};

/**
 * Match parsed CSV rows to votable projects by normalised name (falling back to
 * id). Returns the per-id score map plus matched/unmatched/invalid breakdowns
 * for the admin preview and server validation.
 */
export function matchJudgesCsv(
  csv: JudgesCsv,
  projects: { id: string; name: string }[],
): JudgesMatch {
  const byName = new Map(projects.map((p) => [normalizeName(p.name), p]));
  const byId = new Map(projects.map((p) => [normalizeName(p.id), p]));
  const scores: Record<string, number[]> = {};
  const matched: JudgesMatch["matched"] = [];
  const unmatched: string[] = [];
  const invalid: string[] = [];
  for (const row of csv.rows) {
    const key = normalizeName(row.project);
    const project = byName.get(key) ?? byId.get(key);
    if (!project) {
      unmatched.push(row.project);
      continue;
    }
    if (row.scores.length !== csv.judges.length || row.scores.some((n) => !Number.isFinite(n))) {
      invalid.push(row.project);
      continue;
    }
    scores[project.id] = row.scores;
    matched.push({
      project: row.project,
      projectId: project.id,
      name: project.name,
      scores: row.scores,
    });
  }
  return { judges: csv.judges, scores, matched, unmatched, invalid };
}
