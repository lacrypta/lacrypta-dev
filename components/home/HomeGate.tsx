"use client";

import { useAuth } from "@/lib/auth";
import dynamic from "next/dynamic";

const HomeDashboard = dynamic(() => import("@/components/home/HomeDashboard"));

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
