export type ProjectStatus =
  | "official"
  | "live"
  | "winner"
  | "finalist"
  | "submitted"
  | "building"
  | "idea"
  | "archived";

export type ProjectHackathon = "foundations" | "identity" | null;

export type TeamMember = {
  name: string;
  github: string;
  role: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  team: TeamMember[];
  repo?: string;
  demo?: string;
  tech?: string[];
  submittedAt?: string;
  hackathon: ProjectHackathon;
  hackathonMonth?: string;
  pitched?: string;
  pitchedFinal?: string;
};

export const HACKATHON_LABELS: Record<Exclude<ProjectHackathon, null>, string> =
  {
    foundations: "Foundations · Marzo 2026",
    identity: "Identity · Abril 2026",
  };

export const PROJECTS: Project[] = [
  {
    id: "lawallet",
    name: "LaWallet",
    description:
      "Wallet Lightning nativa en Nostr construida por la comunidad. NWC, LNURL y UX sin contraseñas — firmás con tu clave.",
    status: "live",
    team: [
      {
        name: "LaWallet",
        github: "lawalletio",
        role: "Organizers",
      },
    ],
    repo: "https://github.com/lawalletio/lawallet-nwc",
    demo: "https://lawallet.ar",
    tech: ["Lightning", "Nostr", "NWC", "LNURL", "NIP-47"],
    hackathon: null,
  },

  // ─── Hackathon Foundations · Marzo 2026 ──────────────────────────────
  {
    id: "lightning-starter",
    name: "Lightning Starter Kit",
    description:
      "Template oficial para empezar. NWC, Lightning Address, LNURL, WebLN.",
    status: "official",
    team: [{ name: "La Crypta", github: "lacrypta", role: "Organizers" }],
    repo: "https://github.com/lacrypta/lightning-starter",
    demo: "https://lightning-starter.vercel.app",
    tech: ["Alby SDK", "NWC", "LNURL", "WebLN", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-02-28",
  },
  {
    id: "proof-of-attendance-hdmp",
    name: "Proof of Attendance (HDMP)",
    description:
      "Sistema de reservas para eventos con depósito en Lightning Network. Pagás sats para reservar, si venís canjeás tu consumición, si no perdés la reserva. Elimina los no-shows con fricción mínima.",
    status: "submitted",
    team: [{ name: "Lo0ker-Noma", github: "Lo0ker-Noma", role: "Lead Dev" }],
    repo: "https://github.com/Lo0ker-Noma/Proof-of-attendance-HDMP",
    tech: ["Lightning Address", "Alby SDK", "LNURL", "WebLN", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-03-04",
    pitched: "https://www.youtube.com/watch?v=3sXD0EWWEdo&t=2464s",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=848s",
  },
  {
    id: "sat-lotto-v2",
    name: "SatLotto V2",
    description:
      "Juego simple y elegante que usa NWC y LN. Probá tu suerte cada 21 bloques.",
    status: "building",
    team: [{ name: "Fierillo", github: "Fierillo", role: "Lead Dev" }],
    repo: "https://github.com/Fierillo/sat-lotto-v2",
    tech: ["Alby SDK", "NWC", "LNURL", "WebLN", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-03-06",
    pitched: "https://www.youtube.com/watch?v=3sXD0EWWEdo&t=4903s",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=1126s",
  },
  {
    id: "bitbybit-habits",
    name: "BitByBit",
    description:
      "Habit tracker que recompensa completar tareas con sats reales vía Lightning. MVP: Mesada 2.0 donde sponsors crean hábitos con recompensa en sats y los kids los completan para ganar.",
    status: "building",
    team: [
      { name: "Anix", github: "analiaacostaok", role: "Lead Dev" },
      { name: "Llopo", github: "fabricio333", role: "Dev" },
      { name: "Wander", github: "Pizza-Wder", role: "Dev" },
      { name: "Leon", github: "leonacostaok", role: "PM" },
    ],
    repo: "https://github.com/bitbybit-ar/bitbybit-habits",
    demo: "https://bitbybit.com.ar",
    tech: ["Next.js", "React", "TypeScript", "NWC", "Alby SDK", "Neon DB", "SCSS"],
    hackathon: "foundations",
    submittedAt: "2026-03-07",
    pitched: "https://www.youtube.com/watch?v=3sXD0EWWEdo&t=3074s",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=1390s",
  },
  {
    id: "streamsats",
    name: "Streamsats",
    description:
      "Un juego de agilidad mental y rapidez para ganar un bote acumulado de sats.",
    status: "submitted",
    team: [{ name: "Federico", github: "FedericoLuque", role: "Lead Dev" }],
    repo: "https://github.com/Streamsats/streamsats.github.io",
    demo: "https://streamsats.github.io/",
    tech: ["Alby SDK", "NWC", "LNURL", "WebLN", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-03-10",
    pitched: "https://www.youtube.com/watch?v=3sXD0EWWEdo&t=4096s",
  },
  {
    id: "hash21-shop",
    name: "Hash21 Shop",
    description:
      "Tienda real de joyería artesanal Bitcoin con pagos nativos Lightning. Plata 925 con grabados Bitcoin. Sin intermediarios, sin KYC. LNURL-pay vía Lightning Address, zero dependencias, i18n ES/EN.",
    status: "submitted",
    team: [
      { name: "Abstract Lai", github: "warrior-lai", role: "Lead Dev" },
      { name: "Ragnar 🪓", github: "", role: "AI Dev" },
    ],
    repo: "https://github.com/warrior-lai/hash21-shop",
    demo: "https://hash21.studio/shop",
    tech: ["LNURL-pay", "Lightning Address", "HTML/CSS/JS", "GitHub Pages"],
    hackathon: "foundations",
    submittedAt: "2026-03-07",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=1669s",
  },
  {
    id: "anirayo",
    name: "AniRayo",
    description:
      "Convierte cualquier smartphone Android con NFC en una terminal de cobro (POS) con magia NWC y 1-toque.",
    status: "submitted",
    team: [{ name: "CapScabio", github: "CapScabio", role: "Lead Dev" }],
    repo: "https://github.com/CapScabio/Anirayo",
    tech: ["Web NFC", "Alby SDK", "NWC", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-03-08",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=2269s",
  },
  {
    id: "digital-card",
    name: "Digital Card",
    description: "Tu tarjeta de presentación Bitcoin.",
    status: "building",
    team: [{ name: "negr0", github: "Negr087", role: "Lead Dev" }],
    repo: "https://github.com/Negr087/digital-card",
    demo: "https://digitalcard-sigma.vercel.app/",
    tech: ["Alby SDK", "NWC", "LNURL", "WebLN", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-03-08",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=2062s",
  },
  {
    id: "wapu-cli",
    name: "Wapu CLI",
    description:
      "CLI OpenSource para operar WapuPay como servicio off-ramp de BTC y USDT a ARS sin KYC. Depósitos por Lightning Address y automatización para POS y agentes de IA.",
    status: "building",
    team: [
      { name: "Rocket", github: "rocket-morgan", role: "Dev" },
      { name: "AndyCreed", github: "andycreed0x", role: "PM" },
    ],
    repo: "https://github.com/wapu-app/wapu-cli",
    demo: "https://wapu.shiafu.com/",
    tech: ["Python", "Lightning Address"],
    hackathon: "foundations",
    submittedAt: "2026-03-10",
    pitched: "https://www.youtube.com/watch?v=3sXD0EWWEdo&t=3706s",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=3577s",
  },
  {
    id: "relam-pago",
    name: "RelámPago",
    description:
      "App web (PWA) para comerciantes y emprendedores de LATAM que quieren recibir pagos con LN — sin necesidad de saber nada técnico.",
    status: "building",
    team: [{ name: "Burgos", github: "Burgos247", role: "Lead Dev" }],
    repo: "https://github.com/Burgos247/RelamPago/",
    demo: "https://relam-pago.vercel.app",
    tech: ["Alby SDK", "NWC", "LNURL", "WebLN", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-03-10",
  },
  {
    id: "stacktris",
    name: "Stacktris",
    description:
      "Battle Tetris multijugador con una capa de apuestas en Bitcoin Lightning Network.",
    status: "building",
    team: [{ name: "landaverdend", github: "landaverdend", role: "Lead Dev" }],
    repo: "https://github.com/landaverdend/stacktris",
    demo: "https://stacktris.app/",
    tech: ["React", "TypeScript", "Node.js", "Express", "WebSockets", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-03-09",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=2887s",
  },
  {
    id: "satsparty",
    name: "SatsParty",
    description:
      "La solución para hacer onboarding y proveer wallets a los invitados de tu evento.",
    status: "building",
    team: [{ name: "Cyberpunk", github: "ViresBTC", role: "Vibecoder" }],
    repo: "https://github.com/ViresBTC/Satsparty",
    demo: "https://satsparty.vercel.app/",
    tech: ["Alby SDK", "NWC", "LNURL", "WebLN", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-03-11",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=2583s",
  },
  {
    id: "1-sat-to",
    name: "1 SAT a…",
    description:
      "App para visualizar en tiempo real el valor de un satoshi en FIAT, con gráficos históricos, calculadora y donaciones vía Lightning.",
    status: "building",
    team: [{ name: "Jona", github: "unllamas", role: "Dev/Designer" }],
    repo: "https://github.com/unllamas/1-sat-to",
    demo: "https://1-sat-to.vercel.app/",
    tech: ["React", "Next.js", "Lightning"],
    hackathon: "foundations",
    submittedAt: "2026-03-17",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=3185s",
  },
  {
    id: "openwork",
    name: "openWork",
    description:
      "Establece un contrato entre un agente y otro para que uno haga un trabajo para el otro contra una contraprestación usando satoshis de LN.",
    status: "idea",
    team: [{ name: "naranja", github: "soyezequiel", role: "Lead Dev" }],
    repo: "https://github.com/soyezequiel/agentic-economy",
    tech: ["Lightning", "AI Agents"],
    hackathon: "foundations",
    submittedAt: "2026-03-17",
  },
  {
    id: "life-action-plan",
    name: "Life Action Plan (LAP)",
    description:
      "Asistente personal offline-first que usa IA para crear, simular y refinar planes de vida y rutinas diarias, con privacidad extrema y micro-pagos por token vía Lightning.",
    status: "idea",
    team: [{ name: "naranja", github: "soyezequiel", role: "Lead Dev" }],
    repo: "https://github.com/soyezequiel/life-action-plan",
    tech: ["AI", "Lightning"],
    hackathon: "foundations",
    submittedAt: "2026-03-18",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=4457s",
  },
  {
    id: "nosteach",
    name: "NosTeach",
    description:
      "Plataforma educativa descentralizada. MVP: patrocinios Lightning para cursos. Alumnos pagan cursos, profesores premian alumnos, patrocinadores becan a ambos. Todo vía Lightning.",
    status: "building",
    team: [
      { name: "Fred", github: "fchurca", role: "Lead Dev" },
      { name: "Langostero", github: "fchurca", role: "Dev" },
    ],
    repo: "https://github.com/fchurca/nosteach",
    demo: "https://nosteach.vercel.app/",
    tech: ["Alby SDK", "NWC", "Vite"],
    hackathon: "foundations",
    submittedAt: "2026-03-17",
    pitchedFinal: "https://www.youtube.com/watch?v=W9Fw72-jFX0&t=4103s",
  },
  {
    id: "sweet-shots",
    name: "Sweet Shots",
    description:
      "E-commerce de postres artesanales con pagos nativos Lightning. Login sin email vía Nostr (NIP-07), catálogo con precios USD+sats en tiempo real, fidelidad nativa en sats y 5% off por pagar con Bitcoin.",
    status: "building",
    team: [{ name: "Lalo1821", github: "Lalo1821", role: "Lead Dev" }],
    repo: "https://github.com/Lalo1821/sweet-shots",
    demo: "https://sweet-shots.vercel.app",
    tech: [
      "Lightning Address",
      "Nostr NIP-07",
      "WebLN",
      "Alby SDK",
      "Vite",
      "Vanilla JS",
    ],
    hackathon: "foundations",
    submittedAt: "2026-03-18",
  },

  // ─── Hackathon Identity · Abril 2026 ─────────────────────────────────
  {
    id: "nostr-starter",
    name: "Nostr Starter Kit",
    description:
      "Template oficial para empezar. Keys, profiles, relays, NIP-01 basics.",
    status: "official",
    team: [{ name: "La Crypta", github: "lacrypta", role: "Organizers" }],
    repo: "https://github.com/lacrypta/nostr-starter",
    tech: ["Nostr", "NIP-01", "NDK", "Vite"],
    hackathon: "identity",
    submittedAt: "2026-04-01",
  },
  {
    id: "scammer-come-empanadas-detector",
    name: "Scammer & Come Empanadas Detector",
    description:
      "Nostr Identity Hub con verificación NIP-05, badges de reputación y detección de scammers/come-empanadas para la comunidad de La Crypta.",
    status: "building",
    team: [{ name: "Looker", github: "Lo0ker-Noma", role: "Lead Dev" }],
    repo: "https://github.com/Lo0ker-Noma/nostr-identity-hub",
    demo: "https://nostr-identity-hub.vercel.app/",
    tech: ["Nostr", "NIP-05", "NIP-58", "NIP-57", "Vite", "Vercel"],
    hackathon: "identity",
    submittedAt: "2026-04-07",
  },
  {
    id: "nostr-en-el-espacio",
    name: "Nostr en el Espacio",
    description:
      "Explorá Nostr como si fuera un universo vivo: cargás una npub o nprofile y descubrís follows, conexiones y comunidades como un grafo interactivo para ver, entender y navegar las relaciones entre usuarios.",
    status: "building",
    team: [{ name: "Naranja", github: "soyezequiel", role: "Lead Dev" }],
    repo: "https://github.com/soyezequiel/nostr-en-el-espacio",
    demo: "https://nostr-en-el-espacio.vercel.app/",
    tech: [
      "Next.js",
      "React 19",
      "TypeScript",
      "Zustand",
      "Dexie",
      "nostr-tools",
      "NDK",
      "d3-force",
      "deck.gl",
    ],
    hackathon: "identity",
    submittedAt: "2026-04-09",
  },
  {
    id: "obelisk",
    name: "Obelisk",
    description:
      "Chat grupal tipo Discord donde la identidad viene de tu keypair de Nostr. Sin emails ni passwords — filtrado de spam vía Web of Trust, canales de texto y voz, roles y moderación.",
    status: "building",
    team: [
      { name: "Fabricio", github: "Fabricio333", role: "Lead Dev" },
      { name: "Topolino", github: "topolino-claw", role: "Dev" },
    ],
    repo: "https://github.com/Fabricio333/obelisk",
    demo: "https://obelisk.ar",
    tech: [
      "Next.js",
      "TypeScript",
      "Nostr",
      "NDK",
      "NIP-07",
      "NIP-46",
      "NIP-05",
      "NIP-65",
      "Prisma",
      "PostgreSQL",
      "Socket.io",
      "Tailwind",
    ],
    hackathon: "identity",
    submittedAt: "2026-04-10",
  },
  {
    id: "predictr",
    name: "Predictr — P2P Bitcoin Prediction Bulletin",
    description:
      "Mercado de apuestas P2P trustless y browser-native: los usuarios publican bets en Nostr, negocian vía DMs cifrados (NIP-44) y liquidan on-chain con contratos Bitcoin Taproot. Sin coordinador, sin custodio, sin backend.",
    status: "building",
    team: [{ name: "nic(o)", github: "landaverdend", role: "Lead Dev" }],
    repo: "https://github.com/landaverdend/predictr",
    tech: [
      "Bitcoin",
      "Taproot",
      "DLC",
      "Nostr",
      "NIP-44",
      "NIP-40",
      "nostr-tools",
      "TypeScript",
      "React",
      "Vite",
      "Tailwind",
    ],
    hackathon: "identity",
    submittedAt: "2026-04-11",
  },
  {
    id: "arena",
    name: "Arena",
    description:
      "Retá a tu red y compartí tu gloria en Nostr. Competí, reclamá recompensas en vivo y forjá tu identidad con badges NIP-58. Cliente de BitByBit.",
    status: "building",
    team: [
      { name: "Anix", github: "analiaacostaok", role: "Lead Dev" },
      { name: "Wander", github: "Pizza-Wder", role: "Designer" },
    ],
    repo: "https://github.com/bitbybit-ar/bitbybit-arena",
    demo: "https://arena.bitbybit.com.ar",
    tech: [
      "NIP-01",
      "NIP-07",
      "NIP-42",
      "NIP-46",
      "NIP-57",
      "NIP-58",
      "NIP-75",
      "Next.js 16",
      "React 19",
      "TypeScript",
      "SCSS Modules",
      "next-intl",
      "Drizzle ORM",
      "Neon",
      "nostr-tools",
      "Alby SDK",
      "JWT (jose)",
    ],
    hackathon: "identity",
    submittedAt: "2026-04-10",
  },
  {
    id: "nostr-kahoot",
    name: "Nostr Kahoot",
    description:
      "Kahoot descentralizado construido en Nostr. Cuestionarios interactivos en tiempo real con autenticación NIP-07, eventos firmados criptográficamente, QR para unirse y ranking en vivo.",
    status: "building",
    team: [{ name: "Looker", github: "Lo0ker-Noma", role: "Lead Dev" }],
    repo: "https://github.com/Lo0ker-Noma/nostr-kahoot",
    tech: [
      "Nostr",
      "NIP-07",
      "React 18",
      "Vite",
      "Zustand",
      "Tailwind CSS",
      "qrcode.react",
      "Vercel",
    ],
    hackathon: "identity",
    submittedAt: "2026-04-15",
  },
];

const TECH_TO_TAG: { patterns: RegExp[]; tag: string }[] = [
  { patterns: [/nostr/i, /nip-/i, /ndk/i, /nostr-tools/i], tag: "nostr" },
  {
    patterns: [
      /lightning/i,
      /lnurl/i,
      /webln/i,
      /\bnwc\b/i,
      /alby/i,
      /\bln\b/i,
    ],
    tag: "lightning",
  },
  { patterns: [/bitcoin/i, /taproot/i, /dlc/i, /miniscript/i], tag: "bitcoin" },
  { patterns: [/\bai\b/i, /agent/i], tag: "ai" },
];

export function deriveTags(p: Project): string[] {
  const tags = new Set<string>();
  const tech = (p.tech ?? []).join(" ");
  const haystack = `${tech} ${p.description} ${p.name}`;
  for (const { patterns, tag } of TECH_TO_TAG) {
    if (patterns.some((re) => re.test(haystack))) tags.add(tag);
  }
  if (/wallet/i.test(haystack)) tags.add("wallet");
  return [...tags];
}
