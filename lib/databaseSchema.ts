/**
 * Structural ("UML") model of every Nostr event shape and data entity the app
 * works with. Powers the /database → Estructura view: an interactive ERD that
 * cross-links to the relay scanner (Explorador) via `categoryId`.
 *
 * Keep in sync with lib/databaseCatalog.ts (CATEGORIES) and the real types in
 * lib/hackathons.ts, lib/userProjects.ts, lib/voting.ts, lib/nostrReports.ts,
 * lib/hackathonBadges.ts and lib/soldiers.ts.
 */

export type SchemaAccent =
  | "bitcoin"
  | "nostr"
  | "cyan"
  | "lightning"
  | "success"
  | "danger"
  | "foreground";

export type SchemaFieldKind = "scalar" | "ref" | "embed" | "key";

export type SchemaField = {
  name: string;
  type: string;
  kind?: SchemaFieldKind;
  /** Target entity id when this field references / embeds another entity. */
  ref?: string;
  note?: string;
};

export type SchemaRelationKind =
  | "belongsTo"
  | "hasMany"
  | "embeds"
  | "references";

export type SchemaRelation = {
  to: string; // target entity id
  kind: SchemaRelationKind;
  label: string;
  via?: string; // the field / tag that carries the link
};

export type SchemaTag = {
  tag: string;
  value: string;
  note?: string;
};

export type SchemaEntityGroup = "event" | "model" | "embedded";

export type SchemaEntity = {
  id: string;
  label: string;
  /** Nostr kind, or null for derived / conceptual models. */
  kind: number | null;
  group: SchemaEntityGroup;
  accent: SchemaAccent;
  source: string;
  summary: string;
  /** Links to a CATEGORIES.id in databaseCatalog so we can scan live events. */
  categoryId?: string;
  replaceability?: "non-replaceable" | "replaceable" | "parameterized";
  tTag?: string;
  dTag?: string;
  fields: SchemaField[];
  tags?: SchemaTag[];
  relations: SchemaRelation[];
};

export const SCHEMA_ENTITIES: SchemaEntity[] = [
  /* ───────────────────────── Curated models ──────────────────────────── */
  {
    id: "hackathon",
    label: "Hackatón",
    kind: null,
    group: "model",
    accent: "bitcoin",
    source: "lib/hackathons.ts",
    summary:
      "Hackatón curado (JSON en tree). Raíz que agrupa proyectos, votación y resultados.",
    fields: [
      { name: "id", type: "string", kind: "key" },
      { name: "slug", type: "string" },
      { name: "name", type: "string" },
      { name: "focus", type: "string" },
      { name: "description", type: "string" },
      { name: "dates", type: "{ start; end }" },
      { name: "sponsors", type: "Sponsor[]" },
      { name: "program", type: "ProgramItem[]" },
    ],
    relations: [
      { to: "project", kind: "hasMany", label: "tiene proyectos", via: "hackathon" },
      { to: "voting-period", kind: "hasMany", label: "abre votación", via: "h" },
      { to: "report", kind: "hasMany", label: "genera reportes", via: "h" },
      { to: "results", kind: "hasMany", label: "publica resultados", via: "h" },
      { to: "badge-catalog", kind: "hasMany", label: "define badges", via: "h" },
    ],
  },
  {
    id: "soldier",
    label: "Soldado",
    kind: null,
    group: "model",
    accent: "lightning",
    source: "lib/soldiers.ts",
    summary:
      "Constructor de la comunidad. Derivado de proyectos curados + Nostr. Vincula a un pubkey.",
    fields: [
      { name: "id / slug", type: "string", kind: "key" },
      { name: "name", type: "string" },
      { name: "github", type: "string?" },
      { name: "pubkey", type: "hex?", kind: "ref", ref: "profile" },
      { name: "nip05", type: "string?" },
      { name: "hasNostr", type: "boolean" },
      { name: "projects", type: "SoldierProjectRef[]", kind: "ref", ref: "project" },
      { name: "score", type: "SoldierScoreBreakdown" },
      { name: "ranking", type: "number?" },
    ],
    relations: [
      { to: "profile", kind: "references", label: "es un pubkey", via: "pubkey" },
      { to: "project", kind: "hasMany", label: "construyó proyectos", via: "projects" },
      { to: "ballot", kind: "hasMany", label: "vota", via: "pubkey" },
    ],
  },

  /* ───────────────────────── Nostr events ─────────────────────────────── */
  {
    id: "profile",
    label: "Perfil de usuario",
    kind: 0,
    group: "event",
    accent: "cyan",
    source: "lib/nostrProfile.ts",
    summary: "Metadata de usuario (NIP-01). Reemplazable por pubkey.",
    categoryId: "lacrypta-profile",
    replaceability: "replaceable",
    fields: [
      { name: "name", type: "string?" },
      { name: "display_name", type: "string?" },
      { name: "picture", type: "url?" },
      { name: "banner", type: "url?" },
      { name: "about", type: "string?" },
      { name: "nip05", type: "string?" },
      { name: "lud16", type: "string?" },
      { name: "website", type: "url?" },
      { name: "github", type: "string?" },
    ],
    relations: [
      { to: "project", kind: "hasMany", label: "publica proyectos", via: "pubkey" },
      { to: "ballot", kind: "hasMany", label: "emite votos", via: "pubkey" },
      { to: "soldier", kind: "references", label: "es un soldier" },
    ],
  },
  {
    id: "project",
    label: "Proyecto",
    kind: 30078,
    group: "event",
    accent: "nostr",
    source: "lib/userProjects.ts",
    summary:
      "Proyecto NIP-78 parametrizado. Curado (JSON) o de la comunidad (firmado por el autor).",
    categoryId: "community-projects",
    replaceability: "parameterized",
    tTag: "lacrypta-dev-project",
    dTag: "lacrypta.dev:project:<id>",
    fields: [
      { name: "id", type: "string", kind: "key" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "team", type: "TeamMember[]", kind: "embed", ref: "team-member" },
      { name: "logo / cover", type: "url?" },
      { name: "images / videos", type: "url[]?" },
      { name: "repo / demo", type: "url?" },
      { name: "tech", type: "string[]?" },
      { name: "status", type: "ProjectStatus" },
      { name: "hackathon", type: "string?", kind: "ref", ref: "hackathon" },
      { name: "createdAt / updatedAt", type: "unix" },
    ],
    tags: [
      { tag: "d", value: "lacrypta.dev:project:<id>", note: "identidad reemplazable" },
      { tag: "t", value: "lacrypta-dev-project", note: "marcador indexable" },
      { tag: "h", value: "<hackathonId>", note: "asociación a hackatón" },
      { tag: "client", value: "La Crypta Dev" },
    ],
    relations: [
      { to: "hackathon", kind: "belongsTo", label: "pertenece a hackatón", via: "h" },
      { to: "profile", kind: "belongsTo", label: "firmado por autor", via: "pubkey" },
      { to: "team-member", kind: "embeds", label: "tiene equipo", via: "team" },
      { to: "report", kind: "hasMany", label: "recibe reporte", via: "i" },
      { to: "ballot", kind: "references", label: "recibe votos", via: "allocations" },
    ],
  },
  {
    id: "team-member",
    label: "Integrante",
    kind: null,
    group: "embedded",
    accent: "cyan",
    source: "lib/hackathons.ts",
    summary: "Integrante embebido en un Project. Puede mapear a un pubkey real.",
    fields: [
      { name: "name", type: "string" },
      { name: "role", type: "string" },
      { name: "pubkey", type: "hex?", kind: "ref", ref: "profile" },
      { name: "nip05", type: "string?" },
      { name: "github", type: "string?" },
      { name: "picture", type: "url?" },
    ],
    relations: [
      { to: "profile", kind: "references", label: "es un usuario", via: "pubkey" },
      { to: "project", kind: "belongsTo", label: "embebido en proyecto" },
    ],
  },
  {
    id: "voting-period",
    label: "Período de votación",
    kind: 30078,
    group: "event",
    accent: "lightning",
    source: "lib/voting.ts",
    summary:
      "Período de votación firmado por La Crypta. Congela elegibilidad y, al cerrar, resultados.",
    replaceability: "parameterized",
    tTag: "lacrypta-dev-voting",
    dTag: "lacrypta.dev:voting:<hackathonId>",
    fields: [
      { name: "version", type: "number" },
      { name: "hackathonId", type: "string", kind: "ref", ref: "hackathon" },
      { name: "status", type: "'open' | 'closed'" },
      { name: "openedAt / closedAt", type: "unix?" },
      { name: "projects", type: "VotingProjectRef[]", kind: "ref", ref: "project" },
      { name: "eligible", type: "VotingEligibleVoter[]", kind: "ref", ref: "profile" },
      { name: "results", type: "VotingResults | null", kind: "embed", ref: "results" },
    ],
    tags: [
      { tag: "d", value: "lacrypta.dev:voting:<hackathonId>" },
      { tag: "t", value: "lacrypta-dev-voting" },
      { tag: "h", value: "<hackathonId>" },
      { tag: "status", value: "open | closed" },
      { tag: "client", value: "La Crypta Dev" },
    ],
    relations: [
      { to: "hackathon", kind: "belongsTo", label: "de un hackatón", via: "h" },
      { to: "ballot", kind: "hasMany", label: "recolecta boletas", via: "hackathonId" },
      { to: "profile", kind: "references", label: "snapshot de elegibles", via: "eligible" },
      { to: "project", kind: "references", label: "lista proyectos votables", via: "projects" },
    ],
  },
  {
    id: "ballot",
    label: "Boleta (voto)",
    kind: 30078,
    group: "event",
    accent: "success",
    source: "lib/votingClient.ts",
    summary:
      "Boleta de un votante (NIP-78 reemplazable por hackatón). Contenido cifrado NIP-44.",
    replaceability: "parameterized",
    tTag: "lacrypta-dev-vote",
    dTag: "lacrypta.dev:vote:<hackathonId>",
    fields: [
      { name: "version", type: "number" },
      { name: "hackathonId", type: "string", kind: "ref", ref: "hackathon" },
      { name: "allocations", type: "Record<projectId, number>", kind: "ref", ref: "project" },
      { name: "·", type: "(cifrado NIP-44 en content)" },
    ],
    tags: [
      { tag: "d", value: "lacrypta.dev:vote:<hackathonId>", note: "1 boleta por votante" },
      { tag: "t", value: "lacrypta-dev-vote" },
      { tag: "h", value: "<hackathonId>" },
      { tag: "enc", value: "nip44" },
      { tag: "votes", value: "<total>", note: "conteo plano (no confiable)" },
    ],
    relations: [
      { to: "voting-period", kind: "belongsTo", label: "dentro del período", via: "h" },
      { to: "profile", kind: "belongsTo", label: "firmada por votante", via: "pubkey" },
      { to: "project", kind: "references", label: "asigna votos", via: "allocations" },
    ],
  },
  {
    id: "report",
    label: "Reporte de proyecto",
    kind: 30078,
    group: "event",
    accent: "bitcoin",
    source: "lib/nostrReports.ts",
    summary:
      "Reporte de jurado por proyecto, firmado por La Crypta. Indexa el evento Project.",
    categoryId: "hackathon-reports",
    replaceability: "parameterized",
    tTag: "lacrypta-dev-report",
    dTag: "lacrypta.dev:hackathon:<h>:report:<projectId>",
    fields: [
      { name: "title", type: "string?" },
      { name: "position", type: "number | null" },
      { name: "finalScore", type: "number | null" },
      { name: "team", type: "string[]" },
      { name: "stack", type: "string[]" },
      { name: "judges", type: "JudgeReport[]" },
      { name: "feedback", type: "{ strengths; improvements }" },
    ],
    tags: [
      { tag: "d", value: "lacrypta.dev:hackathon:<h>:report:<projectId>" },
      { tag: "h", value: "<hackathonId>" },
      { tag: "p", value: "<projectPubkey>" },
      { tag: "i", value: "30078:<pk>:lacrypta.dev:project:<id>", note: "ref al Project" },
      { tag: "t", value: "lacrypta-dev-report" },
    ],
    relations: [
      { to: "project", kind: "belongsTo", label: "evalúa proyecto", via: "i" },
      { to: "hackathon", kind: "belongsTo", label: "de un hackatón", via: "h" },
    ],
  },
  {
    id: "results",
    label: "Resultados del hackatón",
    kind: 30078,
    group: "event",
    accent: "lightning",
    source: "lib/nostrReports.ts",
    summary: "Resultados finales del hackatón firmados por La Crypta (podio + ganadores).",
    categoryId: "hackathon-results",
    replaceability: "parameterized",
    tTag: "lacrypta-dev-results",
    dTag: "lacrypta.dev:hackathon:<h>:results",
    fields: [
      { name: "hackathonId", type: "string", kind: "ref", ref: "hackathon" },
      { name: "podium", type: "ResultEntry[]", kind: "ref", ref: "project" },
      { name: "winners", type: "Winner[]", kind: "ref", ref: "profile" },
    ],
    tags: [
      { tag: "d", value: "lacrypta.dev:hackathon:<h>:results" },
      { tag: "h", value: "<hackathonId>" },
      { tag: "t", value: "lacrypta-dev-results" },
    ],
    relations: [
      { to: "hackathon", kind: "belongsTo", label: "de un hackatón", via: "h" },
      { to: "project", kind: "references", label: "rankea proyectos", via: "podium" },
    ],
  },
  {
    id: "badge-catalog",
    label: "Catálogo de badges",
    kind: 30078,
    group: "event",
    accent: "nostr",
    source: "lib/hackathonBadges.ts",
    summary: "Catálogo de badges de un hackatón (categorías + criterios). Firmado por La Crypta.",
    categoryId: "hackathon-badge-catalogs",
    replaceability: "parameterized",
    tTag: "lacrypta-dev-hackathon-badges",
    fields: [
      { name: "version", type: "number" },
      { name: "hackathon", type: "string", kind: "ref", ref: "hackathon" },
      { name: "title", type: "string" },
      { name: "categories", type: "HackathonBadgeCategory[]" },
      { name: "badges", type: "BadgeTemplate[]", kind: "ref", ref: "badge-definition" },
    ],
    tags: [
      { tag: "d", value: "lacrypta.dev:hackathon-badges:<h>" },
      { tag: "client", value: "La Crypta Dev" },
      { tag: "hackathon", value: "<hackathonId>" },
      { tag: "title", value: "<título>" },
      { tag: "t", value: "lacrypta-dev-hackathon-badges" },
      { tag: "a", value: "30009:<pk>:<d>", note: "una por badge del catálogo" },
    ],
    relations: [
      { to: "hackathon", kind: "belongsTo", label: "de un hackatón", via: "h" },
      { to: "badge-definition", kind: "references", label: "instancia definiciones" },
    ],
  },
  {
    id: "badge-definition",
    label: "Definición de badge",
    kind: 30009,
    group: "event",
    accent: "cyan",
    source: "lib/nostrBadges.ts",
    summary: "Definición de badge NIP-58 (plantilla reusable).",
    categoryId: "lacrypta-badge-definitions",
    replaceability: "parameterized",
    fields: [
      { name: "d", type: "string", kind: "key" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "image / thumb", type: "url" },
    ],
    relations: [
      { to: "badge-award", kind: "hasMany", label: "se otorga vía", via: "a" },
    ],
  },
  {
    id: "badge-award",
    label: "Otorgamiento de badge",
    kind: 8,
    group: "event",
    accent: "success",
    source: "lib/nostrBadges.ts",
    summary: "Otorgamiento NIP-58 (kind:8). No reemplazable. Apunta a definición + receptores.",
    categoryId: "lacrypta-badge-awards",
    replaceability: "non-replaceable",
    fields: [
      { name: "a", type: "30009:<pk>:<d>", kind: "ref", ref: "badge-definition" },
      { name: "p[]", type: "hex[]", kind: "ref", ref: "profile" },
    ],
    tags: [
      { tag: "a", value: "30009:<pk>:<d>", note: "ref a la definición" },
      { tag: "p", value: "<recipientPubkey>", note: "receptor(es)" },
    ],
    relations: [
      { to: "badge-definition", kind: "belongsTo", label: "de una definición", via: "a" },
      { to: "profile", kind: "references", label: "otorgado a usuarios", via: "p" },
    ],
  },
  {
    id: "relay-list",
    label: "Lista de relays",
    kind: 10002,
    group: "event",
    accent: "foreground",
    source: "lib/nostrRelays.ts",
    summary: "Lista de relays NIP-65 del npub oficial. Reemplazable.",
    categoryId: "lacrypta-relays",
    replaceability: "replaceable",
    fields: [{ name: "r[]", type: "url (read/write)" }],
    relations: [
      { to: "profile", kind: "belongsTo", label: "del npub oficial", via: "pubkey" },
    ],
  },
];

export function getEntity(id: string): SchemaEntity | undefined {
  return SCHEMA_ENTITIES.find((e) => e.id === id);
}

/** Distinct entity ids related to `id` (both outgoing and incoming edges). */
export function relatedEntityIds(id: string): Set<string> {
  const ids = new Set<string>();
  const self = getEntity(id);
  self?.relations.forEach((r) => ids.add(r.to));
  for (const e of SCHEMA_ENTITIES) {
    if (e.id === id) continue;
    if (e.relations.some((r) => r.to === id)) ids.add(e.id);
  }
  return ids;
}
