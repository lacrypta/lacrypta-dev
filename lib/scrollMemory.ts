const SCROLL_MEMORY_PREFIX = "labs:scroll:";
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

type ScrollMemory = {
  x: number;
  y: number;
  at: number;
};

function storageKey(key: string) {
  return `${SCROLL_MEMORY_PREFIX}${key}`;
}

export function rememberScrollPosition(key: string) {
  if (typeof window === "undefined") return;
  try {
    const snapshot: ScrollMemory = {
      x: window.scrollX,
      y: window.scrollY,
      at: Date.now(),
    };
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(snapshot));
  } catch {
    /* session storage can be unavailable in private contexts */
  }
}

export function restoreScrollPosition(
  key: string,
  opts?: { maxAgeMs?: number; remove?: boolean },
) {
  if (typeof window === "undefined") return () => {};
  const maxAgeMs = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  let saved: ScrollMemory | null = null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return () => {};
    const parsed = JSON.parse(raw) as Partial<ScrollMemory>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.at !== "number" ||
      Date.now() - parsed.at > maxAgeMs
    ) {
      window.sessionStorage.removeItem(storageKey(key));
      return () => {};
    }
    saved = { x: parsed.x, y: parsed.y, at: parsed.at };
    if (opts?.remove ?? true) {
      window.sessionStorage.removeItem(storageKey(key));
    }
  } catch {
    return () => {};
  }

  let cancelled = false;
  let frame = 0;
  let secondFrame = 0;
  let timeout = 0;

  const jump = () => {
    if (cancelled || !saved) return;
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(saved.x, saved.y);
    root.style.scrollBehavior = previousBehavior;
  };

  frame = window.requestAnimationFrame(() => {
    jump();
    secondFrame = window.requestAnimationFrame(jump);
  });
  timeout = window.setTimeout(jump, 160);

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
    window.cancelAnimationFrame(secondFrame);
    window.clearTimeout(timeout);
  };
}
