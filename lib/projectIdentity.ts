type ProjectIdentity = {
  eventId?: string;
  id: string;
  name?: string;
};

export function slugifyProjectName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function projectMatchesIdentifier(
  project: ProjectIdentity,
  identifier: string,
): boolean {
  const key = identifier.trim();
  if (!key) return false;
  if (project.id === key) return true;
  if (project.eventId === key) return true;
  return project.name ? slugifyProjectName(project.name) === key : false;
}
