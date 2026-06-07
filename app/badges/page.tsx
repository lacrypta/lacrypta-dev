import type { Metadata } from "next";
import { connection } from "next/server";
import {
  HACKATHONS,
  hackathonStatus,
  type Hackathon,
} from "@/lib/hackathons";
import BadgesClient from "./BadgesClient";

export const metadata: Metadata = {
  title: "Badges",
  description:
    "Badges NIP-58 de la hackatón activa de La Crypta Dev.",
  alternates: { canonical: "/badges" },
};

function firstDate(hackathon: Hackathon) {
  return [...hackathon.dates].sort((a, b) => a.date.localeCompare(b.date))[0]
    ?.date;
}

function pickFeaturedHackathon(now: Date) {
  const active = HACKATHONS.find(
    (hackathon) => hackathonStatus(hackathon, now) === "active",
  );
  if (active) return active;

  const upcoming = HACKATHONS.filter(
    (hackathon) => hackathonStatus(hackathon, now) === "upcoming",
  ).sort((a, b) => (firstDate(a) ?? "").localeCompare(firstDate(b) ?? ""));
  if (upcoming[0]) return upcoming[0];

  return HACKATHONS[HACKATHONS.length - 1];
}

export default async function BadgesPage() {
  await connection();
  const hackathon = pickFeaturedHackathon(new Date());

  return (
    <BadgesClient
      hackathonId={hackathon.id}
      hackathonName={hackathon.name}
    />
  );
}
