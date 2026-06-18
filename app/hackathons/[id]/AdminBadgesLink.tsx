"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function AdminBadgesLink() {
  const { auth } = useAuth();
  const [adminPubkey, setAdminPubkey] = useState<string | null>(null);

  useEffect(() => {
    if (!auth?.pubkey) {
      setAdminPubkey(null);
      return;
    }
    let cancelled = false;
    fetch("/api/lacrypta-pubkeys")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { adminPubkey?: string } | null) => {
        if (!cancelled) setAdminPubkey(data?.adminPubkey ?? null);
      })
      .catch(() => {
        if (!cancelled) setAdminPubkey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [auth?.pubkey]);

  const isAdmin = !!auth?.pubkey && !!adminPubkey && auth.pubkey === adminPubkey;
  if (!isAdmin) return null;

  return (
    <div className="mt-4">
      <Link
        href="/badges"
        className="inline-flex items-center gap-2 rounded-xl border border-bitcoin/30 bg-bitcoin/10 px-4 py-2 text-sm font-semibold text-bitcoin transition-colors hover:bg-bitcoin/15"
      >
        <Award className="h-4 w-4" />
        Ver badges
      </Link>
    </div>
  );
}
