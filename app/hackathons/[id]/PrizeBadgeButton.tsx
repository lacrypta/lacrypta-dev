"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/Toast";
import type { HackathonBadgeCatalogBadge } from "@/lib/hackathonBadges";
import {
  fetchHackathonBadgeAwardOwners,
  publishSignedEventsToRelays,
  refreshHackathonBadgeCache,
  requestBadgeAward,
  type BadgeAwardRecipient,
} from "@/lib/hackathonBadgeClient";

export type PrizeBadgeTask = {
  badge: HackathonBadgeCatalogBadge;
  awarded: boolean;
};

type PrizeBadgeButtonProps = {
  hackathonId: string;
  projectName: string;
  issuerPubkey: string;
  recipient: BadgeAwardRecipient;
  tasks: PrizeBadgeTask[];
};

type Phase = "idle" | "checking" | "signing" | "publishing" | "done" | "error";

export default function PrizeBadgeButton({
  hackathonId,
  projectName,
  issuerPubkey,
  recipient,
  tasks,
}: PrizeBadgeButtonProps) {
  const router = useRouter();
  const { auth, signerReady } = useAuth();
  const { push } = useToast();
  const [adminPubkey, setAdminPubkey] = useState<string | null>(null);
  const [pending, setPending] = useState(() =>
    tasks.filter((task) => !task.awarded).map((task) => task.badge),
  );
  const [phase, setPhase] = useState<Phase>("idle");

  const done = pending.length === 0;
  const busy = ["checking", "signing", "publishing"].includes(phase);
  const isAdmin = !!auth?.pubkey && !!adminPubkey && auth.pubkey === adminPubkey;

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const initialPending = tasks
      .filter((task) => !task.awarded)
      .map((task) => task.badge);
    if (initialPending.length === 0) return;
    let cancelled = false;
    setPhase("checking");
    readPendingFromNostr(initialPending, false)
      .then((nextPending) => {
        if (cancelled) return;
        setPending(nextPending);
        setPhase("idle");
      })
      .catch(() => {
        if (!cancelled) setPhase("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [hackathonId, issuerPubkey, recipient.pubkey, tasks]);

  const label = useMemo(() => {
    if (done) return "Badge entregado";
    if (phase === "checking") return "Verificando";
    if (phase === "signing") return "Firmando";
    if (phase === "publishing") return "Publicando";
    return pending.length === 1 ? "Entregar badge" : `Entregar ${pending.length} badges`;
  }, [done, pending.length, phase]);

  if (!auth || !isAdmin) return null;

  async function readPendingFromNostr(
    badges: HackathonBadgeCatalogBadge[],
    revalidate: boolean,
  ) {
    if (badges.length === 0) return [];
    const aTags = badges.map((badge) => badge.definition);
    if (revalidate) {
      await refreshHackathonBadgeCache({
        hackathonId,
        aTags,
        issuerPubkey,
        owners: true,
      });
    }
    const ownerResults = await Promise.all(
      badges.map(async (badge) => ({
        badge,
        owners: await fetchHackathonBadgeAwardOwners(
          badge.definition,
          issuerPubkey,
        ),
      })),
    );
    const nextPending = ownerResults
      .filter(({ owners }) => !owners.some((owner) => owner.pubkey === recipient.pubkey))
      .map(({ badge }) => badge);
    return nextPending;
  }

  async function refreshPendingFromNostr() {
    const nextPending = await readPendingFromNostr(pending, true);
    setPending(nextPending);
    return nextPending;
  }

  async function handleAward() {
    if (!auth || !isAdmin || !signerReady || busy || done) return;
    try {
      setPhase("checking");
      const verifiedPending = await refreshPendingFromNostr();
      if (verifiedPending.length === 0) {
        setPhase("done");
        router.refresh();
        return;
      }

      const signer = await getSigner(auth);
      const publishedATags: string[] = [];
      for (const badge of verifiedPending) {
        setPhase("signing");
        const result = await requestBadgeAward({
          hackathonId,
          signer,
          badge,
          recipients: [recipient],
        });
        setPhase("publishing");
        const relays = await publishSignedEventsToRelays(result.events);
        const ok = relays.filter((relay) => relay.ok).length;
        if (ok === 0) throw new Error("Ningun relay acepto el award del badge.");
        publishedATags.push(badge.definition);
      }

      await refreshHackathonBadgeCache({
        hackathonId,
        aTags: publishedATags,
        issuerPubkey,
        owners: true,
      });
      setPending([]);
      setPhase("done");
      push({
        kind: "success",
        title: "Badge entregado",
        description: `${projectName} ya tiene el reconocimiento en Nostr.`,
      });
      router.refresh();
    } catch (error) {
      setPhase("error");
      push({
        kind: "error",
        title: "No se pudo entregar el badge",
        description: error instanceof Error ? error.message : String(error),
        duration: 12000,
      });
    }
  }

  return (
    <button
      type="button"
      onClick={handleAward}
      disabled={done || busy || !signerReady || !isAdmin}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors",
        done
          ? "cursor-default border-success/30 bg-success/10 text-success"
          : "border-nostr/40 bg-nostr/10 text-nostr hover:bg-nostr/20",
        !done && (busy || !signerReady || !isAdmin) && "cursor-not-allowed opacity-70",
      )}
      title={
        done
          ? "El kind 8 de Nostr ya existe para este proyecto."
          : "Verifica Nostr y publica el award NIP-58 si falta."
      }
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : done ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Award className="h-3.5 w-3.5" />
      )}
      <span>{label}</span>
    </button>
  );
}
