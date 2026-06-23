import { Suspense } from "react";
import HomeScroll from "@/components/sections/HomeScroll";
import HomeBenefits from "@/components/sections/HomeBenefits";
import NewsletterCTA from "@/components/sections/NewsletterCTA";
import GamingHackathonBanner from "@/components/sections/GamingHackathonBanner";
import VotingHero from "@/components/voting/VotingHero";
import { getHackathon } from "@/lib/hackathons";
import { getCachedVotingPeriod } from "@/lib/votingCache";
import { nostrVotingTag } from "@/lib/nostrCacheTags";
import { cacheTag } from "next/cache";

// The home banner features the GAMING hackathon — surface its live community
// voting here too. Server-fetched (cached, revalidated by the voting tag); the
// hero then live-subscribes on the client.
async function HomeVotingHero() {
  "use cache";
  const gaming = getHackathon("gaming");
  if (!gaming) return null;
  cacheTag(nostrVotingTag(gaming.id));
  const period = await getCachedVotingPeriod(gaming.id);
  if (!period) return null;
  return (
    <div className="pt-24 sm:pt-28">
      <VotingHero
        hackathonId={gaming.id}
        hackathonName={gaming.name}
        initialPeriod={period}
        variant="home"
      />
    </div>
  );
}

export default function Home() {
  return (
    <>
      <h1 className="sr-only">
        La Crypta Dev — Bitcoin, Lightning y Nostr en Argentina
      </h1>
      <Suspense fallback={null}>
        <HomeVotingHero />
      </Suspense>
      <GamingHackathonBanner />
      <HomeBenefits />
      <HomeScroll />
      <NewsletterCTA />
    </>
  );
}
