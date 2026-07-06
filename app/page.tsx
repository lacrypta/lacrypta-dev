import { Suspense } from "react";
import HomeScroll from "@/components/sections/HomeScroll";
import HomeBenefits from "@/components/sections/HomeBenefits";
import NewsletterCTA from "@/components/sections/NewsletterCTA";
import GamingHackathonBanner from "@/components/sections/GamingHackathonBanner";
import HomeGate from "@/components/home/HomeGate";
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
    <VotingHero
      hackathonId={gaming.id}
      hackathonName={gaming.name}
      initialPeriod={period}
      variant="home"
    />
  );
}

export default function Home() {
  // Logged-out visitors and crawlers get the marketing home (SSR, indexable).
  // Logged-in users see a personalized dashboard, swapped in client-side by
  // HomeGate once auth is known — see components/home/HomeGate.tsx.
  return (
    <HomeGate>
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
    </HomeGate>
  );
}
