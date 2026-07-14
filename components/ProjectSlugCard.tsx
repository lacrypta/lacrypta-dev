"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Loader2, Pencil, AlertTriangle, X } from "lucide-react";
import type { Auth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { slugifyProjectName } from "@/lib/projectIdentity";
import { projectSlugHref } from "@/lib/projectLinks";
import {
  checkSlugAvailability,
  requestProjectSlug,
  type SlugAvailability,
} from "@/lib/projectRegistryClient";
import { publishSignedEventsToRelays } from "@/lib/hackathonBadgeClient";

/**
 * Owner-only card to register (or change) the project's canonical URL slug.
 * Prefills a suggestion from the project name, checks availability live, then
 * signs → posts → republishes the La-Crypta-signed registry event and navigates
 * to the new canonical URL.
 */
export default function ProjectSlugCard({
  auth,
  projectId,
  projectName,
  currentSlug,
  relays,
  onRegistered,
}: {
  auth: Auth | null;
  projectId: string;
  projectName: string;
  /** Canonical slug when the project is already registered. */
  currentSlug?: string;
  relays: string[];
  onRegistered: (slug: string) => void;
}) {
  const { push: pushToast } = useToast();
  const suggestion = useMemo(
    () => slugifyProjectName(projectName) || projectId,
    [projectName, projectId],
  );
  const [editing, setEditing] = useState(!currentSlug);
  const [value, setValue] = useState(currentSlug ?? suggestion);
  const [availability, setAvailability] = useState<SlugAvailability | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Debounced availability check whenever the input changes (while editing).
  useEffect(() => {
    if (!editing) return;
    const slug = value.trim().toLowerCase();
    if (!slug) {
      setAvailability(null);
      return;
    }
    setChecking(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const result = await checkSlugAvailability(slug, projectId, ctrl.signal);
        setAvailability(result);
      } catch {
        /* aborted or offline — leave the last state */
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [value, editing, projectId]);

  const normalized = value.trim().toLowerCase();
  const isCurrent = !!currentSlug && normalized === currentSlug.toLowerCase();
  const canSubmit =
    !submitting &&
    !checking &&
    !!availability?.available &&
    normalized.length >= 2 &&
    !isCurrent;

  async function submit() {
    if (!auth) {
      pushToast({ kind: "error", title: "Iniciá sesión para registrar la URL." });
      return;
    }
    setSubmitting(true);
    // Declared outside the try so the bunker/NIP-46 signer (a live WebSocket
    // connection) is torn down on EVERY exit path, not just success.
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({
            kind: "info",
            title: "Autorizá la firma en tu bunker",
            description: url,
            duration: 20000,
          });
          try {
            window.open(url, "_blank", "noopener,noreferrer");
          } catch {
            /* popup blocked */
          }
        },
      });
      const result = await requestProjectSlug(signer, {
        projectId,
        slug: normalized,
      });
      // Republish the La-Crypta-signed registry event from the browser too.
      await publishSignedEventsToRelays([result.event], relays);
      pushToast({
        kind: "success",
        title: "URL registrada",
        description: projectSlugHref(result.slug),
      });
      onRegistered(result.slug);
    } catch (e) {
      pushToast({
        kind: "error",
        title: "No se pudo registrar la URL",
        description: e instanceof Error ? e.message : String(e),
        duration: 10000,
      });
    } finally {
      signer?.close?.().catch(() => {});
      setSubmitting(false);
    }
  }

  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl border border-border bg-background-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-nostr" />
        <h2 className="text-xs font-mono uppercase tracking-widest text-foreground-muted font-bold">
          URL del proyecto
        </h2>
      </div>

      {currentSlug && !editing ? (
        <div className="space-y-2">
          <p className="break-all rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs font-mono text-foreground">
            lacrypta.dev{projectSlugHref(currentSlug)}
          </p>
          <button
            type="button"
            onClick={() => {
              setValue(currentSlug);
              setEditing(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:border-nostr/40 hover:text-nostr"
          >
            <Pencil className="h-3.5 w-3.5" />
            Cambiar URL
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center overflow-hidden rounded-lg border border-border bg-white/[0.03] focus-within:border-nostr/50">
            <span className="shrink-0 pl-3 text-xs font-mono text-foreground-subtle">
              /projects/
            </span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) =>
                setValue(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
                    .replace(/-{2,}/g, "-"),
                )
              }
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={suggestion}
              className="w-full bg-transparent px-1 py-2 text-xs font-mono text-foreground outline-none"
            />
            <span className="shrink-0 pr-3">
              {checking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground-subtle" />
              ) : isCurrent ? (
                <Check className="h-3.5 w-3.5 text-foreground-subtle" />
              ) : availability?.available ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : availability && !availability.available ? (
                <X className="h-3.5 w-3.5 text-danger" />
              ) : null}
            </span>
          </label>

          {availability?.reason && (
            <p
              className={cn(
                "flex items-center gap-1.5 text-[11px]",
                availability.available
                  ? "text-foreground-muted"
                  : "text-danger",
              )}
            >
              {!availability.available && (
                <AlertTriangle className="h-3 w-3 shrink-0" />
              )}
              {availability.reason}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-nostr/30 bg-nostr/10 px-3 py-2 text-xs font-semibold text-nostr transition-colors enabled:hover:bg-nostr/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Registrando…
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5" />
                  {currentSlug ? "Guardar URL" : "Registrar URL"}
                </>
              )}
            </button>
            {currentSlug && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setValue(currentSlug);
                }}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:bg-white/5 hover:text-foreground"
              >
                Cancelar
              </button>
            )}
          </div>
          <p className="text-[10px] text-foreground-subtle">
            La firma la hace La Crypta. Vos publicás el registro con tu firma
            para propagarlo en los relays.
          </p>
        </div>
      )}
    </div>
  );
}
