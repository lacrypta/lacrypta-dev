import { Suspense } from "react";
import HomeScroll from "@/components/sections/HomeScroll";
import HomeBenefits from "@/components/sections/HomeBenefits";
import NewsletterCTA from "@/components/sections/NewsletterCTA";
import GamingHackathonBanner from "@/components/sections/GamingHackathonBanner";
import HomeGate from "@/components/home/HomeGate";
import VotingHero from "@/components/voting/VotingHero";
import { HACKATHONS } from "@/lib/hackathons";
import { getCachedVotingPeriod } from "@/lib/votingCache";
import { nostrVotingTag } from "@/lib/nostrCacheTags";
import { cacheLife, cacheTag } from "next/cache";

/**
 * Keep one VotingHero per hackathon that actually has a period to show.
 * Empty heroes still opened relay sockets (and logged Damus 503s) on every
 * visit; mounting them "just in case voting opens" is not worth the LCP/TBT.
 */
async function HomeVotingHeroes({
  placement = "page-top",
}: {
  placement?: "page-top" | "inline";
}) {
  "use cache";
  cacheLife("nostr");

  for (const hackathon of HACKATHONS) {
    cacheTag(nostrVotingTag(hackathon.id));
  }

  const entries = await Promise.all(
    HACKATHONS.map(async (hackathon) => ({
      hackathon,
      period: await getCachedVotingPeriod(hackathon.id),
    })),
  );
  const hasOpenVoting = entries.some(
    ({ period }) => period?.status === "open",
  );
  const latestClosedHackathonId = entries
    .filter(({ period }) => period?.status === "closed")
    .sort(
      (a, b) =>
        (b.period?.closedAt ?? b.period?.openedAt ?? 0) -
        (a.period?.closedAt ?? a.period?.openedAt ?? 0),
    )[0]?.hackathon.id;

  return (
    <>
      {entries
        .filter(({ period, hackathon }) => {
          if (!period) return false;
          if (period.status === "open") return true;
          return (
            !hasOpenVoting && hackathon.id === latestClosedHackathonId
          );
        })
        .map(({ hackathon, period }) => (
          <VotingHero
            key={hackathon.id}
            hackathonId={hackathon.id}
            hackathonName={hackathon.name}
            initialPeriod={period}
            variant="home"
            homePlacement={placement}
            showClosedResults={
              period?.status === "open" ||
              (!hasOpenVoting && hackathon.id === latestClosedHackathonId)
            }
          />
        ))}
    </>
  );
}

export default function Home() {
  // Logged-out visitors and crawlers get the marketing home (SSR, indexable).
  // Logged-in users see a personalized dashboard, swapped in client-side by
  // HomeGate once auth is known — see components/home/HomeGate.tsx. The voting
  // hero belongs on both: the people with votes to spend are logged in.
  return (
    <HomeGate
      dashboardVoting={
        <Suspense fallback={null}>
          <HomeVotingHeroes placement="inline" />
        </Suspense>
      }
    >
      <h1 className="sr-only">
        La Crypta Dev — Bitcoin, Lightning y Nostr en Argentina
      </h1>
      <Suspense fallback={null}>
        <HomeVotingHeroes />
      </Suspense>
      <GamingHackathonBanner />
      <HomeBenefits />
      <HomeScroll />
      <NewsletterCTA />
    </HomeGate>
  );
}
