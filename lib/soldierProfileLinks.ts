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

const CANONICAL_SOLDIER_SLUGS: Record<string, string> = {
  "gh-analiaacostaok":
    "pk-507fc20a0a9c6c661b4b3a600ef4f2545359fa0425689991f8edebae74c0dd02",
  "nip05-anix@hodl.ar":
    "pk-507fc20a0a9c6c661b4b3a600ef4f2545359fa0425689991f8edebae74c0dd02",
  "name-anix":
    "pk-507fc20a0a9c6c661b4b3a600ef4f2545359fa0425689991f8edebae74c0dd02",

  "gh-burgos247":
    "pk-afc8a6df0841909c981c7c5a5536e562cbd5ff5bb22beb8357f3f2798465e4dc",
  "nip05-burgos@primal.net":
    "pk-afc8a6df0841909c981c7c5a5536e562cbd5ff5bb22beb8357f3f2798465e4dc",
  "name-burgos":
    "pk-afc8a6df0841909c981c7c5a5536e562cbd5ff5bb22beb8357f3f2798465e4dc",

  "gh-fchurca":
    "pk-4330e5b786c7899c19f55316eaa579496f3907c09d6d048cb8c0ef3d3bd5b257",
  "nip05-fred@hodl.ar":
    "pk-4330e5b786c7899c19f55316eaa579496f3907c09d6d048cb8c0ef3d3bd5b257",
  "name-fred":
    "pk-4330e5b786c7899c19f55316eaa579496f3907c09d6d048cb8c0ef3d3bd5b257",

  "gh-warrior-lai":
    "pk-a78a391888c6a7a2e114ad66dc0e473b9f561734c7f098c9552b2e5bb840d26c",
  "name-abstract-lai":
    "pk-a78a391888c6a7a2e114ad66dc0e473b9f561734c7f098c9552b2e5bb840d26c",
  "name-lai":
    "pk-a78a391888c6a7a2e114ad66dc0e473b9f561734c7f098c9552b2e5bb840d26c",

  "gh-lalo1821":
    "pk-96709186f836c901525cac72773ece5e646efe72a26fbca2e73c49f9f5f91b7e",
  "name-lalo":
    "pk-96709186f836c901525cac72773ece5e646efe72a26fbca2e73c49f9f5f91b7e",
  "name-lalo1821":
    "pk-96709186f836c901525cac72773ece5e646efe72a26fbca2e73c49f9f5f91b7e",

  "gh-pizza-wder": "nip05-wder@bitbybit.com.ar",
  "name-wander": "nip05-wder@bitbybit.com.ar",
  "name-wder": "nip05-wder@bitbybit.com.ar",

  "gh-lo0ker-noma":
    "pk-51d31de55347780bb2aa36887142b46cb3e98eed2e5352adab5926168c307e90",
  "name-lo0ker-noma":
    "pk-51d31de55347780bb2aa36887142b46cb3e98eed2e5352adab5926168c307e90",
  "name-looker":
    "pk-51d31de55347780bb2aa36887142b46cb3e98eed2e5352adab5926168c307e90",

  "gh-negr087":
    "pk-20d29810d6a5f92b045ade02ebbadc9036d741cc686b00415c42b4236fe4ad2f",
  "nip05-negr0@hodl.ar":
    "pk-20d29810d6a5f92b045ade02ebbadc9036d741cc686b00415c42b4236fe4ad2f",
  "name-negr0":
    "pk-20d29810d6a5f92b045ade02ebbadc9036d741cc686b00415c42b4236fe4ad2f",

  "gh-landaverdend":
    "pk-f7672a4cc1bf23ebe9519f88e74b41aa4f648981bb1dbe918a2b00a9b1bc78de",
  "name-landaverdend":
    "pk-f7672a4cc1bf23ebe9519f88e74b41aa4f648981bb1dbe918a2b00a9b1bc78de",
  "name-nic-o":
    "pk-f7672a4cc1bf23ebe9519f88e74b41aa4f648981bb1dbe918a2b00a9b1bc78de",

  "gh-soyezequiel":
    "pk-7c45dcfb2e93594ce43bc2b16fd29b3c38ba0daf42ae8561fe6f0353892b7df4",
  "nip05-naranja@coinos.io":
    "pk-7c45dcfb2e93594ce43bc2b16fd29b3c38ba0daf42ae8561fe6f0353892b7df4",
  "name-naranja":
    "pk-7c45dcfb2e93594ce43bc2b16fd29b3c38ba0daf42ae8561fe6f0353892b7df4",

  "name-llopo": "gh-fabricio333",
  "name-fabricio": "gh-fabricio333",
};

function canonicalSlug(slug: string): string {
  return CANONICAL_SOLDIER_SLUGS[slug.toLowerCase()] ?? slug;
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
  if (github) return canonicalSlug(`gh-${github}`);

  const pubkey = clean(member.pubkey)?.toLowerCase();
  if (pubkey) return canonicalSlug(`pk-${pubkey}`);

  const nip05 = clean(member.nip05)?.toLowerCase();
  if (nip05) return canonicalSlug(`nip05-${nip05}`);

  const nameSlug = member.name ? slugifySoldierName(member.name) : "";
  if (nameSlug) return canonicalSlug(`name-${nameSlug}`);

  return null;
}

export function dedupeSoldierProfileMembers<T extends SoldierProfileMember>(
  members: T[],
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const member of members) {
    const slug = soldierProfileSlug(member);
    const github = cleanGithub(member.github);
    const pubkey = clean(member.pubkey)?.toLowerCase();
    const nip05 = clean(member.nip05)?.toLowerCase();
    const key =
      slug ??
      [
        member.name ? `name:${slugifySoldierName(member.name)}` : "",
        github ? `gh:${github}` : "",
        pubkey ? `pk:${pubkey}` : "",
        nip05 ? `nip05:${nip05}` : "",
      ]
        .filter(Boolean)
        .join("|");

    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(member);
  }

  return unique;
}

export function soldierProfileSlugAliases(
  member: SoldierProfileMember,
): string[] {
  const aliases: string[] = [];
  const push = (slug: string | null | undefined) => {
    if (slug && !aliases.includes(slug)) aliases.push(slug);
  };
  const pushAlias = (slug: string | null | undefined) => {
    if (!slug) return;
    push(slug);
    push(canonicalSlug(slug));
  };

  push(soldierProfileSlug(member));

  const github = cleanGithub(member.github);
  if (github) pushAlias(`gh-${github}`);

  const pubkey = clean(member.pubkey)?.toLowerCase();
  if (pubkey) pushAlias(`pk-${pubkey}`);

  const nip05 = clean(member.nip05)?.toLowerCase();
  if (nip05) pushAlias(`nip05-${nip05}`);

  const nameSlug = member.name ? slugifySoldierName(member.name) : "";
  if (nameSlug) {
    pushAlias(`name-${nameSlug}`);
    pushAlias(`gh-${nameSlug}`);
  }

  return aliases;
}

export function soldierProfileHref(
  member: SoldierProfileMember,
): string | null {
  const slug = soldierProfileSlug(member);
  return slug ? `/soldados/${encodeURIComponent(slug)}` : null;
}
