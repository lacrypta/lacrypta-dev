import type { Metadata } from "next";
import PageHero from "@/components/ui/PageHero";
import ServicesGrid from "./ServicesGrid";
import { getLightningNodeStats } from "@/lib/lightningNode";
import { getInfraStatus } from "@/lib/infraStatus";

export const metadata: Metadata = {
  title: "Infraestructura",
  description:
    "Infraestructura pública operada por La Crypta Dev — nodo Lightning, relay Nostr, servidor Blossom y LaWallet Stack.",
};

export default async function InfrastructurePage() {
  const [lightningStats, infraStatus] = await Promise.all([
    getLightningNodeStats(),
    getInfraStatus(),
  ]);

  return (
    <>
      <PageHero title="Infra pública" />

      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ServicesGrid
            lightningStats={lightningStats}
            infraStatus={infraStatus}
          />
        </div>
      </section>
    </>
  );
}
