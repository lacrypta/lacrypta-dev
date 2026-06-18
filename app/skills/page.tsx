import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Download,
  FileCode2,
  KeyRound,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";
import PageHero from "@/components/ui/PageHero";

export const metadata: Metadata = {
  title: "Skills",
  description:
    "Skills de La Crypta Dev para instalar flujos Nostr, herramientas open source y automatizaciones en proyectos de la comunidad.",
  alternates: { canonical: "/skills" },
};

const installCommand = "npx skills add lacrypta/lacrypta-dev";

const installNoTelemetryCommand =
  "DISABLE_TELEMETRY=1 npx skills add lacrypta/lacrypta-dev";

const steps = [
  {
    title: "Instalá el skill",
    body: "Copialo a tu carpeta local de Codex Skills. El script usa CODEX_HOME si existe y cae a ~/.codex.",
    icon: <Download className="h-4 w-4" />,
  },
  {
    title: "Abrí el proyecto destino",
    body: "Desde Codex, trabajá dentro del repo que necesita login por email con Nostr.",
    icon: <FileCode2 className="h-4 w-4" />,
  },
  {
    title: "Pedí la integración",
    body: "Usá el skill para generar callback, helper de navegador y adaptador de identidad local.",
    icon: <Bot className="h-4 w-4" />,
  },
];

const checks = [
  "Detecta app/ o src/app/ en proyectos Next.js.",
  "Detecta alias @/* y package manager.",
  "Agrega /auth/lacrypta-email como callback estándar.",
  "Usa https://lacrypta.dev como issuer por defecto.",
  "Integra Figus con importLocalNsec(data.nsec).",
  "Mantiene NIP-07, NIP-46 y claves locales existentes.",
];

export default function SkillsPage() {
  return (
    <>
      <PageHero
        eyebrow="SKILLS PARA BUILDERS"
        eyebrowIcon={<Wrench className="h-3 w-3" />}
        title={
          <>
            Herramientas instalables para{" "}
            <span className="text-gradient-bitcoin">proyectos Nostr</span>
          </>
        }
        description="Skills versionados junto a lacrypta.dev para que otros proyectos puedan adoptar infraestructura y flujos de La Crypta sin rehacer integración a mano."
      />

      <section className="py-14 sm:py-18">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <article className="rounded-lg border border-border bg-background-card/65 p-6 sm:p-7">
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-bitcoin/35 bg-bitcoin/10 text-bitcoin">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-widest text-bitcoin">
                    lacrypta-email-login
                  </p>
                  <h2 className="font-display text-2xl font-bold">
                    Email login para subdominios lacrypta.dev
                  </h2>
                </div>
              </div>

              <p className="max-w-3xl text-sm leading-relaxed text-foreground-muted sm:text-base">
                Este skill instala el flujo de login por email que usa
                <code className="mx-1 rounded border border-border bg-black/20 px-1 py-0.5 font-mono text-[0.9em] text-foreground">
                  lacrypta.dev
                </code>
                como issuer central. Los proyectos en subdominios como
                <code className="mx-1 rounded border border-border bg-black/20 px-1 py-0.5 font-mono text-[0.9em] text-foreground">
                  figus.lacrypta.dev
                </code>
                pueden pedir un magic link, consumir el token desde el navegador
                con CORS y persistir el
                <code className="mx-1 rounded border border-border bg-black/20 px-1 py-0.5 font-mono text-[0.9em] text-foreground">
                  nsec
                </code>
                como identidad Nostr local.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {checks.map((check) => (
                  <div
                    key={check}
                    className="flex items-start gap-3 rounded-lg border border-border bg-white/[0.025] p-3"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span className="text-sm leading-relaxed text-foreground-muted">
                      {check}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="https://github.com/lacrypta/lacrypta-dev/blob/main/docs/email-nostr-login.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-4 py-2 text-sm font-semibold text-foreground-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
                >
                  Ver contrato HTTP
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="https://github.com/lacrypta/lacrypta-dev/tree/main/skills/lacrypta-email-login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-bitcoin/35 bg-bitcoin/10 px-4 py-2 text-sm font-semibold text-bitcoin transition-colors hover:bg-bitcoin/15"
                >
                  Abrir skill en GitHub
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </article>

            <aside className="rounded-lg border border-border bg-background-card/65 p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Terminal className="h-4 w-4 text-cyan" />
                Instalar con skills.sh
              </div>
              <CommandBlock command={installCommand} />

              <div className="mt-6 mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Terminal className="h-4 w-4 text-bitcoin" />
                Instalar sin telemetría
              </div>
              <CommandBlock command={installNoTelemetryCommand} />

              <div className="mt-6 rounded-lg border border-cyan/25 bg-cyan/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan">
                  <ShieldCheck className="h-4 w-4" />
                  Sin configuración inicial
                </div>
                <p className="text-sm leading-relaxed text-foreground-muted">
                  El proyecto destino solo necesita estar servido desde un
                  subdominio
                  <code className="mx-1 rounded border border-border bg-black/20 px-1 py-0.5 font-mono text-[0.9em] text-foreground">
                    *.lacrypta.dev
                  </code>
                  . Dominios externos se habilitan del lado de
                  <code className="mx-1 rounded border border-border bg-black/20 px-1 py-0.5 font-mono text-[0.9em] text-foreground">
                    lacrypta.dev
                  </code>
                  con
                  <code className="mx-1 rounded border border-border bg-black/20 px-1 py-0.5 font-mono text-[0.9em] text-foreground">
                    EMAIL_LOGIN_ALLOWED_CALLBACK_URLS
                  </code>
                  .
                </p>
              </div>

              <a
                href="https://www.skills.sh/docs/cli"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-4 py-2 text-sm font-semibold text-foreground-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                Ver docs de skills.sh
                <ArrowRight className="h-4 w-4" />
              </a>
            </aside>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-background-elevated/25 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-foreground-subtle">
              Uso recomendado
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold">
              Cómo pedirle a Codex que lo aplique
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-lg border border-border bg-background-card/60 p-5"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white/[0.03] text-foreground-muted">
                    {step.icon}
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground-subtle">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                  {step.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-lg border border-border bg-background-card/70 p-5">
            <p className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-foreground-subtle">
              Prompt de ejemplo
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-black/30 p-4 text-sm leading-relaxed text-foreground-muted">
              <code>
                Use $lacrypta-email-login to add lacrypta.dev email Nostr login
                to this app.
              </code>
            </pre>
          </div>
        </div>
      </section>
    </>
  );
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="rounded-lg border border-border bg-black/35 p-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-foreground-subtle">
          Shell
        </span>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground">
        <code>{command}</code>
      </pre>
    </div>
  );
}
