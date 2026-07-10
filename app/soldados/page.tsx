import type { Metadata } from "next";
import { Users } from "lucide-react";
import PageHero from "@/components/ui/PageHero";
import { getSoldiers } from "@/lib/soldiers";
import SoldiersClient from "./SoldiersClient";

const DESCRIPTION =
  "La gente detrás de los proyectos de La Crypta Dev — builders que armaron, presentaron y ganaron en cada hackatón.";

export const metadata: Metadata = {
  title: "Soldados",
  description: DESCRIPTION,
  alternates: { canonical: "/soldados" },
  openGraph: {
    title: "Soldados · La Crypta Dev",
    description: DESCRIPTION,
    url: "/soldados",
    type: "website",
  },
  twitter: {
    // Page-level `twitter` replaces the layout's object wholesale, so `card`
    // has to be restated or it silently degrades to the small "summary" card.
    card: "summary_large_image",
    title: "Soldados · La Crypta Dev",
    description: DESCRIPTION,
  },
};

export default async function SoldiersPage() {
  const soldiers = await getSoldiers();
  return (
    <>
      <PageHero
        eyebrow="LA COMUNIDAD QUE CONSTRUYE"
        eyebrowIcon={<Users className="h-3 w-3" />}
        title={
          <span className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-gradient-hero animate-gradient-x">
            Soldados.
          </span>
        }
        description="Builders, devs y diseñadores que armaron, presentaron y ganaron en cada hackatón. Curados de los proyectos oficiales y de la red Nostr."
      />
      <SoldiersClient soldiers={soldiers} />
    </>
  );
}
