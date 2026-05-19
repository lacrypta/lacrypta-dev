import type { Metadata } from "next";
import ProjectsGrid from "./ProjectsGrid";
import PageHero from "@/components/ui/PageHero";
import { Code2 } from "lucide-react";
import { getNostrSubmissionsSnapshot } from "@/lib/nostrCache";

export const metadata: Metadata = {
  title: "Proyectos",
  description:
    "Proyectos open source construidos por y con la comunidad de La Crypta — Bitcoin, Lightning, Nostr y más.",
};

export default async function ProjectsPage() {
  const initialNostrProjects = (await getNostrSubmissionsSnapshot()).projects;

  return (
    <>
      <PageHero
        eyebrow="PROYECTOS DE LA COMUNIDAD"
        eyebrowIcon={<Code2 className="h-3 w-3" />}
        title={
          <span className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-gradient-hero animate-gradient-x">
            Laboratorio oficial
            <br />
            de La Crypta.
          </span>
        }
        description="Proyectos grandes y chicos, lanzados y en progreso, todos open source. Construidos por la comunidad de La Crypta en Buenos Aires y más allá."
      />
      <ProjectsGrid initialNostrProjects={initialNostrProjects} />
    </>
  );
}
