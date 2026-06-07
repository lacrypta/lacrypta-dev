import type { Metadata } from "next";
import { connection } from "next/server";
import { getNostrProjectByAuthor } from "@/lib/nostrCache";
import StandaloneProjectPage from "./StandaloneProjectPage";

export const metadata: Metadata = {
  title: "Proyecto",
  robots: { index: false, follow: false },
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ pubkey: string; id: string }>;
}) {
  await connection();
  const { pubkey, id: projectId } = await params;
  // Pre-fetch from the shared cached relay snapshot (same source the hackathon
  // project pages and sitemap use). This makes the page resilient: if the
  // browser-side relay fetch can't reach the relays in production, the project
  // still renders from server data instead of dead-ending at "not found".
  const cached = await getNostrProjectByAuthor(pubkey, projectId);
  return (
    <StandaloneProjectPage
      pubkey={pubkey}
      projectId={projectId}
      initialProject={cached ?? undefined}
    />
  );
}
