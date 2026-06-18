import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Download,
  FileCode2,
  Fingerprint,
  Globe2,
  KeyRound,
  Mail,
  Server,
  ShieldCheck,
  Terminal,
  WalletCards,
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

const magicLoginSteps = [
  {
    title: "Email",
    label: "usuario@mail.com",
    body: "El usuario pide un magic link desde cualquier app integrada.",
    icon: <Mail className="h-5 w-5" />,
  },
  {
    title: "lacrypta.dev",
    label: "issuer central",
    body: "Normaliza el mail y genera siempre la misma nsec para esa persona.",
    icon: <Server className="h-5 w-5" />,
  },
  {
    title: "Subdominio",
    label: "*.lacrypta.dev",
    body: "Consume el token con CORS y recibe la identidad Nostr local.",
    icon: <Globe2 className="h-5 w-5" />,
  },
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
                  href="https://github.com/lacrypta/lacrypta-dev/blob/main/skills/lacrypta-email-login/SKILL.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-bitcoin/35 bg-bitcoin/10 px-4 py-2 text-sm font-semibold text-bitcoin transition-colors hover:bg-bitcoin/15"
                >
                  Ver SKILL.md
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

      <section className="border-y border-border bg-background-elevated/25 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-bitcoin">
              Magic login temporal
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold">
              Mismo mail, misma identidad Nostr
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-foreground-muted sm:text-base">
              lacrypta.dev genera la
              <code className="mx-1 rounded border border-border bg-black/20 px-1 py-0.5 font-mono text-[0.9em] text-foreground">
                nsec
              </code>
              desde el email normalizado y los subdominios la recuperan a través
              del issuer central. Así los nuevos usuarios pueden entrar a varias
              apps sin perder su identidad, y migrar más adelante a una
              <span className="text-foreground">
                {" "}
                nsec self-custodial
              </span>{" "}
              cuando estén preparados.
            </p>
          </div>

          <MagicLoginImage />
        </div>
      </section>

      <section className="bg-background-elevated/25 py-14">
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

function MagicLoginImage() {
  return (
    <figure
      role="img"
      aria-label="Proceso de magic login: un email entra a lacrypta.dev, se deriva la misma nsec y los subdominios la usan para iniciar sesión sin que el usuario pierda identidad."
      className="relative overflow-hidden rounded-lg border border-border bg-background-card/70 p-5 shadow-2xl shadow-black/20 sm:p-6"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,153,0,0.14),transparent_30%),radial-gradient(circle_at_82%_20%,rgba(0,245,255,0.12),transparent_28%)]" />
      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.38fr)]">
        <div className="rounded-lg border border-border bg-black/20 p-4 sm:p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-foreground-subtle">
                Flujo browser CORS
              </p>
              <h3 className="mt-1 font-display text-2xl font-bold">
                Magic Login Nostr
              </h3>
            </div>
            <span className="inline-flex items-center gap-2 rounded-lg border border-bitcoin/35 bg-bitcoin/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-bitcoin">
              <Fingerprint className="h-3.5 w-3.5" />
              nsec estable
            </span>
          </div>

          <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {magicLoginSteps.map((step, index) => (
              <MagicLoginNode key={step.title} step={step} index={index} />
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-bitcoin/30 bg-bitcoin/[0.08] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-bitcoin">
                <KeyRound className="h-4 w-4" />
                Mismo mail = misma nsec
              </div>
              <p className="text-sm leading-relaxed text-foreground-muted">
                Si una persona entra con el mismo email en Figus u otro
                subdominio, lacrypta.dev entrega la misma identidad Nostr.
              </p>
            </div>

            <div className="rounded-lg border border-cyan/30 bg-cyan/[0.08] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan">
                <WalletCards className="h-4 w-4" />
                Puente hacia self-custody
              </div>
              <p className="text-sm leading-relaxed text-foreground-muted">
                Es una solución de onboarding para usuarios nuevos. Cuando estén
                listos, pueden migrar a una nsec propia y autocustodiada.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-white/[0.025] p-4">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-foreground-subtle">
              Contrato de confianza
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
              El subdominio no inventa otra clave: usa el callback autorizado,
              consume el token y guarda localmente la identidad recibida.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-black/30 p-4">
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-bitcoin">
              identidad
            </p>
            <div className="mt-3 space-y-2 font-mono text-xs text-foreground-muted">
              <div className="flex items-center justify-between gap-3">
                <span>email</span>
                <span className="truncate text-foreground">hash normalizado</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>nsec</span>
                <span className="text-foreground">nsec••••misma</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>pubkey</span>
                <span className="text-foreground">npub••••misma</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-lightning/30 bg-lightning/[0.08] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-lightning">
              <ShieldCheck className="h-4 w-4" />
              Temporal, no final
            </div>
            <p className="text-sm leading-relaxed text-foreground-muted">
              Sirve para que nadie pierda su identidad al empezar. La meta sigue
              siendo que cada usuario custodie su propia clave.
            </p>
          </div>
        </div>
      </div>
    </figure>
  );
}

function MagicLoginNode({
  step,
  index,
}: {
  step: {
    title: string;
    label: string;
    body: string;
    icon: ReactNode;
  };
  index: number;
}) {
  return (
    <>
      <div className="flex min-h-56 flex-col rounded-lg border border-border bg-background-card/80 p-4">
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white/[0.04] text-bitcoin">
            {step.icon}
          </span>
          <span className="font-mono text-[11px] font-bold text-foreground-subtle">
            0{index + 1}
          </span>
        </div>
        <h4 className="font-display text-xl font-bold">{step.title}</h4>
        <p className="mt-1 font-mono text-xs font-bold uppercase tracking-widest text-cyan">
          {step.label}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-foreground-muted">
          {step.body}
        </p>
      </div>

      {index < magicLoginSteps.length - 1 ? (
        <div className="hidden items-center justify-center md:flex">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-bitcoin/35 bg-bitcoin/10 text-bitcoin">
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      ) : null}
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
