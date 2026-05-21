import { getNostrProject } from "@/lib/nostrCache";
import { getHackathon } from "@/lib/hackathons";
import { breadcrumbLd, jsonLdScript } from "@/lib/jsonld";
import NostrProjectPageClient from "./NostrProjectPageClient";

/**
 * Server wrapper around the Nostr-only project page. Pre-fetches the
 * project from cached relay data so crawlers see real content (name,
 * description, team, links) in the SSR HTML — not a loading skeleton.
 *
 * The interactive UI (edit, archive, auth-gated actions, live
 * revalidation, author avatars) is owned by NostrProjectPageClient,
 * which still hydrates and runs as before.
 *
 * If the project isn't in the cached snapshot yet (e.g. just-submitted
 * project, cache TTL hasn't expired), don't 404 — fall through to the
 * client component which queries relays live. SEO content is skipped
 * for those cases until the cache catches up.
 */
export default async function NostrProjectServer({
  hackathonId,
  projectId,
}: {
  hackathonId: string;
  projectId: string;
}) {
  const project = await getNostrProject(hackathonId, projectId);
  if (!project) {
    return (
      <NostrProjectPageClient
        hackathonId={hackathonId}
        projectId={projectId}
      />
    );
  }

  const hackathon = getHackathon(hackathonId);
  const url = `https://lacrypta.dev/hackathons/${hackathonId}/${projectId}`;

  const projectLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: project.name,
    description: project.description,
    url,
    image: project.cover ?? project.logo ?? `${url}/opengraph-image`,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    codeRepository: project.repo,
    inLanguage: "es",
    isPartOf: hackathon
      ? {
          "@type": "Event",
          name: `${hackathon.name} — Hackatón #${hackathon.number}`,
          url: `https://lacrypta.dev/hackathons/${hackathon.id}`,
        }
      : undefined,
    author: project.team.map((m) => ({
      "@type": "Person",
      name: m.name || m.nip05 || "Anonymous",
      url: m.github ? `https://github.com/${m.github}` : undefined,
    })),
    publisher: { "@id": "https://lacrypta.dev/#organization" },
    keywords: project.tech?.join(", "),
  };

  return (
    <>
      {jsonLdScript(projectLd, "ld-project")}
      {jsonLdScript(
        breadcrumbLd([
          { name: "Inicio", url: "https://lacrypta.dev" },
          { name: "Hackatones", url: "https://lacrypta.dev/hackathons" },
          ...(hackathon
            ? [
                {
                  name: hackathon.name,
                  url: `https://lacrypta.dev/hackathons/${hackathon.id}`,
                },
              ]
            : []),
          { name: project.name, url },
        ]),
        "ld-breadcrumbs",
      )}

      <div className="sr-only">
        <h1>{project.name}</h1>
        <p>{project.description}</p>
        {hackathon && (
          <p>
            Proyecto presentado en {hackathon.name} — Hackatón #{hackathon.number}{" "}
            ({hackathon.month} {hackathon.year}).
          </p>
        )}
        <p>Estado: {project.status}.</p>
        {project.team.length > 0 && (
          <>
            <h2>Equipo</h2>
            <ul>
              {project.team.map((m) => (
                <li key={`${m.name}-${m.role}`}>
                  {m.name} — {m.role}
                  {m.github ? ` (github.com/${m.github})` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
        {(project.repo || project.demo) && (
          <ul>
            {project.repo && (
              <li>
                Repositorio: <a href={project.repo}>{project.repo}</a>
              </li>
            )}
            {project.demo && (
              <li>
                Demo: <a href={project.demo}>{project.demo}</a>
              </li>
            )}
          </ul>
        )}
        {project.tech && project.tech.length > 0 && (
          <p>Stack: {project.tech.join(", ")}.</p>
        )}
      </div>

      <NostrProjectPageClient
        hackathonId={hackathonId}
        projectId={projectId}
      />
    </>
  );
}
