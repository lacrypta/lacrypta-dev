import type { SignedEvent, UnsignedEvent } from "./nostrSigner";

export const HACKATHON_BADGE_DEFINITION_KIND = 30009;
export const HACKATHON_BADGE_CATALOG_KIND = 30078;
export const HACKATHON_BADGE_SCHEMA = "lacrypta.dev/hackathon-badges";
export const HACKATHON_BADGE_SCHEMA_VERSION = 1;
export const HACKATHON_BADGE_CATALOG_TAG = "lacrypta-dev-hackathon-badges";
export const HACKATHON_BADGE_DEFINITION_TAG = "lacrypta-dev-hackathon-badge";

export type HackathonBadgeCategoryId =
  | "ranking"
  | "favorites"
  | "specials"
  | "streaks";

export type HackathonBadgeTone =
  | "gold"
  | "silver"
  | "bronze"
  | "bitcoin"
  | "nostr"
  | "cyan"
  | "success"
  | "pink";

export type HackathonBadgeCriterion =
  | { type: "rank"; position: number }
  | { type: "rank-range"; min: number; max: number }
  | { type: "manual"; juror?: string }
  | { type: "first-submit" }
  | { type: "streak"; count: number };

export type HackathonBadgeCategory = {
  id: HackathonBadgeCategoryId;
  label: string;
  description?: string;
};

export type HackathonBadgeTemplate = {
  id: string;
  category: HackathonBadgeCategoryId;
  name: string;
  description: string;
  tone: HackathonBadgeTone;
  icon: string;
  criteria: HackathonBadgeCriterion;
};

export type HackathonBadgeCatalogBadge = HackathonBadgeTemplate & {
  definition: string;
  image?: string;
  thumb?: string;
};

export type HackathonBadgeCatalog = {
  version: number;
  hackathon: string;
  title: string;
  categories: HackathonBadgeCategory[];
  badges: HackathonBadgeCatalogBadge[];
};

export type HackathonBadgeCatalogEvent = {
  event: SignedEvent;
  catalog: HackathonBadgeCatalog;
};

export const HACKATHON_BADGE_CATEGORIES: HackathonBadgeCategory[] = [
  {
    id: "ranking",
    label: "Ranking",
    description: "Badges por posicion final.",
  },
  {
    id: "favorites",
    label: "Favoritos",
    description: "Selecciones especiales del jurado.",
  },
  {
    id: "specials",
    label: "Especiales",
    description: "Menciones por calidad, entrega o presentacion.",
  },
  {
    id: "streaks",
    label: "Rachas",
    description: "Participacion sostenida en hackatones consecutivos.",
  },
];

export const DEFAULT_HACKATHON_BADGES: HackathonBadgeTemplate[] = [
  {
    id: "rank-1",
    category: "ranking",
    name: "1er Puesto",
    description: "Proyecto ganador de la hackaton.",
    tone: "gold",
    icon: "trophy",
    criteria: { type: "rank", position: 1 },
  },
  {
    id: "rank-2",
    category: "ranking",
    name: "2do Puesto",
    description: "Segundo mejor score del ranking final.",
    tone: "silver",
    icon: "medal",
    criteria: { type: "rank", position: 2 },
  },
  {
    id: "rank-3",
    category: "ranking",
    name: "3er Puesto",
    description: "Tercer lugar del podio principal.",
    tone: "bronze",
    icon: "medal",
    criteria: { type: "rank", position: 3 },
  },
  {
    id: "top-6",
    category: "ranking",
    name: "Podio (top 6)",
    description: "Top 6 del ranking final.",
    tone: "bitcoin",
    icon: "award",
    criteria: { type: "rank-range", min: 1, max: 6 },
  },
  {
    id: "favorite-gorilatron",
    category: "favorites",
    name: "Favorito de Gorilatron",
    description: "Seleccion especial de Gorilatron.",
    tone: "nostr",
    icon: "heart",
    criteria: { type: "manual", juror: "gorilatron" },
  },
  {
    id: "favorite-gorilator",
    category: "favorites",
    name: "Favorito de Gorilator",
    description: "Seleccion especial de Gorilator.",
    tone: "pink",
    icon: "star",
    criteria: { type: "manual", juror: "gorilator" },
  },
  {
    id: "favorite-claudio",
    category: "favorites",
    name: "Favorito de Claudio",
    description: "Seleccion especial de Claudio.",
    tone: "cyan",
    icon: "sparkles",
    criteria: { type: "manual", juror: "claudio" },
  },
  {
    id: "viability",
    category: "specials",
    name: "Premio a la viabilidad",
    description: "Reconoce el proyecto con mejor camino a produccion.",
    tone: "success",
    icon: "shield-check",
    criteria: { type: "manual" },
  },
  {
    id: "beautiful-ui",
    category: "specials",
    name: "Hermoso UI",
    description: "Interfaz cuidada, clara y memorable.",
    tone: "pink",
    icon: "brush",
    criteria: { type: "manual" },
  },
  {
    id: "great-pitch",
    category: "specials",
    name: "Tremendo Pitch",
    description: "Presentacion solida, entretenida y convincente.",
    tone: "bitcoin",
    icon: "mic",
    criteria: { type: "manual" },
  },
  {
    id: "first-submit",
    category: "specials",
    name: "Primer submit",
    description: "Primer proyecto enviado oficialmente.",
    tone: "cyan",
    icon: "send",
    criteria: { type: "first-submit" },
  },
  {
    id: "streak-2",
    category: "streaks",
    name: "2 hackatons al hilo",
    description: "Participacion sostenida durante dos ediciones seguidas.",
    tone: "success",
    icon: "flame",
    criteria: { type: "streak", count: 2 },
  },
  {
    id: "streak-3",
    category: "streaks",
    name: "3 hackatons al hilo",
    description: "Tres ediciones consecutivas construyendo.",
    tone: "bitcoin",
    icon: "flame",
    criteria: { type: "streak", count: 3 },
  },
  {
    id: "streak-4",
    category: "streaks",
    name: "4 hackatons al hilo",
    description: "Cuatro hackatones seguidos sin cortar la racha.",
    tone: "nostr",
    icon: "rocket",
    criteria: { type: "streak", count: 4 },
  },
  {
    id: "streak-5",
    category: "streaks",
    name: "5 hackatons al hilo",
    description: "Cinco ediciones consecutivas: constancia desbloqueada.",
    tone: "gold",
    icon: "gem",
    criteria: { type: "streak", count: 5 },
  },
];

export function hackathonBadgeCatalogDTag(hackathonId: string): string {
  return `lacrypta.dev:hackathon-badges:${hackathonId}`;
}

export function hackathonBadgeDefinitionDTag(
  hackathonId: string,
  badgeId: string,
): string {
  return `lacrypta.dev:badge:${hackathonId}:${badgeId}`;
}

export function hackathonBadgeDefinitionATag(
  issuerPubkey: string,
  hackathonId: string,
  badgeId: string,
): string {
  return `${HACKATHON_BADGE_DEFINITION_KIND}:${issuerPubkey}:${hackathonBadgeDefinitionDTag(hackathonId, badgeId)}`;
}

export function buildHackathonBadgeCatalogContent(
  issuerPubkey: string,
  hackathonId: string,
  hackathonName: string,
  badges: HackathonBadgeTemplate[] = DEFAULT_HACKATHON_BADGES,
): HackathonBadgeCatalog {
  return {
    version: HACKATHON_BADGE_SCHEMA_VERSION,
    hackathon: hackathonId,
    title: `Badges ${hackathonName}`,
    categories: HACKATHON_BADGE_CATEGORIES,
    badges: badges.map((badge) => ({
      ...badge,
      definition: hackathonBadgeDefinitionATag(
        issuerPubkey,
        hackathonId,
        badge.id,
      ),
      image: `https://lacrypta.dev/badges/${hackathonId}/${badge.id}.png`,
      thumb: `https://lacrypta.dev/badges/${hackathonId}/${badge.id}-thumb.png`,
    })),
  };
}

export function buildHackathonBadgeDefinitionEvents(
  issuerPubkey: string,
  hackathonId: string,
  badges: HackathonBadgeTemplate[] = DEFAULT_HACKATHON_BADGES,
  createdAt = Math.floor(Date.now() / 1000),
): UnsignedEvent[] {
  return badges.map((badge) => ({
    kind: HACKATHON_BADGE_DEFINITION_KIND,
    pubkey: issuerPubkey,
    created_at: createdAt,
    content: "",
    tags: [
      ["d", hackathonBadgeDefinitionDTag(hackathonId, badge.id)],
      ["name", badge.name],
      ["description", badge.description],
      ["image", `https://lacrypta.dev/badges/${hackathonId}/${badge.id}.png`],
      ["thumb", `https://lacrypta.dev/badges/${hackathonId}/${badge.id}-thumb.png`],
      ["t", HACKATHON_BADGE_DEFINITION_TAG],
      ["hackathon", hackathonId],
      ["badge", badge.id],
      ["category", badge.category],
    ],
  }));
}

export function buildHackathonBadgeCatalogEvent(
  issuerPubkey: string,
  hackathonId: string,
  hackathonName: string,
  badges: HackathonBadgeTemplate[] = DEFAULT_HACKATHON_BADGES,
  createdAt = Math.floor(Date.now() / 1000),
): UnsignedEvent {
  const catalog = buildHackathonBadgeCatalogContent(
    issuerPubkey,
    hackathonId,
    hackathonName,
    badges,
  );

  return {
    kind: HACKATHON_BADGE_CATALOG_KIND,
    pubkey: issuerPubkey,
    created_at: createdAt,
    content: JSON.stringify(catalog),
    tags: [
      ["d", hackathonBadgeCatalogDTag(hackathonId)],
      ["client", "lacrypta.dev"],
      ["hackathon", hackathonId],
      ["schema", HACKATHON_BADGE_SCHEMA, String(HACKATHON_BADGE_SCHEMA_VERSION)],
      ["title", catalog.title],
      ["t", HACKATHON_BADGE_CATALOG_TAG],
      ...catalog.badges.map((badge) => ["a", badge.definition]),
    ],
  };
}

export function parseHackathonBadgeCatalogEvent(
  event: SignedEvent,
): HackathonBadgeCatalogEvent | null {
  if (event.kind !== HACKATHON_BADGE_CATALOG_KIND) return null;
  try {
    const catalog = JSON.parse(event.content) as HackathonBadgeCatalog;
    if (catalog.version !== HACKATHON_BADGE_SCHEMA_VERSION) return null;
    if (!catalog.hackathon || !Array.isArray(catalog.categories)) return null;
    if (!Array.isArray(catalog.badges)) return null;
    const categories = new Set(catalog.categories.map((category) => category.id));
    const valid = catalog.badges.every(
      (badge) =>
        badge.id &&
        badge.name &&
        badge.definition &&
        categories.has(badge.category),
    );
    if (!valid) return null;
    return { event, catalog };
  } catch {
    return null;
  }
}
