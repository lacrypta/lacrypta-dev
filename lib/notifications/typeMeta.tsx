import type { ComponentType } from "react";
import {
  Award,
  BellRing,
  FileText,
  Gamepad2,
  Handshake,
  Megaphone,
  Radio,
  Rocket,
  Users,
  Zap,
} from "lucide-react";
import type { NotificationType } from "./types";

export type TypeMeta = {
  icon: ComponentType<{ className?: string }>;
  /** Tailwind text-color token for the icon accent. */
  accent: string;
  /** Short Spanish label. */
  label: string;
};

export const TYPE_META: Record<NotificationType, TypeMeta> = {
  "badge-award": { icon: Award, accent: "text-bitcoin", label: "Insignia" },
  zap: { icon: Zap, accent: "text-lightning", label: "Zap" },
  "project-report": { icon: FileText, accent: "text-cyan", label: "Reporte" },
  "new-hackathon": { icon: Rocket, accent: "text-nostr", label: "Hackatón" },
  "community-call": {
    icon: Megaphone,
    accent: "text-cyan",
    label: "Community call",
  },
  announcement: { icon: Radio, accent: "text-bitcoin", label: "La Crypta" },
  "game-invite": { icon: Gamepad2, accent: "text-nostr", label: "Juego" },
  "pitch-request": { icon: Handshake, accent: "text-bitcoin", label: "Pitch" },
  "user-message": { icon: Users, accent: "text-foreground", label: "Mensaje" },
  subscription: { icon: BellRing, accent: "text-success", label: "Suscripción" },
};

export function typeMeta(type: NotificationType): TypeMeta {
  return TYPE_META[type] ?? TYPE_META["user-message"];
}
