export const NOSTR_PROJECTS_TAG = "nostr:projects";
export const NOSTR_LEGACY_SUBMISSIONS_TAG = "nostr:hackathon-submissions";
export const NOSTR_SOLDIERS_RANKING_TAG = "nostr:soldiers-ranking";

export function nostrProfileTag(pubkey: string) {
  return `nostr:profile:${pubkey}`;
}

export function nostrRelayListTag(pubkey: string) {
  return `nostr:relay-list:${pubkey}`;
}

export function nostrBadgesTag(pubkey: string) {
  return `nostr:badges:${pubkey}`;
}

export function nostrReportsTag(hackathonId: string) {
  return `nostr:reports:${hackathonId}`;
}

export function nostrHackathonBadgesTag(hackathonId: string) {
  return `nostr:hackathon-badges:${hackathonId}`;
}

export function nostrHackathonBadgeDefinitionTag(aTag: string) {
  return `nostr:hackathon-badge-definition:${aTag}`;
}

export function nostrHackathonBadgeOwnersTag(aTag: string) {
  return `nostr:hackathon-badge-owners:${aTag}`;
}
