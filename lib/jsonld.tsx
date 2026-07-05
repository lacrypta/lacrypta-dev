import type { Hackathon, HackathonProject } from "./hackathons";
import { hackathonSlug } from "./hackathons";
import { dedupeSoldierProfileMembers } from "./soldierProfileLinks";
import { SITE_URL } from "./siteUrl";

const BASE_URL = SITE_URL;
const ORG_ID = `${BASE_URL}/#organization`;

type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [k: string]: JsonLdValue | undefined };

export function organizationLd(): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "La Crypta Dev",
    alternateName: "La Crypta",
    url: BASE_URL,
    logo: `${BASE_URL}/lacrypta-logo.svg`,
    description:
      "Investigación, prototipos y productos open source de la comunidad La Crypta sobre Bitcoin, Lightning y Nostr.",
    sameAs: [
      "https://www.youtube.com/@LaCryptaOk",
      "https://github.com/lacrypta",
    ],
  };
}

function eventStartDate(h: Hackathon): string | undefined {
  return h.dates[0]?.date;
}

function eventEndDate(h: Hackathon): string | undefined {
  return h.dates[h.dates.length - 1]?.date;
}

export function eventLd(h: Hackathon): JsonLdValue {
  const url = `${BASE_URL}/hackathons/${hackathonSlug(h)}`;
  const start = eventStartDate(h);
  const end = eventEndDate(h);

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: `${h.name} — Hackatón #${h.number}`,
    description: `${h.focus}. ${h.description}`,
    startDate: start,
    endDate: end,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    url,
    image: `${url}/opengraph-image`,
    location: {
      "@type": "VirtualLocation",
      url,
    },
    organizer: { "@id": ORG_ID },
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "USD",
      url,
      availability: "https://schema.org/InStock",
      validFrom: start,
    },
    inLanguage: "es",
    keywords: [...h.tags, ...h.topics, "Hackatón", "La Crypta", "Bitcoin"].join(
      ", ",
    ),
  };
}

export function creativeWorkLd(
  project: HackathonProject,
  hackathon: Hackathon | null,
  /** Canonical page path, e.g. `/projects/<slug>`. */
  canonicalPath?: string,
): JsonLdValue {
  const url = `${BASE_URL}${
    canonicalPath ?? `/projects/${project.slug ?? project.id.toLowerCase()}`
  }`;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: project.name,
    description: project.description,
    url,
    image: `${url}/opengraph-image`,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    codeRepository: project.repo,
    inLanguage: "es",
    isPartOf: hackathon
      ? {
          "@type": "Event",
          name: `${hackathon.name} — Hackatón #${hackathon.number}`,
          url: `${BASE_URL}/hackathons/${hackathonSlug(hackathon)}`,
        }
      : undefined,
    author: dedupeSoldierProfileMembers(project.team).map((m) => ({
      "@type": "Person",
      name: m.name || m.nip05 || "Anonymous",
      url: m.github ? `https://github.com/${m.github}` : undefined,
    })),
    publisher: { "@id": ORG_ID },
    keywords: project.tech?.join(", "),
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "USD",
    },
  };
}

export type Crumb = { name: string; url: string };

export function breadcrumbLd(crumbs: Crumb[]): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

/**
 * Renders one or more JSON-LD scripts. Use spread to inline directly:
 *   <head>{...renderJsonLd([organizationLd(), eventLd(h)])}</head>
 */
export function jsonLdScript(value: JsonLdValue, key?: string) {
  // schema.org JSON-LD: escape `<` to neutralise `</script>` injection.
  const html = JSON.stringify(value).replace(/</g, "\\u003c");
  return (
    <script
      key={key}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
