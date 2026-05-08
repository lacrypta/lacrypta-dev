import type { Metadata } from "next";
import { Users } from "lucide-react";
import PageHero from "@/components/ui/PageHero";
import { getSoldados } from "@/lib/soldados";
import SoldadosClient from "./SoldadosClient";

export const metadata: Metadata = {
  title: "Soldados",
  description:
    "La gente detrás de los proyectos de La Crypta Dev — builders que armaron, presentaron y ganaron en cada hackatón.",
};

export default async function SoldadosPage() {
  const soldados = await getSoldados();
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
      <SoldadosClient soldados={soldados} />
    </>
  );
}
