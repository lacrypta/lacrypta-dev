import type { Metadata } from "next";
import ProjectsGrid from "./ProjectsGrid";
import PageHero from "@/components/ui/PageHero";
import { Code2 } from "lucide-react";
import { getNostrSubmissionsSnapshot } from "@/lib/nostrCache";
import { getProjectRegistryState } from "@/lib/projectRegistry";
import { attachProjectSlugs } from "@/lib/projectResolver";

const DESCRIPTION =
  "Proyectos open source construidos por y con la comunidad de La Crypta — Bitcoin, Lightning, Nostr y más.";

export const metadata: Metadata = {
  title: "Proyectos",
  description: DESCRIPTION,
  alternates: { canonical: "/projects" },
  openGraph: {
    title: "Proyectos · La Crypta Dev",
    description: DESCRIPTION,
    url: "/projects",
    type: "website",
  },
  twitter: {
    // Page-level `twitter` replaces the layout's object wholesale, so `card`
    // has to be restated or it silently degrades to the small "summary" card.
    card: "summary_large_image",
    title: "Proyectos · La Crypta Dev",
    description: DESCRIPTION,
  },
};

export default async function ProjectsPage() {
  const [snapshot, registry] = await Promise.all([
    getNostrSubmissionsSnapshot(),
    getProjectRegistryState(),
  ]);
  const initialNostrProjects = attachProjectSlugs(snapshot.projects, registry);

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
      />
      <ProjectsGrid initialNostrProjects={initialNostrProjects} />
    </>
  );
}
