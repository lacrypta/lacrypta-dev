/** Internal deep-link builders shared by notification sources. */
import { hackathonSlugForId } from "../hackathons";
import { curatedProjectHref } from "../projectLinks";

export function hackathonHref(hackathonId: string): string {
  return `/hackathons/${hackathonSlugForId(hackathonId)}`;
}

export function projectHref(projectId: string): string {
  return curatedProjectHref(projectId);
}
