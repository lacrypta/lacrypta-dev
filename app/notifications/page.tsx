import type { Metadata } from "next";
import NotificationsClient from "./NotificationsClient";

export const metadata: Metadata = {
  title: "Notificaciones",
  robots: { index: false },
  alternates: { canonical: "/notifications" },
};

export default function NotificationsPage() {
  return <NotificationsClient />;
}
