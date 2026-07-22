import hackathonsJson from "@/data/hackathons/hackathons.json";
import foundationsProjectsJson from "@/data/hackathons/projects-foundations.json";
import identityProjectsJson from "@/data/hackathons/projects-identity.json";
import commerceProjectsJson from "@/data/hackathons/projects-commerce.json";
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

export type Sponsor = {
  name: string;
  /** Path under /public (e.g. `/sponsors/wapupay.png`) or absolute URL. */
  logo: string;
  url?: string;
  /** Optional tagline rendered next to the logo. */
  tagline?: string;
  /** Integration / API docs the hackers will want to read. */
  docs?: string;
};

export type Hackathon = {
  /** Internal, stable id — used as the key for submissions, voting and badges.
   *  NEVER rename: published Nostr events reference it. */
  id: string;
  /** Optional URL slug. When set, the public route is `/hackathons/<slug>` but
   *  all data keeps using `id`. Defaults to `id` when absent. */
  slug?: string;
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
  sponsors?: Sponsor[];
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
  | "official"
  | "archived";

export type HackathonProject = {
  id: string;
  /** Canonical URL slug from the project registry, attached server-side.
   *  Optional everywhere; `projectHref()` falls back to `id`. */
  slug?: string;
  name: string;
  description: string;
  team: TeamMember[];
  /** Project logo/avatar URL. Nostr submissions can upload this via Blossom. */
  logo?: string;
  /** Project cover/banner URL. Nostr submissions can upload this via Blossom. */
  cover?: string;
  /** Gallery images uploaded by the project owner. */
  images?: string[];
  /** Thumbnail images uploaded by the project owner. */
  thumbs?: string[];
  /** Video URLs uploaded by the project owner. */
  videos?: string[];
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

export function primaryProjectPubkey(project: HackathonProject): string | null {
  return project.team.find((m) => m.pubkey)?.pubkey ?? null;
}

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
  commerce: (commerceProjectsJson as unknown as RawProjectsFile).projects.map(
    (p) => withReport(p as HackathonProject, "commerce"),
  ),
};

/** Resolve a hackathon by its internal id OR its URL slug (both routes work). */
export function getHackathon(idOrSlug: string): Hackathon | null {
  return (
    HACKATHONS.find((h) => h.id === idOrSlug || h.slug === idOrSlug) ?? null
  );
}

/** Public URL segment for a hackathon — the slug when set, else the id. */
export function hackathonSlug(h: Hackathon): string {
  return h.slug ?? h.id;
}

/** Public URL segment for a hackathon id (used when only the id is in hand). */
export function hackathonSlugForId(id: string): string {
  return getHackathon(id)?.slug ?? id;
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

/** Event provenance carried by any project parsed out of a Nostr event.
 *  Both producers use these names — `lib/nostrCache.ts` (server, cached relay
 *  snapshot) and `lib/userProjects.ts` (client scan). */
export type NostrProjectProvenance = {
  author: string;
  eventId: string;
  eventCreatedAt: number;
};

/**
 * Re-labels a Nostr-sourced project's event provenance onto the
 * `HackathonSubmission` fields `mergeWithSubmissions()` reads (it sorts
 * community entries by `nostrCreatedAt`). Generic so extra fields the caller
 * attached — e.g. the registry `slug` from `attachProjectSlugs` — survive.
 */
export function toHackathonSubmission<
  T extends HackathonProject & NostrProjectProvenance,
>(project: T): T & HackathonSubmission {
  return {
    ...project,
    nostrAuthor: project.author,
    nostrEventId: project.eventId,
    nostrCreatedAt: project.eventCreatedAt,
  };
}

export function comparableProjectName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function comparableRepo(repo?: string): string | null {
  if (!repo) return null;
  try {
    const url = new URL(repo);
    if (url.hostname.toLowerCase() !== "github.com") return repo.trim().toLowerCase();
    const [owner, name] = url.pathname
      .replace(/\.git$/i, "")
      .split("/")
      .filter(Boolean);
    return owner && name ? `${owner.toLowerCase()}/${name.toLowerCase()}` : null;
  } catch {
    return repo
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "");
  }
}

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
  const curatedRepos = new Set(
    curated.map((p) => comparableRepo(p.repo)).filter((repo): repo is string => !!repo),
  );
  const curatedNames = new Set(curated.map((p) => comparableProjectName(p.name)));
  const uniqueNostr = nostrSubmissions
    .filter((s) => s.hackathon === hackathonId)
    .filter((s) => {
      if (curatedIds.has(s.id)) return false;
      const repo = comparableRepo(s.repo);
      if (repo && curatedRepos.has(repo)) return false;
      return !curatedNames.has(comparableProjectName(s.name));
    });

  uniqueNostr.sort((a, b) => (b.nostrCreatedAt ?? 0) - (a.nostrCreatedAt ?? 0));

  // Dedup community submissions against EACH OTHER (freshest wins). Two events
  // can share a project id/repo/name across different authors — e.g. the same
  // project republished, or dev dummy data regenerated under fresh keys — which
  // would otherwise collide on React keys and render twice.
  const seenIds = new Set<string>();
  const seenRepos = new Set<string>();
  const seenNames = new Set<string>();
  const dedupedNostr = uniqueNostr.filter((s) => {
    const repo = comparableRepo(s.repo);
    const name = comparableProjectName(s.name);
    if (seenIds.has(s.id) || (repo && seenRepos.has(repo)) || seenNames.has(name)) {
      return false;
    }
    seenIds.add(s.id);
    if (repo) seenRepos.add(repo);
    seenNames.add(name);
    return true;
  });

  return [...curated, ...dedupedNostr];
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

function firstDateOfType(h: Hackathon, type: HackathonEventType): string | null {
  const dates = h.dates
    .filter((event) => event.type === type)
    .map((event) => event.date)
    .sort();
  return dates[0] ?? null;
}

export function hackathonInscriptionDeadline(h: Hackathon): string | null {
  return (
    firstDateOfType(h, "cierre") ??
    firstDateOfType(h, "pitch-final") ??
    firstDateOfType(h, "pitch") ??
    firstDateOfType(h, "premios") ??
    null
  );
}

export function isHackathonInscriptionOpen(
  h: Hackathon,
  now: Date = new Date(),
): boolean {
  const dates = [...h.dates].sort((a, b) => a.date.localeCompare(b.date));
  if (dates.length === 0) return false;

  const first = firstDateOfType(h, "apertura") ?? dates[0].date;
  const deadline = hackathonInscriptionDeadline(h);
  if (!deadline) return false;

  const today = now.toISOString().slice(0, 10);
  return today >= first && today <= deadline;
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
 *
 * When fewer projects participate than there are prize slots, the smallest
 * prizes go out first: with only 3 ranked projects out of 6 slots, 1st takes
 * slot 4, 2nd takes slot 5, 3rd takes slot 6 (100k/60k/40k) rather than
 * claiming the top slots and leaving the rest of the pool unawarded.
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
  let slotIdx = Math.max(0, slots.length - ranked.length);

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
