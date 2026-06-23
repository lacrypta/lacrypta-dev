import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isVotingTestNamespace } from "@/lib/voting";
import DevVotingClient from "./DevVotingClient";

export const metadata: Metadata = {
  title: "Dev · Votación",
  robots: { index: false, follow: false },
};

/**
 * Dev-only harness to exercise the community voting flow end to end: generate
 * throwaway identities, act as admin (open/close) and as several voters, and
 * watch the live tally — all against the `lacrypta.dev:test:` d-tag namespace
 * so production voting data is never touched. 404s in production builds.
 */
export default function DevVotingPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="relative pt-28 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Laboratorio de votación
        </h1>
        <p className="mt-2 text-sm text-foreground-muted max-w-2xl">
          Entorno de prueba para la votación comunitaria. Generá identidades
          descartables, usalas como admin o votantes y probá el flujo completo
          sin tocar datos de producción.
        </p>
        {!isVotingTestNamespace() && (
          <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            <strong>⚠ Namespace de producción.</strong> Agregá{" "}
            <code className="font-mono">NEXT_PUBLIC_VOTING_NS=test</code> a tu{" "}
            <code className="font-mono">.env.local</code> y reiniciá el server —
            si no, los eventos de prueba van al namespace real.
          </div>
        )}
        <DevVotingClient testNamespace={isVotingTestNamespace()} />
      </div>
    </div>
  );
}
