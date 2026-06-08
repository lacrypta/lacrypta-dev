/**
 * Procedural low-poly art generators (pure, dependency-free).
 *
 * Used by the onboarding wizard to give brand-new users a generated avatar
 * and cover without uploading anything. Each piece is a triangulated SVG mesh
 * coloured from a themed palette; output is deterministic for a given seed so
 * the same user always sees the same gallery of 21 avatars.
 */

export type Element = "tierra" | "agua" | "fuego" | "aire";

/* ──────────────────────────── seeded PRNG ──────────────────────────── */

/** Hash a string into a 32-bit seed (xmur3). */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Fast seeded PRNG (mulberry32) → floats in [0, 1). */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFromSeed(seed: string): () => number {
  return mulberry32(xmur3(seed)());
}

/* ──────────────────────────── colour math ──────────────────────────── */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear interpolation between two hex colours. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** Sample a multi-stop gradient at t∈[0,1]. */
function sampleGradient(stops: string[], t: number): string {
  if (stops.length === 1) return stops[0];
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

/* ──────────────────────────── palettes ──────────────────────────── */

/** Avatar palettes (dark → mid → light), aligned to brand hues. */
const AVATAR_PALETTES: string[][] = [
  ["#7c2d12", "#f7931a", "#fde68a"], // bitcoin ember
  ["#581c87", "#a855f7", "#e9d5ff"], // nostr violet
  ["#083344", "#22d3ee", "#cffafe"], // cyan deep
  ["#14532d", "#22c55e", "#bbf7d0"], // green
  ["#1e3a8a", "#3b82f6", "#bfdbfe"], // blue
  ["#7f1d1d", "#ef4444", "#fecaca"], // red
  ["#831843", "#ec4899", "#fbcfe8"], // pink
];

export const AVATAR_VARIANTS = 21;

/** 8 accent colours offered for the cover. */
export const COVER_COLORS: { label: string; hex: string }[] = [
  { label: "Naranja", hex: "#f7931a" },
  { label: "Violeta", hex: "#a855f7" },
  { label: "Cian", hex: "#22d3ee" },
  { label: "Dorado", hex: "#ffd700" },
  { label: "Verde", hex: "#22c55e" },
  { label: "Rojo", hex: "#ef4444" },
  { label: "Azul", hex: "#3b82f6" },
  { label: "Rosa", hex: "#ec4899" },
];

/** 4 elements; each sets the cover's base mood palette (dark → light). */
export const ELEMENTS: { id: Element; label: string; base: string[] }[] = [
  { id: "tierra", label: "Tierra", base: ["#140e02", "#3f2d0f", "#6b4f1d"] },
  { id: "agua", label: "Agua", base: ["#02101a", "#06283d", "#0a4d68"] },
  { id: "fuego", label: "Fuego", base: ["#170400", "#3d0f02", "#7a1f06"] },
  { id: "aire", label: "Aire", base: ["#080b14", "#1b2238", "#36406a"] },
];

/* ──────────────────────────── geometry ──────────────────────────── */

type Pt = { x: number; y: number };

function fmt(n: number): string {
  return n.toFixed(1);
}

function polygon(a: Pt, b: Pt, c: Pt, fill: string): string {
  return `<polygon points="${fmt(a.x)},${fmt(a.y)} ${fmt(b.x)},${fmt(b.y)} ${fmt(c.x)},${fmt(c.y)}" fill="${fill}" stroke="${fill}" stroke-width="0.6"/>`;
}

/* ──────────────────────────── avatar ──────────────────────────── */

/**
 * A square low-poly mosaic. Brightness rises toward a point slightly above
 * centre (a soft "light source"), giving the facets some depth.
 */
export function lowpolyAvatarSvg(seed: string, paletteIndex: number): string {
  const rnd = rngFromSeed(seed);
  const pal = AVATAR_PALETTES[paletteIndex % AVATAR_PALETTES.length];
  const SIZE = 100;
  const N = 6;
  const step = SIZE / N;

  const pts: Pt[][] = [];
  for (let r = 0; r <= N; r++) {
    const row: Pt[] = [];
    for (let c = 0; c <= N; c++) {
      const edge = r === 0 || c === 0 || r === N || c === N;
      const jx = edge ? 0 : (rnd() - 0.5) * step * 0.8;
      const jy = edge ? 0 : (rnd() - 0.5) * step * 0.8;
      row.push({ x: c * step + jx, y: r * step + jy });
    }
    pts.push(row);
  }

  const cx = SIZE / 2;
  const cy = SIZE * 0.42;
  const maxD = Math.hypot(SIZE / 2, SIZE / 2);
  const polys: string[] = [];

  const tri = (a: Pt, b: Pt, c: Pt) => {
    const gx = (a.x + b.x + c.x) / 3;
    const gy = (a.y + b.y + c.y) / 3;
    const d = Math.hypot(gx - cx, gy - cy) / maxD;
    const v = clamp01((1 - d) * 0.85 + rnd() * 0.15);
    polys.push(polygon(a, b, c, sampleGradient(pal, v)));
  };

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const tl = pts[r][c];
      const tr = pts[r][c + 1];
      const bl = pts[r + 1][c];
      const br = pts[r + 1][c + 1];
      if ((r + c) % 2 === 0) {
        tri(tl, tr, br);
        tri(tl, br, bl);
      } else {
        tri(tl, tr, bl);
        tri(tr, br, bl);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${polys.join("")}</svg>`;
}

/** Deterministic gallery of 21 avatar variants for a given pubkey. */
export function avatarSeedsFor(
  pubkey: string,
): { seed: string; palette: number }[] {
  return Array.from({ length: AVATAR_VARIANTS }, (_, i) => ({
    seed: `${pubkey}:av:${i}`,
    palette: i % AVATAR_PALETTES.length,
  }));
}

/**
 * Derive a single avatar variant (mesh seed + palette) deterministically from
 * arbitrary text — e.g. the display name being typed. Same text → same avatar.
 */
export function avatarVariantFromText(text: string): {
  seed: string;
  palette: number;
} {
  const key = text || "lacrypta";
  const palette = xmur3(`pal:${key}`)() % AVATAR_PALETTES.length;
  return { seed: `txt:${key}`, palette };
}

/* ──────────────────────────── cover ──────────────────────────── */

/**
 * A 3:1 low-poly banner. The element sets a dark→light vertical base palette;
 * the chosen accent colour blooms from a seeded hotspot.
 */
export function lowpolyCoverSvg(
  colorIndex: number,
  element: Element,
  seed: string,
): string {
  const rnd = rngFromSeed(`${seed}:${element}:${colorIndex}`);
  const accent = COVER_COLORS[colorIndex % COVER_COLORS.length].hex;
  const el = ELEMENTS.find((e) => e.id === element) ?? ELEMENTS[0];
  const W = 300;
  const H = 100;
  const cols = 15;
  const rows = 5;
  const sx = W / cols;
  const sy = H / rows;

  const pts: Pt[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: Pt[] = [];
    for (let c = 0; c <= cols; c++) {
      const vEdge = r === 0 || r === rows;
      const hEdge = c === 0 || c === cols;
      const jx = hEdge ? 0 : (rnd() - 0.5) * sx * 0.7;
      const jy = vEdge ? 0 : (rnd() - 0.5) * sy * 0.7;
      row.push({ x: c * sx + jx, y: r * sy + jy });
    }
    pts.push(row);
  }

  const hx = W * (0.2 + rnd() * 0.6);
  const hy = H * (0.2 + rnd() * 0.6);
  const maxD = Math.hypot(W, H);
  const polys: string[] = [];

  const tri = (a: Pt, b: Pt, c: Pt) => {
    const gx = (a.x + b.x + c.x) / 3;
    const gy = (a.y + b.y + c.y) / 3;
    const baseT = clamp01((gy / H) * 0.7 + rnd() * 0.3);
    let col = sampleGradient(el.base, 1 - baseT);
    const dist = Math.hypot(gx - hx, gy - hy) / maxD;
    const accentAmt = clamp01(0.55 - dist * 1.3);
    col = mix(col, accent, accentAmt * 0.8);
    polys.push(polygon(a, b, c, col));
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tl = pts[r][c];
      const tr = pts[r][c + 1];
      const bl = pts[r + 1][c];
      const br = pts[r + 1][c + 1];
      if ((r + c) % 2 === 0) {
        tri(tl, tr, br);
        tri(tl, br, bl);
      } else {
        tri(tl, tr, bl);
        tri(tr, br, bl);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${polys.join("")}</svg>`;
}
