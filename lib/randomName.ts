/**
 * Playful Spanish display-name generator for onboarding. Pure & dependency-free.
 */

const ADJECTIVES = [
  "Veloz",
  "Naranja",
  "Eléctrico",
  "Soberano",
  "Salvaje",
  "Cuántico",
  "Lunar",
  "Brillante",
  "Indómito",
  "Sereno",
  "Audaz",
  "Cósmico",
  "Rebelde",
  "Ágil",
  "Noble",
  "Místico",
  "Radiante",
  "Errante",
];

const NOUNS = [
  "Satoshi",
  "Relámpago",
  "Nodo",
  "Bloque",
  "Zorro",
  "Lobo",
  "Halcón",
  "Cometa",
  "Faro",
  "Rayo",
  "Cóndor",
  "Tigre",
  "Dragón",
  "Puma",
  "Búho",
  "Lince",
  "Cuervo",
  "Jaguar",
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** e.g. "Relámpago Veloz". */
export function randomDisplayName(): string {
  return `${pick(NOUNS)} ${pick(ADJECTIVES)}`;
}

/** Lowercase, accent-free, hyphenated handle derived from a display name. */
export function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
