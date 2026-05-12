import type { Metadata } from "next";
import { PROJECTS } from "@/lib/projects";
import CuratedProjectPage from "./CuratedProjectPage";
import UserProjectsPage from "./UserProjectsPage";

function findCurated(slug: string) {
  const lc = slug.toLowerCase();
  return PROJECTS.find((p) => p.id.toLowerCase() === lc) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}): Promise<Metadata> {
  const { pubkey } = await params;
  const curated = findCurated(pubkey);
  if (curated) {
    return {
      title: `${curated.name} · Proyecto`,
      description: curated.description,
      alternates: { canonical: `/projects/${curated.id}` },
    };
  }
  return {
    title: "Proyectos del usuario",
    robots: { index: false, follow: false },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}) {
  const { pubkey } = await params;
  // The [pubkey] segment doubles as a curated-project id when it matches one
  // in lib/projects.ts. Otherwise it's interpreted as a Nostr pubkey and the
  // page lists that user's NIP-78 projects.
  const curated = findCurated(pubkey);
  if (curated) return <CuratedProjectPage project={curated} />;
  return <UserProjectsPage pubkey={pubkey} />;
}
