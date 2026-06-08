import { permanentRedirect } from "next/navigation";

export default function LegacyHackathonBadgesPage() {
  permanentRedirect("/badges");
}
