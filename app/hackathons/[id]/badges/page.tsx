import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HACKATHONS, getHackathon } from "@/lib/hackathons";
import HackathonBadgesClient from "./HackathonBadgesClient";

export function generateStaticParams() {
  return HACKATHONS.map((h) => ({ id: h.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const hackathon = getHackathon(id);
  if (!hackathon) return { title: "Badges de hackatón" };
  return {
    title: `Badges · ${hackathon.name}`,
    description: `Badges disponibles para la hackatón ${hackathon.name}.`,
    alternates: { canonical: `/hackathons/${hackathon.id}/badges` },
  };
}

export default async function HackathonBadgesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hackathon = getHackathon(id);
  if (!hackathon) notFound();

  return (
    <HackathonBadgesClient
      hackathonId={hackathon.id}
      hackathonName={hackathon.name}
    />
  );
}
