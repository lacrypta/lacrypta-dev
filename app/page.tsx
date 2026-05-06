import HomeScroll from "@/components/sections/HomeScroll";
import HomeBenefits from "@/components/sections/HomeBenefits";
import NewsletterCTA from "@/components/sections/NewsletterCTA";

export default function Home() {
  return (
    <>
      <h1 className="sr-only">
        La Crypta Dev — Bitcoin, Lightning y Nostr en Argentina
      </h1>
      <HomeBenefits />
      <HomeScroll />
      <NewsletterCTA />
    </>
  );
}
