"use client";

import { useAuth } from "@/lib/auth";
import dynamic from "next/dynamic";

// `ssr: false` is what gives this its own Suspense boundary — `next/dynamic`
// only wraps the lazy component when `ssr` is false or a `loading` is passed
// (see next/dist/shared/lib/lazy-dynamic/loadable.js). Without it the lazy
// suspends with no boundary, and because `setAuth` dispatches its change event
// synchronously, that suspension lands in the same batch as the login modal's
// own `onClose()` — which then never commits, leaving the modal stuck over an
// already-logged-in app. Rendering it client-only is honest anyway: the branch
// below is unreachable on the server, where `auth` is always null.
const HomeDashboard = dynamic(
  () => import("@/components/home/HomeDashboard"),
  { ssr: false },
);

/**
 * Home page auth gate.
 *
 * The marketing home is the server-rendered default (`children`) so crawlers
 * and logged-out visitors get the full, indexable page. Auth lives only in
 * localStorage, so it's unknown during SSR and the first client render — we
 * keep rendering `children` until `useAuth` reports `ready && auth`, at which
 * point we swap to the personalized dashboard entirely on the client. Because
 * the server and first client render both show `children`, there's no
 * hydration mismatch.
 *
 * `dashboardVoting` is the server-rendered live-voting hero for the dashboard
 * branch (the marketing branch carries its own copy inside `children`, SSR'd
 * for crawlers). Both branches show it — voters are logged in.
 */
export default function HomeGate({
  children,
  dashboardVoting,
}: {
  children: React.ReactNode;
  dashboardVoting: React.ReactNode;
}) {
  const { auth, ready } = useAuth();
  if (ready && auth) {
    return <HomeDashboard voting={dashboardVoting} />;
  }
  return <>{children}</>;
}
