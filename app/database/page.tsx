import type { Metadata } from "next";
import DatabaseClient from "./DatabaseClient";

export const metadata: Metadata = {
  title: "Database",
  description: "Explorador de eventos Nostr y republicación entre relays.",
  robots: { index: false, follow: false },
};

export default function DatabasePage() {
  return <DatabaseClient />;
}
