import { Suspense } from "react";
import HomeScroll from "@/components/sections/HomeScroll";
import HomeBenefits from "@/components/sections/HomeBenefits";
import NewsletterCTA from "@/components/sections/NewsletterCTA";
import GamingHackathonBanner from "@/components/sections/GamingHackathonBanner";
import HomeGate from "@/components/home/HomeGate";
import VotingHero from "@/components/voting/VotingHero";
import { getFeaturedVotingRound } from "@/lib/votingCache";
import { cacheLife } from "next/cache";

// The home page surfaces the community voting round that's live right now —
// resolved from the relays (never pinned to a hackathon id, which goes stale the
// moment the next round opens). Server-fetched and cached; `getFeaturedVotingRound`
// registers the voting tags so open/close revalidations refresh this. The hero
// then live-subscribes on the client.
async function HomeVotingHero({ inline = false }: { inline?: boolean }) {
  "use cache";
  cacheLife("nostr");
  const featured = await getFeaturedVotingRound();
  if (!featured) return null;
  return (
    <VotingHero
      hackathonId={featured.hackathon.id}
      hackathonName={featured.hackathon.name}
      // The dashboard copy only ever renders on the client (HomeGate swaps it in
      // once auth resolves) and `useVotingLive` re-reads the period on mount —
      // shipping the SSR snapshot twice would be dead payload.
      initialPeriod={inline ? null : featured.period}
      variant="home"
      inline={inline}
    />
  );
}

export default function Home() {
  // Logged-out visitors and crawlers get the marketing home (SSR, indexable).
  // Logged-in users see a personalized dashboard, swapped in client-side by
  // HomeGate once auth is known — see components/home/HomeGate.tsx. The voting
  // hero belongs on both: the people with votes to spend are logged in.
  return (
    <HomeGate
      votingHero={
        <Suspense fallback={null}>
          <HomeVotingHero inline />
        </Suspense>
      }
    >
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
