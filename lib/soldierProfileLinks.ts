export type SoldierProfileMember = {
  name?: string;
  github?: string;
  pubkey?: string;
  nip05?: string;
};

function clean(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanGithub(value?: string): string | undefined {
  return clean(value)?.replace(/^@+/, "").toLowerCase();
}

export function slugifySoldierName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function soldierProfileSlug(member: SoldierProfileMember): string | null {
  const github = cleanGithub(member.github);
  if (github) return `gh-${github}`;

  const pubkey = clean(member.pubkey)?.toLowerCase();
  if (pubkey) return `pk-${pubkey}`;

  const nip05 = clean(member.nip05)?.toLowerCase();
  if (nip05) return `nip05-${nip05}`;

  const nameSlug = member.name ? slugifySoldierName(member.name) : "";
  if (nameSlug) return `name-${nameSlug}`;

  return null;
}

export function soldierProfileSlugAliases(
  member: SoldierProfileMember,
): string[] {
  const aliases: string[] = [];
  const push = (slug: string | null | undefined) => {
    if (slug && !aliases.includes(slug)) aliases.push(slug);
  };

  push(soldierProfileSlug(member));

  const github = cleanGithub(member.github);
  if (github) push(`gh-${github}`);

  const pubkey = clean(member.pubkey)?.toLowerCase();
  if (pubkey) push(`pk-${pubkey}`);

  const nip05 = clean(member.nip05)?.toLowerCase();
  if (nip05) push(`nip05-${nip05}`);

  const nameSlug = member.name ? slugifySoldierName(member.name) : "";
  if (nameSlug) {
    push(`name-${nameSlug}`);
    push(`gh-${nameSlug}`);
  }

  return aliases;
}

export function soldierProfileHref(
  member: SoldierProfileMember,
): string | null {
  const slug = soldierProfileSlug(member);
  return slug ? `/soldados/${encodeURIComponent(slug)}` : null;
}
