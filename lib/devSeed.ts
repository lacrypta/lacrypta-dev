"use client";

/**
 * Dev-only fake-data generator. Creates dummy Nostr users (keypairs we hold)
 * and dummy projects assigned to hackathons, then publishes real kind-0
 * profiles + kind-30078 project events — signed by each user's own key — to the
 * configured relays (the local relay in dev). Because they go through the same
 * event shapes the app reads, the dummy users automatically become soldiers
 * (impersonatable + voting-eligible) and their projects show on hackathon
 * pages, /projects, the dashboard, and "Mis hackatones".
 *
 * The generated nsecs are persisted to localStorage so you have the keys to
 * sign as each user. Local-relay only — nothing reaches production.
 */
import type { UserSigner } from "@/lib/nostrSigner";
import type { UserProject, TeamMember } from "@/lib/userProjects";
import { publishUserProject } from "@/lib/userProjects";
import { publishNostrProfile } from "@/lib/nostrProfile";
import { DEFAULT_RELAYS } from "@/lib/nostrRelayConfig";

export const DUMMY_USERS_KEY = "labs:dev:dummy-users:v1";

export type DummyUser = {
  name: string;
  pubkey: string;
  npub: string;
  nsec: string;
  /** 32-byte secret as a plain array (same encoding as Auth.localSecret). */
  secret: number[];
};

type UserSpec = { name: string; about: string };
type ProjectSpec = {
  id: string;
  name: string;
  description: string;
  repo: string;
  hackathon: string;
  /** index into USERS — the author/owner */
  author: number;
  /** extra teammates (indexes into USERS) */
  team?: number[];
  status?: UserProject["status"];
};

// 8 dummy builders. Avatars come from a deterministic public avatar service.
const USERS: UserSpec[] = [
  { name: "Satoshi Tester", about: "Probando todo lo que se mueva ⚡" },
  { name: "Lightning Lucía", about: "Pagos instantáneos o nada." },
  { name: "Nostrich Nico", about: "Relays, zaps y café." },
  { name: "Zap Zoe", about: "Gamedev sobre Bitcoin." },
  { name: "Block Bruno", about: "Infra y nodos toda la noche." },
  { name: "Relay Rita", about: "Self-hosting evangelist." },
  { name: "Sat Sergio", about: "Comercio Lightning para todos." },
  { name: "HODL Hilda", about: "Identidad soberana primero." },
];

// Projects spread across hackathons so vote budgets (distinct hackathons) vary.
const PROJECTS: ProjectSpec[] = [
  { id: "dummy-zappy-pos", name: "Zappy POS", description: "Punto de venta Lightning sin custodia.", repo: "https://github.com/dummy/zappy-pos", hackathon: "foundations", author: 0, team: [1] },
  { id: "dummy-nostr-id", name: "NostrID", description: "Identidad portátil NIP-05 + NIP-07.", repo: "https://github.com/dummy/nostr-id", hackathon: "identity", author: 0, team: [7] },
  { id: "dummy-sat-checkout", name: "SatCheckout", description: "Checkout para tiendas con LNURL.", repo: "https://github.com/dummy/sat-checkout", hackathon: "commerce", author: 0, team: [6] },
  { id: "dummy-bolt-board", name: "BoltBoard", description: "Leaderboard de zaps en vivo.", repo: "https://github.com/dummy/bolt-board", hackathon: "foundations", author: 1 },
  { id: "dummy-keychain", name: "Keychain", description: "Backup social de claves Nostr.", repo: "https://github.com/dummy/keychain", hackathon: "identity", author: 1, team: [2] },
  { id: "dummy-zap-arena", name: "Zap Arena", description: "Juego PvP con apuestas en sats.", repo: "https://github.com/dummy/zap-arena", hackathon: "zaps", author: 3, team: [4] },
  { id: "dummy-tetris-sats", name: "TetriSats", description: "Tetris que paga por líneas.", repo: "https://github.com/dummy/tetrisats", hackathon: "zaps", author: 4 },
  { id: "dummy-shopstr", name: "ShopNostr", description: "Marketplace descentralizado.", repo: "https://github.com/dummy/shopnostr", hackathon: "commerce", author: 3 },
  { id: "dummy-noderunner", name: "NodeRunner", description: "Dashboard de liquidez y rutas.", repo: "https://github.com/dummy/noderunner", hackathon: "foundations", author: 5 },
  { id: "dummy-mediavault", name: "MediaVault", description: "Almacenamiento cifrado sobre Blossom.", repo: "https://github.com/dummy/mediavault", hackathon: "media", author: 5, team: [6] },
  { id: "dummy-castr", name: "Castr", description: "Podcasting 2.0 con value-for-value.", repo: "https://github.com/dummy/castr", hackathon: "media", author: 6 },
  { id: "dummy-soberano", name: "Soberano", description: "Wallet de identidad + pagos.", repo: "https://github.com/dummy/soberano", hackathon: "identity", author: 7, team: [0] },
  { id: "dummy-tienda-zap", name: "TiendaZap", description: "Catálogo y cobros Lightning.", repo: "https://github.com/dummy/tienda-zap", hackathon: "commerce", author: 7 },
  { id: "dummy-arcade", name: "SatArcade", description: "Arcade retro pay-per-play.", repo: "https://github.com/dummy/sat-arcade", hackathon: "zaps", author: 7 },
];

function avatarFor(name: string): string {
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(name)}`;
}

/**
 * Deterministic 32-byte secret per dummy user (keyed by name). Re-running the
 * generator yields the SAME keypairs, so the replaceable project/profile events
 * are REPLACED rather than duplicated under fresh authors. Isomorphic via the
 * global Web Crypto.
 */
async function dummySecretFor(name: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode("lacrypta-dev-dummy:v1:" + name);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function makeSigner(secret: Uint8Array, finalizeEvent: typeof import("nostr-tools/pure").finalizeEvent, pubkey: string): UserSigner {
  return {
    pubkey,
    async signEvent(ev) {
      return finalizeEvent(
        { kind: ev.kind, tags: ev.tags, content: ev.content, created_at: ev.created_at },
        secret,
      );
    },
    async nip44Encrypt(peer, plaintext) {
      const nip44 = await import("nostr-tools/nip44");
      return nip44.encrypt(plaintext, nip44.getConversationKey(secret, peer));
    },
    async nip44Decrypt(peer, ciphertext) {
      const nip44 = await import("nostr-tools/nip44");
      return nip44.decrypt(ciphertext, nip44.getConversationKey(secret, peer));
    },
  };
}

export type SeedProgress = (msg: string, done: number, total: number) => void;

export type SeedResult = {
  users: DummyUser[];
  projectsPublished: number;
  profilesPublished: number;
};

/** Generates and publishes the full dummy dataset to DEFAULT_RELAYS (local). */
export async function generateDummyData(onProgress?: SeedProgress): Promise<SeedResult> {
  const { getPublicKey, finalizeEvent } = await import("nostr-tools/pure");
  const { npubEncode, nsecEncode } = await import("nostr-tools/nip19");

  const total = USERS.length + PROJECTS.length + 1;
  let done = 0;
  const step = (msg: string) => onProgress?.(msg, ++done, total);

  // 1. Deterministic keypairs — idempotent: re-seeding replaces, never dups.
  const users: DummyUser[] = await Promise.all(
    USERS.map(async (u) => {
      const secret = await dummySecretFor(u.name);
      const pubkey = getPublicKey(secret);
      return {
        name: u.name,
        pubkey,
        npub: npubEncode(pubkey),
        nsec: nsecEncode(secret),
        secret: Array.from(secret),
      };
    }),
  );
  const signerFor = (i: number) =>
    makeSigner(Uint8Array.from(users[i].secret), finalizeEvent, users[i].pubkey);

  // 2. Profiles (kind 0).
  let profilesPublished = 0;
  for (let i = 0; i < USERS.length; i++) {
    try {
      await publishNostrProfile(
        signerFor(i),
        {
          name: USERS[i].name,
          display_name: USERS[i].name,
          about: USERS[i].about,
          picture: avatarFor(USERS[i].name),
        },
        DEFAULT_RELAYS,
      );
      profilesPublished++;
    } catch {
      /* keep going; partial seed is still useful */
    }
    step(`Perfil: ${USERS[i].name}`);
  }

  // 3. Projects (kind 30078), each signed by its author.
  const now = Math.floor(Date.now() / 1000);
  let projectsPublished = 0;
  for (const spec of PROJECTS) {
    const memberIdxs = [spec.author, ...(spec.team ?? [])];
    const team: TeamMember[] = memberIdxs.map((idx, n) => ({
      name: users[idx].name,
      role: n === 0 ? "Lead Dev" : "Builder",
      pubkey: users[idx].pubkey,
      picture: avatarFor(users[idx].name),
    }));
    const project: UserProject = {
      id: spec.id,
      name: spec.name,
      description: spec.description,
      team,
      repo: spec.repo,
      tech: [],
      status: spec.status ?? "submitted",
      hackathon: spec.hackathon,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await publishUserProject(signerFor(spec.author), project, DEFAULT_RELAYS);
      projectsPublished++;
    } catch {
      /* keep going */
    }
    step(`Proyecto: ${spec.name}`);
  }

  // 4. Persist the dummy users (with nsecs) for reference / manual signing.
  try {
    window.localStorage.setItem(DUMMY_USERS_KEY, JSON.stringify(users));
  } catch {
    /* quota */
  }
  // eslint-disable-next-line no-console
  console.table(users.map((u) => ({ name: u.name, npub: u.npub, nsec: u.nsec })));

  // 5. Flush the server caches so the roster + voting eligibility see them.
  try {
    await fetch("/api/dev/revalidate", { method: "POST" });
  } catch {
    /* best effort */
  }
  step("Refrescando caché…");

  return { users, projectsPublished, profilesPublished };
}

export function loadDummyUsers(): DummyUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DUMMY_USERS_KEY);
    return raw ? (JSON.parse(raw) as DummyUser[]) : [];
  } catch {
    return [];
  }
}
