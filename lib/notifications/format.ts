/** Spanish (es_AR) relative-time + time-bucketing for the notification list. */
import type { AppNotification } from "./types";

export function relativeTime(
  createdAt: number,
  nowMs: number = Date.now(),
): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000) - createdAt);
  if (diff < 60) return "recién";
  const min = Math.floor(diff / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(diff / 3600);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(diff / 86_400);
  if (d < 7) return `hace ${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `hace ${w} sem`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `hace ${mo} ${mo === 1 ? "mes" : "meses"}`;
  const y = Math.floor(d / 365);
  return `hace ${y} ${y === 1 ? "año" : "años"}`;
}

export type TimeBucket = "Hoy" | "Ayer" | "Esta semana" | "Antes";

const BUCKET_ORDER: TimeBucket[] = ["Hoy", "Ayer", "Esta semana", "Antes"];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function timeBucket(
  createdAt: number,
  nowMs: number = Date.now(),
): TimeBucket {
  const now = new Date(nowMs);
  const ms = createdAt * 1000;
  const todayStart = startOfDay(now);
  if (ms >= todayStart) return "Hoy";
  if (ms >= todayStart - 86_400_000) return "Ayer";
  if (ms >= todayStart - 6 * 86_400_000) return "Esta semana";
  return "Antes";
}

export function groupByBucket(
  items: AppNotification[],
  nowMs: number = Date.now(),
): { bucket: TimeBucket; items: AppNotification[] }[] {
  const map = new Map<TimeBucket, AppNotification[]>();
  for (const n of items) {
    const b = timeBucket(n.createdAt, nowMs);
    const arr = map.get(b);
    if (arr) arr.push(n);
    else map.set(b, [n]);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({
    bucket,
    items: map.get(bucket)!,
  }));
}
