import { Suspense } from "react";
import EmailLoginClient from "./EmailLoginClient";

export default function EmailLoginPage() {
  return (
    <Suspense fallback={<EmailLoginShell title="Validando enlace..." />}>
      <EmailLoginClient />
    </Suspense>
  );
}

export function EmailLoginShell({
  title,
  message = "Un momento, estamos preparando tu sesion Nostr.",
}: {
  title: string;
  message?: string;
}) {
  return (
    <main className="min-h-screen px-6 pt-28 pb-16">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-background-card/80 p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full border border-bitcoin/35 bg-bitcoin/10" />
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          {message}
        </p>
      </div>
    </main>
  );
}
