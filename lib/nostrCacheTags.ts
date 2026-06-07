export const NOSTR_PROJECTS_TAG = "nostr:projects";
export const NOSTR_LEGACY_SUBMISSIONS_TAG = "nostr:hackathon-submissions";

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
