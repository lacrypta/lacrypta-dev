/**
 * Catalog of every Nostr event "shape" the codebase reads or publishes.
 *
 * Used by /database to scan relays and detect coverage gaps. Keep in sync
 * when a new event kind / filter is introduced anywhere in lib/.
 */

import {
  PROJECT_KIND,
  PROJECT_TAG,
  PROJECT_D_PREFIX,
} from "./userProjects";

export type RelayFilter = {
  kinds: number[];
  authors?: string[];
  "#t"?: string[];
  "#d"?: string[];
  "#p"?: string[];
  limit?: number;
};

export type EventReplaceability =
  | "non-replaceable"
  | "replaceable"
  | "parameterized";

export type EventCategory = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  kind: number;
  source: string;
  replaceability: EventReplaceability;
  /** True if the filter requires La Crypta's pubkey (NEXT_PUBLIC_LACRYPTA_NPUB). */
  requiresLacryptaPubkey: boolean;
  /** Builds the relay filter. ctx.lacryptaPubkey is hex (may be empty). */
  buildFilter: (ctx: { lacryptaPubkey: string }) => RelayFilter | null;
};

export const CATEGORIES: EventCategory[] = [
  {
    id: "community-projects",
    label: "Proyectos de la comunidad",
    shortLabel: "Proyectos",
    description:
      "NIP-78 (kind:30078) con tag t=lacrypta-dev-project. Cualquier autor.",
    kind: PROJECT_KIND,
    source: "lib/userProjects.ts",
    replaceability: "parameterized",
    requiresLacryptaPubkey: false,
    buildFilter: () => ({
      kinds: [PROJECT_KIND],
      "#t": [PROJECT_TAG],
      limit: 500,
    }),
  },
  {
    id: "user-projects",
    label: "Proyectos del pubkey",
    shortLabel: "Mis proyectos",
    description:
      "Proyectos NIP-78 publicados por el pubkey foco (authors + #t).",
    kind: PROJECT_KIND,
    source: "lib/userProjects.ts",
    replaceability: "parameterized",
    requiresLacryptaPubkey: true,
    buildFilter: ({ lacryptaPubkey }) => {
      if (!lacryptaPubkey) return null;
      return {
        kinds: [PROJECT_KIND],
        authors: [lacryptaPubkey],
        "#t": [PROJECT_TAG],
        limit: 200,
      };
    },
  },
  {
    id: "hackathon-reports",
    label: "Reportes de hackatón",
    shortLabel: "Reportes",
    description:
      "kind:30078 firmado por La Crypta · tag t=lacrypta-dev-report.",
    kind: 30078,
    source: "lib/nostrReports.ts",
    replaceability: "parameterized",
    requiresLacryptaPubkey: true,
    buildFilter: ({ lacryptaPubkey }) => {
      if (!lacryptaPubkey) return null;
      return {
        kinds: [30078],
        authors: [lacryptaPubkey],
        "#t": ["lacrypta-dev-report"],
        limit: 500,
      };
    },
  },
  {
    id: "hackathon-results",
    label: "Resultados de hackatón",
    shortLabel: "Resultados",
    description:
      "kind:30078 firmado por La Crypta · tag t=lacrypta-dev-results.",
    kind: 30078,
    source: "lib/nostrReports.ts",
    replaceability: "parameterized",
    requiresLacryptaPubkey: true,
    buildFilter: ({ lacryptaPubkey }) => {
      if (!lacryptaPubkey) return null;
      return {
        kinds: [30078],
        authors: [lacryptaPubkey],
        "#t": ["lacrypta-dev-results"],
        limit: 100,
      };
    },
  },
  {
    id: "lacrypta-profile",
    label: "Perfil de La Crypta",
    shortLabel: "Perfil",
    description: "Metadata (kind:0) del npub oficial.",
    kind: 0,
    source: "lib/nostrProfile.ts",
    replaceability: "replaceable",
    requiresLacryptaPubkey: true,
    buildFilter: ({ lacryptaPubkey }) => {
      if (!lacryptaPubkey) return null;
      return { kinds: [0], authors: [lacryptaPubkey], limit: 1 };
    },
  },
  {
    id: "lacrypta-relays",
    label: "Lista de relays (NIP-65)",
    shortLabel: "NIP-65",
    description: "kind:10002 del npub oficial.",
    kind: 10002,
    source: "lib/nostrRelays.ts",
    replaceability: "replaceable",
    requiresLacryptaPubkey: true,
    buildFilter: ({ lacryptaPubkey }) => {
      if (!lacryptaPubkey) return null;
      return { kinds: [10002], authors: [lacryptaPubkey], limit: 1 };
    },
  },
  {
    id: "lacrypta-badge-definitions",
    label: "Badge definitions (NIP-58)",
    shortLabel: "Badges def",
    description: "kind:30009 emitidos por La Crypta.",
    kind: 30009,
    source: "lib/nostrBadges.ts",
    replaceability: "parameterized",
    requiresLacryptaPubkey: true,
    buildFilter: ({ lacryptaPubkey }) => {
      if (!lacryptaPubkey) return null;
      return { kinds: [30009], authors: [lacryptaPubkey], limit: 200 };
    },
  },
  {
    id: "lacrypta-badge-awards",
    label: "Badge awards emitidos",
    shortLabel: "Awards emitidos",
    description: "kind:8 emitidos por el pubkey foco a otros (authors).",
    kind: 8,
    source: "lib/nostrBadges.ts",
    replaceability: "non-replaceable",
    requiresLacryptaPubkey: true,
    buildFilter: ({ lacryptaPubkey }) => {
      if (!lacryptaPubkey) return null;
      return { kinds: [8], authors: [lacryptaPubkey], limit: 500 };
    },
  },
  {
    id: "badge-awards-received",
    label: "Badge awards recibidos",
    shortLabel: "Awards recibidos",
    description: "kind:8 con #p apuntando al pubkey foco (badges recibidos).",
    kind: 8,
    source: "lib/nostrBadges.ts",
    replaceability: "non-replaceable",
    requiresLacryptaPubkey: true,
    buildFilter: ({ lacryptaPubkey }) => {
      if (!lacryptaPubkey) return null;
      return { kinds: [8], "#p": [lacryptaPubkey], limit: 500 };
    },
  },
  {
    id: "lacrypta-profile-badges",
    label: "Profile badges (NIP-58)",
    shortLabel: "Profile badges",
    description: "kind:30008 del npub oficial.",
    kind: 30008,
    source: "lib/nostrBadges.ts",
    replaceability: "parameterized",
    requiresLacryptaPubkey: true,
    buildFilter: ({ lacryptaPubkey }) => {
      if (!lacryptaPubkey) return null;
      return { kinds: [30008], authors: [lacryptaPubkey], limit: 1 };
    },
  },
];

/**
 * Compute a stable identity key for an event so we can detect "same event
 * across multiple relays". For parameterized replaceable events the identity
 * is (kind, author, d-tag); for plain replaceable it's (kind, author); for
 * non-replaceable we fall back to the event id.
 */
export function eventIdentityKey(
  category: EventCategory,
  ev: { id: string; pubkey: string; kind: number; tags: string[][] },
): string {
  if (category.replaceability === "parameterized") {
    const d = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
    return `${ev.kind}:${ev.pubkey}:${d}`;
  }
  if (category.replaceability === "replaceable") {
    return `${ev.kind}:${ev.pubkey}`;
  }
  return ev.id;
}

/** Best-effort human label for an event, derived from tags / content. */
export function eventDisplayTitle(
  category: EventCategory,
  ev: { content: string; tags: string[][] },
): string {
  const d = ev.tags.find((t) => t[0] === "d")?.[1];
  if (category.id === "community-projects" && d?.startsWith(PROJECT_D_PREFIX)) {
    try {
      const parsed = JSON.parse(ev.content) as { name?: string };
      if (parsed.name) return parsed.name;
    } catch {
      /* fall through */
    }
    return d.slice(PROJECT_D_PREFIX.length);
  }
  if (category.id === "hackathon-reports" && d) {
    return d.replace("lacrypta.dev:hackathon:", "").replace(":report:", " · ");
  }
  if (category.id === "hackathon-results" && d) {
    return d.replace("lacrypta.dev:hackathon:", "").replace(":results", "");
  }
  if (category.id === "lacrypta-profile") {
    try {
      const parsed = JSON.parse(ev.content) as { name?: string; display_name?: string };
      return parsed.display_name || parsed.name || "Perfil";
    } catch {
      return "Perfil";
    }
  }
  if (category.id === "lacrypta-badge-definitions") {
    const name = ev.tags.find((t) => t[0] === "name")?.[1];
    if (name) return name;
  }
  if (category.id === "lacrypta-badge-awards") {
    const aTag = ev.tags.find((t) => t[0] === "a")?.[1] ?? "";
    return aTag.split(":").slice(2).join(":") || "Award";
  }
  return d || "(sin d-tag)";
}
