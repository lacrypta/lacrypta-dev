import hackathonsJson from "@/data/hackathons/hackathons.json";
import foundationsProjectsJson from "@/data/hackathons/projects-foundations.json";
import identityProjectsJson from "@/data/hackathons/projects-identity.json";
import reportsJson from "@/data/hackathons/reports.json";

export type HackathonDifficulty =
  | "Beginner"
  | "Intermediate"
  | "Advanced"
  | "Expert";

export type HackathonEventType =
  | "apertura"
  | "pitch"
  | "pitch-final"
  | "cierre"
  | "premios";

export type HackathonEvent = {
  date: string; // ISO YYYY-MM-DD
  day: number;
  type: HackathonEventType;
  title: string;
  description: string;
  youtube?: string;
};

export type Hackathon = {
  id: string;
  number: number;
  name: string;
  focus: string;
  description: string;
  difficulty: HackathonDifficulty;
  stars: number;
  month: string;
  monthShort: string;
  year: number;
  icon: string;
  tags: string[];
  topics: string[];
  dates: HackathonEvent[];
};

export type PrizeSlot = {
  position: number;
  sats: number;
};

export type Judge = {
  name: string;
  emoji?: string;
  model?: string;
};

export type HackathonProgram = {
  name: string;
  organization: string;
  youtube?: string;
  totalPrize: number;
  prizePerHackathon: number;
  prizeDistribution: PrizeSlot[];
  maxTeamSize?: number;
  judges?: Judge[];
  rules?: string[];
};

export type TeamMember = {
  name: string;
  role: string;
  /** NIP-05 identifier (e.g. `kassis@lacrypta.ar`). Optional for legacy
   *  curated entries; new Nostr submissions add members by NIP-05. */
  nip05?: string;
  /** Hex pubkey resolved from the NIP-05 (or the event signer for the owner). */
  pubkey?: string;
  /** Avatar URL snapshotted from the kind:0 metadata at submission time. */
  picture?: string;
  github?: string;
};

export type ProjectStatus =
  | "idea"
  | "building"
  | "submitted"
  | "finalist"
  | "winner"
  | "official";

export type HackathonProject = {
  id: string;
  name: string;
  description: string;
  team: TeamMember[];
  repo?: string;
  demo?: string;
  tech?: string[];
  status: ProjectStatus;
  submittedAt?: string;
  pitched?: string;
  pitched_final?: string;
  /** Hackathon id (e.g. `"identity"`) or `null` when the project is not
   *  assigned to any hackathon. Curated JSON projects always have an id. */
  hackathon: string | null;
  /** Attached from reports.json when available */
  report?: ProjectReport;
};

export type JudgeCategory = {
  name: string;
  score: number;
};

export type JudgeReport = {
  name: string;
  model?: string;
  score: number | null;
  categories: JudgeCategory[];
  summary?: string;
};

export type ProjectReport = {
  title?: string;
  position: number | null;
  finalScore: number | null;
  team: string[];
  stack: string[];
  judges: JudgeReport[];
  feedback: {
    strengths: string[];
    improvements: string[];
  };
};

/* ──────────────────────────── exposed data ─────────────────────────────── */

type HackathonsFile = {
  program: HackathonProgram;
  hackathons: Hackathon[];
};

const file = hackathonsJson as unknown as HackathonsFile;

export const PROGRAM: HackathonProgram = file.program;
export const HACKATHONS: Hackathon[] = file.hackathons;

type RawProjectsFile = { projects: unknown[] };

const reports = reportsJson as unknown as Record<
  string,
  Record<string, ProjectReport>
>;

function withReport(
  project: HackathonProject,
  hackathonId: string,
): HackathonProject {
  const report = reports[hackathonId]?.[project.id];
  return { ...project, hackathon: hackathonId, report };
}

const PROJECTS_BY_HACKATHON: Record<string, HackathonProject[]> = {
  foundations: (foundationsProjectsJson as unknown as RawProjectsFile).projects.map(
    (p) => withReport(p as HackathonProject, "foundations"),
  ),
  identity: (identityProjectsJson as unknown as RawProjectsFile).projects.map(
    (p) => withReport(p as HackathonProject, "identity"),
  ),
};

export function getHackathon(id: string): Hackathon | null {
  return HACKATHONS.find((h) => h.id === id) ?? null;
}

export function getHackathonProjects(id: string): HackathonProject[] {
  return PROJECTS_BY_HACKATHON[id] ?? [];
}

export function getProject(
  hackathonId: string,
  projectId: string,
): HackathonProject | null {
  return (
    PROJECTS_BY_HACKATHON[hackathonId]?.find((p) => p.id === projectId) ?? null
  );
}

export function allProjects(): HackathonProject[] {
  return Object.values(PROJECTS_BY_HACKATHON).flat();
}

export type HackathonSubmission = HackathonProject & {
  /** When this submission comes from a Nostr event, its author pubkey. */
  nostrAuthor?: string;
  /** Event id of the NIP-78 event backing this submission. */
  nostrEventId?: string;
  /** created_at of the event in unix seconds. */
  nostrCreatedAt?: number;
};

/**
 * Merges curated (JSON) projects with community-submitted (Nostr) projects
 * for a given hackathon. Curated wins on id collisions. Curated with reports
 * come first (ordered by rank), then Nostr submissions sorted by
 * nostrCreatedAt desc (freshest first).
 */
export function mergeWithSubmissions(
  hackathonId: string,
  nostrSubmissions: HackathonSubmission[],
): HackathonSubmission[] {
  const curated = rankedProjects(hackathonId);
  const curatedIds = new Set(curated.map((p) => p.id));
  const uniqueNostr = nostrSubmissions
    .filter((s) => s.hackathon === hackathonId)
    .filter((s) => !curatedIds.has(s.id));

  uniqueNostr.sort((a, b) => (b.nostrCreatedAt ?? 0) - (a.nostrCreatedAt ?? 0));
  return [...curated, ...uniqueNostr];
}

/** Returns projects ordered by jury position asc (winners first). */
export function rankedProjects(hackathonId: string): HackathonProject[] {
  const projects = getHackathonProjects(hackathonId);
  return [...projects].sort((a, b) => {
    const pa = a.report?.position ?? Infinity;
    const pb = b.report?.position ?? Infinity;
    if (pa !== pb) return pa - pb;
    const sa = a.report?.finalScore ?? -Infinity;
    const sb = b.report?.finalScore ?? -Infinity;
    return sb - sa;
  });
}

export function hackathonStatus(
  h: Hackathon,
  now: Date = new Date(),
): "upcoming" | "active" | "closed" {
  const dates = [...h.dates].sort((a, b) => a.date.localeCompare(b.date));
  if (dates.length === 0) return "upcoming";
  const first = dates[0].date;
  const last = dates[dates.length - 1].date;
  const today = now.toISOString().slice(0, 10);
  if (today < first) return "upcoming";
  if (today > last) return "closed";
  return "active";
}

export function formatSats(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return n.toString();
}

/** Interpolates {maxTeamSize} and {judges} tokens in rule strings. */
export function programRules(): string[] {
  const rules = PROGRAM.rules ?? [];
  const judgesText = (PROGRAM.judges ?? []).map((j) => j.name).join(", ");
  return rules.map((r) =>
    r
      .replace("{maxTeamSize}", String(PROGRAM.maxTeamSize ?? ""))
      .replace("{judges}", judgesText),
  );
}

export function prizeForPosition(position: number | null): number | null {
  if (position == null) return null;
  const slot = PROGRAM.prizeDistribution.find(
    (p) => p.position === position,
  );
  return slot?.sats ?? null;
}

export type PrizedProject = {
  project: HackathonProject;
  position: number;
  /** sats actually awarded (ties share the combined slots evenly) */
  prize: number;
  /** true if two or more projects share this position */
  tied: boolean;
  /** number of projects tied at this position */
  tiedWith: number;
};

/**
 * Walks the ranking and distributes the program's prize slots in order.
 * Ties share the combined value of the consecutive slots they occupy
 * (e.g. a tie at 1st consumes slots 1 and 2 and splits 400k+250k = 325k each).
 */
export function prizedProjects(hackathonId: string): PrizedProject[] {
  const ranked = rankedProjects(hackathonId).filter(
    (p) => p.report?.position != null,
  );
  if (ranked.length === 0) return [];

  const byPosition = new Map<number, HackathonProject[]>();
  for (const p of ranked) {
    const pos = p.report!.position as number;
    if (!byPosition.has(pos)) byPosition.set(pos, []);
    byPosition.get(pos)!.push(p);
  }

  const positions = [...byPosition.keys()].sort((a, b) => a - b);
  const slots = PROGRAM.prizeDistribution;
  const result: PrizedProject[] = [];
  let slotIdx = 0;

  for (const pos of positions) {
    const group = byPosition.get(pos)!;
    if (slotIdx >= slots.length) break;
    const applicable = slots.slice(slotIdx, slotIdx + group.length);
    if (applicable.length === 0) break;
    const total = applicable.reduce((a, s) => a + s.sats, 0);
    const share = Math.floor(total / group.length);
    for (const project of group) {
      result.push({
        project,
        position: pos,
        prize: share,
        tied: group.length > 1,
        tiedWith: group.length,
      });
    }
    slotIdx += group.length;
  }
  return result;
}

/** Returns the sats awarded to a specific project, accounting for ties. */
export function prizeForProject(
  hackathonId: string,
  projectId: string,
): PrizedProject | null {
  return (
    prizedProjects(hackathonId).find((p) => p.project.id === projectId) ?? null
  );
}
