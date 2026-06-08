import type { Metadata } from "next";
import { Suspense } from "react";
import OnboardingClient from "./OnboardingClient";

export const metadata: Metadata = {
  title: "Creá tu perfil",
  description: "Elegí tu nombre, avatar y portada en La Crypta Dev.",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-6 pt-28 pb-16">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-background-card/80 p-6 text-center shadow-xl">
            <h1 className="font-display text-2xl font-bold">
              Preparando tu perfil…
            </h1>
          </div>
        </main>
      }
    >
      <OnboardingClient />
    </Suspense>
  );
}
