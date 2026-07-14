/**
 * Contract for the official project-slug registry — a NIP-78 (kind 30078)
 * parameterized replaceable event published by La Crypta that pins one
 * permanent URL slug per project. Pure module (no Nostr I/O, no "use cache"),
 * shared by the server cache reader/publisher (`lib/projectRegistry.ts`) and
 * the database explorer catalog.
 *
 * Entries are append-only: a slug, once published, never changes target.
 * Canonical URL rule: `/projects/<registry slug>` when registered, else
 * `/projects/<project id>` — there are NO locally-computed "ephemeral" slugs,
 * so pre-registration URLs are stable and registration only upgrades them
 * (the old id URL keeps resolving via redirect forever).
 */

import { slugifyProjectName } from "./projectIdentity";

export const PROJECT_REGISTRY_KIND = 30078;
export const PROJECT_REGISTRY_D_TAG = "lacrypta.dev:projects:registry";
export const PROJECT_REGISTRY_T_TAG = "lacrypta-dev-projects-registry";
export const PROJECT_REGISTRY_SCHEMA_VERSION = 1;

/** Hard bounds so the single replaceable event can never outgrow relay
 *  size caps (~128 KB on nostr-rs-relay) and silently stop publishing. */
export const PROJECT_REGISTRY_MAX_ENTRIES = 1500;
export const PROJECT_REGISTRY_MAX_CONTENT_BYTES = 100_000;
export const PROJECT_REGISTRY_MAX_SLUG_CHARS = 80;
export const PROJECT_REGISTRY_MIN_SLUG_CHARS = 2;

/**
 * Slugs that would collide with a top-level route segment or a reserved word.
 * A user-chosen slug is rejected against this set; auto-minted slugs come from
 * project names and effectively never hit these, but the guard is cheap.
 */
export const RESERVED_SLUGS = new Set<string>([
  "dashboard",
  "api",
  "projects",
  "project",
  "hackathons",
  "hackathon",
  "hackathones",
  "soldados",
  "soldado",
  "badges",
  "badge",
  "skills",
  "infra",
  "dev",
  "sitemap",
  "robots",
  "login",
  "logout",
  "admin",
  "settings",
  "new",
  "edit",
  "proyecto",
  "proyectos",
]);

/** Kebab-case: lowercase alphanumeric segments joined by single hyphens. */
const SLUG_SHAPE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate + normalize a user-requested slug. Returns `{ slug }` on success or
 * `{ error }` (a Spanish, user-facing reason). Both the availability GET and the
 * claim POST go through this so their answers can never diverge.
 */
export function normalizeRequestedSlug(
  raw: string,
): { slug: string } | { error: string } {
  const slug = (raw ?? "").trim().toLowerCase();
  if (slug.length < PROJECT_REGISTRY_MIN_SLUG_CHARS) {
    return { error: "La URL debe tener al menos 2 caracteres." };
  }
  if (slug.length > PROJECT_REGISTRY_MAX_SLUG_CHARS) {
    return { error: `La URL no puede superar ${PROJECT_REGISTRY_MAX_SLUG_CHARS} caracteres.` };
  }
  if (!SLUG_SHAPE_RE.test(slug)) {
    return {
      error: "Solo minúsculas, números y guiones (sin empezar/terminar en guión).",
    };
  }
  if (isReservedSlugShape(slug)) {
    return { error: "Esa URL tiene una forma reservada." };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { error: "Esa URL está reservada." };
  }
  return { slug };
}

export type ProjectRegistryEntry = {
  /** Permanent URL slug (lowercase). Never reassigned to another project. */
  slug: string;
  /** The project's stable local id (curated slug id or Nostr uuid). */
  id: string;
  /** Author pubkey (hex) for Nostr-sourced projects. */
  author?: string;
  /** Hackathon id the project belonged to when registered, if any. */
  hackathon?: string | null;
  /** Project name at registration time (informational). */
  name: string;
  /** True when the entry mirrors an in-tree curated project. */
  curated?: boolean;
  /** Unix seconds at registration. */
  registeredAt: number;
};

export type ProjectRegistrySnapshot = {
  version: number;
  updatedAt: string;
  entries: ProjectRegistryEntry[];
};

export function serializeProjectRegistry(
  snapshot: ProjectRegistrySnapshot,
): string {
  return JSON.stringify(snapshot);
}

/** Defensive parse — returns null for anything that isn't a valid registry. */
export function parseProjectRegistry(
  content: string,
): ProjectRegistrySnapshot | null {
  try {
    const parsed = JSON.parse(content) as Partial<ProjectRegistrySnapshot>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) {
      return null;
    }
    const entries: ProjectRegistryEntry[] = [];
    for (const raw of parsed.entries) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const slug = typeof e.slug === "string" ? e.slug.trim().toLowerCase() : "";
      const id = typeof e.id === "string" ? e.id.trim() : "";
      const name = typeof e.name === "string" ? e.name : "";
      if (!slug || !id) continue;
      entries.push({
        slug,
        id,
        name,
        author: typeof e.author === "string" && e.author ? e.author : undefined,
        hackathon:
          typeof e.hackathon === "string" && e.hackathon ? e.hackathon : null,
        curated: e.curated === true ? true : undefined,
        registeredAt:
          typeof e.registeredAt === "number" ? e.registeredAt : 0,
      });
    }
    return {
      version:
        typeof parsed.version === "number"
          ? parsed.version
          : PROJECT_REGISTRY_SCHEMA_VERSION,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date(0).toISOString(),
      entries,
    };
  } catch {
    return null;
  }
}

const HEX64_RE = /^[0-9a-f]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Slug shapes that must never be minted: they would shadow the pubkey-listing
 * branch of `/projects/[slug]` or another project's permanent id URL.
 */
export function isReservedSlugShape(slug: string): boolean {
  const lc = slug.toLowerCase();
  return (
    HEX64_RE.test(lc) ||
    UUID_RE.test(lc) ||
    lc.startsWith("npub1") ||
    lc.startsWith("nprofile1")
  );
}

/**
 * Derive the base slug for a project. User-controlled names can slugify to
 * "" (emoji-only, CJK) or to reserved shapes — fall back to the id, then to
 * a generic stem the collision suffixer can build on.
 */
export function baseSlugForProject(input: {
  id: string;
  name: string;
  curated?: boolean;
}): string {
  const candidates = input.curated
    ? [input.id.toLowerCase(), slugifyProjectName(input.name)]
    : [slugifyProjectName(input.name), slugifyProjectName(input.id)];
  for (const candidate of candidates) {
    if (candidate.length >= 2 && !isReservedSlugShape(candidate)) {
      return candidate;
    }
  }
  return "proyecto";
}

/** Pick `base`, or `base-2`, `base-3`… — first form not present in `taken`. */
export function assignUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
