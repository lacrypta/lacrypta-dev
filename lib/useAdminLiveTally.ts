"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import type { VotingResults } from "@/lib/voting";

export type AdminLiveTally = {
  /** Decrypted live standings, or null until the admin loads them. */
  results: VotingResults | null;
  /** A fetch/sign round-trip is in flight. */
  loading: boolean;
  error: string | null;
  /** Sign a `close-preview` request and fetch the current (decrypted) tally.
   *  Admin-gated server-side; decrypts with LACRYPTA_NSEC and PUBLISHES NOTHING. */
  refresh: () => Promise<void>;
};

/**
 * Live vote standings for the La Crypta admin while voting is still open.
 *
 * Ballots are NIP-44 encrypted, so the client can't tally them — only the
 * backend `close-preview` action decrypts and counts. It requires the admin to
 * sign a NIP-98 (kind 27235) request but never writes to any relay, so it's
 * safe to call repeatedly to peek at how the voting is going.
 */
export function useAdminLiveTally(hackathonId: string): AdminLiveTally {
  const { auth } = useAuth();
  const [results, setResults] = useState<VotingResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In-flight guard kept in a ref so `refresh` depends only on auth/hackathonId
  // (a stale `loading` closure would defeat the guard otherwise).
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!auth || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const signer = await getSigner(auth);
      const request = await signer.signEvent({
        kind: 27235,
        pubkey: signer.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        content: "close-preview · votación comunitaria",
        tags: [
          ["u", `/api/hackathons/${hackathonId}/voting`],
          ["method", "POST"],
          ["action", "close-preview"],
          ["h", hackathonId],
        ],
      });
      // No client ballot snapshot: let the server do its own authoritative
      // relay fetch (fetchBallotEvents) so a slow relay can't undercount the
      // preview. This is a read-only peek — unlike the real close it doesn't
      // need to freeze the exact ballot set.
      const res = await fetch(`/api/hackathons/${hackathonId}/voting`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        preview?: { tally: VotingResults };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.preview) {
        throw new Error(data.error || "No se pudo obtener la votación actual.");
      }
      setResults(data.preview.tally);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [auth, hackathonId]);

  return { results, loading, error, refresh };
}
