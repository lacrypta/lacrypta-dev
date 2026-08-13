import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Briefcase,
  GitCommit,
  MapPin,
  Sparkles,
  Zap,
} from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";
import { HACKATHONS, PROGRAM, formatSats } from "@/lib/hackathons";

export default function HomeBenefits() {
  return (
    <section className="relative overflow-hidden border-t border-border bg-[linear-gradient(180deg,#05070e_0%,#0a0d1a_100%)]">
      <AmbientBackground />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <Header />

        <div className="grid grid-cols-12 gap-5 sm:gap-6">
          <BenefitExperience />
          <BenefitGitHub />
          <BenefitJobs />
        </div>

        <Outro />
      </div>
    </section>
  );
}

function Header() {
  return (
    <header className="mb-14 sm:mb-20 max-w-3xl mx-auto text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-bitcoin/30 bg-bitcoin/[0.06] px-3 py-1.5 text-[10px] font-mono font-bold tracking-[0.25em] uppercase text-bitcoin">
        <Sparkles className="h-3 w-3" />
        Sin experiencia
      </span>
      <h2 className="mt-6 font-display text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[0.95]">
        Tu primer trabajo{" "}
        <span className="text-gradient-hero">bitcoiner open-source</span>.
      </h2>
      <p className="mt-5 text-base sm:text-lg text-foreground-muted leading-relaxed">
        Aprendés mientras ganás sats.
      </p>
    </header>
  );
}

function BenefitGitHub() {
  return (
    <article className="col-span-12 lg:col-span-7 group relative overflow-hidden rounded-3xl border border-bitcoin/30 bg-background-card/70 backdrop-blur-sm p-6 sm:p-8 flex flex-col gap-6 hover:border-bitcoin/60 transition-colors duration-500">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-bitcoin/[0.16] via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-700" />
      <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-bitcoin/25 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.25em] uppercase text-bitcoin">
            02 · Experiencia verificable
          </span>
          <h3 className="mt-3 font-display text-3xl sm:text-4xl md:text-[44px] font-black tracking-tight leading-[1.05]">
            Tu GitHub
            <br />
            <span className="text-gradient-bitcoin">es tu currículum</span>
          </h3>
          <p className="mt-4 text-sm sm:text-[15px] text-foreground-muted leading-relaxed max-w-md">
            Talk is cheap. Show me the code.
          </p>
        </div>

        <div className="shrink-0 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-bitcoin/30 bg-bitcoin/[0.06] ring-1 ring-bitcoin/20">
          <GithubIcon className="h-6 w-6 text-bitcoin" />
        </div>
      </div>

      <ContributionGraph />
      <CommitTerminal />
    </article>
  );
}

function ContributionGraph() {
  const rng = mulberry32(42);
  const cells: number[][] = [];
  for (let r = 0; r < 7; r++) {
    const row: number[] = [];
    for (let c = 0; c < 28; c++) {
      const recencyBoost = c / 28;
      const v = rng() + recencyBoost * 0.45;
      row.push(v < 0.4 ? 0 : v < 0.6 ? 1 : v < 0.78 ? 2 : v < 0.92 ? 3 : 4);
    }
    cells.push(row);
  }

  const levelClass = [
    "bg-white/[0.04]",
    "bg-bitcoin/30",
    "bg-bitcoin/55",
    "bg-bitcoin/80",
    "bg-bitcoin shadow-[0_0_8px_rgba(247,147,26,0.7)]",
  ];

  return (
    <div className="relative rounded-2xl border border-border bg-background/40 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground-muted">
          últimos 6 meses
        </span>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono text-foreground-muted">
          front
          <span className="flex gap-[2px]">
            {[0, 1, 2, 3, 4].map((l) => (
              <span
                key={l}
                className={cn("h-2 w-2 rounded-[2px]", levelClass[l])}
              />
            ))}
          </span>
          back
        </span>
      </div>

      <div className="flex gap-[3px] overflow-x-auto pb-1 -mb-1">
        {cells[0].map((_, c) => (
          <div key={c} className="flex flex-col gap-[3px]">
            {cells.map((row, r) => (
              <span
                key={`${c}-${r}`}
                className={cn(
                  "h-[11px] w-[11px] sm:h-3 sm:w-3 rounded-[3px] shrink-0",
                  levelClass[row[c]],
                )}
                aria-hidden
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommitTerminal() {
  return (
    <div className="relative rounded-2xl border border-border bg-black/60 font-mono text-[12px] sm:text-[13px] overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-lightning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-3 text-[10px] tracking-wider text-foreground-muted">
          ~/proyectos/lightning-wallet
        </span>
      </div>
      <div className="p-4 space-y-1.5 leading-relaxed">
        <div className="flex gap-2">
          <span className="text-success">$</span>
          <span className="text-foreground">git commit -m "primer proyecto"</span>
        </div>
        <div className="flex gap-3">
          <span className="text-bitcoin shrink-0">a4f2e1c</span>
          <span className="text-foreground-muted truncate">
            feat(lightning): zero-conf rebalancer
          </span>
        </div>
        <div className="flex gap-2 pt-1">
          <span className="text-success">$</span>
          <span className="text-foreground inline-flex items-center">
            git push origin main
            <span className="ml-1.5 inline-block h-3.5 w-1.5 bg-foreground animate-pulse" />
          </span>
        </div>
      </div>
    </div>
  );
}

function BenefitExperience() {
  return (
    <article className="col-span-12 lg:col-span-5 group relative overflow-hidden rounded-3xl border border-nostr/30 bg-background-card/70 backdrop-blur-sm p-6 sm:p-8 flex flex-col gap-6 hover:border-nostr/60 transition-colors duration-500">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-nostr/[0.16] via-transparent to-cyan/[0.06] opacity-60 group-hover:opacity-100 transition-opacity duration-700" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-nostr/25 blur-3xl opacity-40 group-hover:opacity-70 transition-opacity duration-700" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.25em] uppercase text-nostr">
            01 · Práctica
          </span>
          <h3 className="mt-3 font-display text-3xl sm:text-4xl font-black tracking-tight leading-[1.05]">
            Adquirí
            <br />
            <span className="text-gradient-nostr">experiencia real</span>
          </h3>
          <p className="mt-4 text-sm sm:text-[15px] text-foreground-muted leading-relaxed">
            Aprendé construyendo y participando en hackatons
          </p>
        </div>

        <div className="shrink-0 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-nostr/30 bg-nostr/[0.06] ring-1 ring-nostr/20">
          <Zap className="h-6 w-6 text-nostr" />
        </div>
      </div>

      <Constellation />
      <ExperienceStats />
    </article>
  );
}

const PILLARS = [
  { src: "/pilares/lightning.svg", label: "Lightning", x: "18%", y: "22%", size: 40 },
  { src: "/pilares/nostr.svg", label: "Nostr", x: "78%", y: "20%", size: 38 },
  { src: "/pilares/spark.svg", label: "Spark", x: "84%", y: "70%", size: 32 },
  { src: "/pilares/rgb.svg", label: "RGB", x: "14%", y: "72%", size: 34 },
  { src: "/pilares/liquid.svg", label: "Liquid", x: "52%", y: "84%", size: 30 },
] as const;

function Constellation() {
  return (
    <div className="relative h-52 sm:h-60 rounded-2xl border border-border bg-background/40 overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        aria-hidden
      >
        {PILLARS.map((p) => (
          <line
            key={p.label}
            x1="50%"
            y1="50%"
            x2={p.x}
            y2={p.y}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 5"
            className="text-nostr/25"
          />
        ))}
      </svg>

      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-full border border-nostr/40 bg-background-card shadow-[0_0_40px_rgba(168,85,247,0.55)]">
          <Image
            src="/lacrypta-logo.svg"
            alt="La Crypta"
            width={36}
            height={36}
            className="opacity-95"
          />
        </div>
      </div>

      {PILLARS.map((p) => (
        <div
          key={p.label}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: p.x, top: p.y }}
        >
          <div
            className="inline-flex items-center justify-center rounded-full border border-border bg-background-card shadow-lg"
            style={{ width: p.size, height: p.size }}
            title={p.label}
          >
            <Image
              src={p.src}
              alt={p.label}
              width={Math.round(p.size * 0.55)}
              height={Math.round(p.size * 0.55)}
              className="object-contain"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExperienceStats() {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      <Stat label="Hackatons" value={String(HACKATHONS.length)} />
      <Stat label="Sats en premios" value={formatSats(PROGRAM.totalPrize)} />
      <Stat
        label="Premios"
        value={String(PROGRAM.prizeDistribution.length * HACKATHONS.length)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 px-3 py-2.5 text-center">
      <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.18em] text-foreground-muted">
        {label}
      </div>
    </div>
  );
}

function BenefitJobs() {
  return (
    <article className="col-span-12 group relative overflow-hidden rounded-3xl border border-lightning/30 bg-background-card/70 backdrop-blur-sm p-6 sm:p-8 hover:border-lightning/60 transition-colors duration-500">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-lightning/[0.10] via-bitcoin/[0.06] to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-700" />

      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
        <div className="lg:col-span-4">
          <div className="flex items-start justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-[10px] font-mono font-bold tracking-[0.25em] uppercase text-lightning">
              03 · Resultado
            </span>
            <div className="shrink-0 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-lightning/30 bg-lightning/[0.06] ring-1 ring-lightning/20 lg:hidden">
              <Briefcase className="h-6 w-6 text-lightning" />
            </div>
          </div>
          <h3 className="mt-3 font-display text-3xl sm:text-4xl md:text-[44px] font-black tracking-tight leading-[1.05]">
            Conseguí trabajo
            <br />
            <span className="bg-gradient-to-r from-lightning via-bitcoin to-lightning bg-clip-text text-transparent">
              en bitcoin
            </span>
          </h3>
          <p className="mt-4 text-sm sm:text-[15px] text-foreground-muted leading-relaxed">
            Se buscan builders que tengan experiencia en Bitcoin.
          </p>
        </div>

        <div className="lg:col-span-8">
          <JobTicker />
        </div>
      </div>
    </article>
  );
}

type Job = { co: string; role: string; sats: string; loc: string };

const JOBS: Job[] = [
  { co: "Strike", role: "Lightning Engineer", sats: "48.0M", loc: "Remote" },
  { co: "Galoy", role: "Backend Rust", sats: "43.2M", loc: "Remote · LATAM" },
  { co: "Voltage", role: "DevRel", sats: "38.4M", loc: "Remote" },
  { co: "Fedi", role: "Mobile Engineer", sats: "40.8M", loc: "Remote" },
  { co: "Lightspark", role: "SDK Engineer", sats: "52.0M", loc: "Remote" },
  { co: "Wapupay", role: "Product Engineer", sats: "30.4M", loc: "Buenos Aires" },
  { co: "Cash App BTC", role: "Senior Engineer", sats: "57.6M", loc: "Remote" },
  { co: "Coinos", role: "Full-stack", sats: "35.2M", loc: "Remote" },
  { co: "Breez", role: "iOS Engineer", sats: "44.8M", loc: "Remote" },
];

function JobTicker() {
  const colA = [...JOBS, ...JOBS];
  const colB = [...JOBS.slice(3), ...JOBS, ...JOBS.slice(0, 3)];

  return (
    <div className="relative h-56 sm:h-64 rounded-2xl border border-border bg-background/30 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-background-card to-transparent z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background-card to-transparent z-10" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4 h-full overflow-hidden">
        <div className="flex flex-col gap-3 animate-ticker">
          {colA.map((j, i) => (
            <JobCard key={`a-${i}`} {...j} />
          ))}
        </div>
        <div className="hidden sm:flex flex-col gap-3 animate-ticker-slow">
          {colB.map((j, i) => (
            <JobCard key={`b-${i}`} {...j} />
          ))}
        </div>
      </div>
    </div>
  );
}

function JobCard({ co, role, sats, loc }: Job) {
  return (
    <div className="rounded-xl border border-border bg-background-card/80 backdrop-blur-sm p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground-muted">
            {co}
          </div>
          <div className="mt-1 font-semibold text-sm leading-tight truncate">
            {role}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/[0.08] px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-success shrink-0">
          Hiring
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-foreground-muted">
        <span className="inline-flex items-center gap-1 min-w-0">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{loc}</span>
        </span>
        <span className="font-mono font-bold text-lightning shrink-0">
          ⚡ {sats}/yr
        </span>
      </div>
    </div>
  );
}

function Outro() {
  return (
    <div className="mt-12 sm:mt-16 flex flex-col sm:flex-row items-center justify-between gap-6 rounded-3xl border border-border bg-background-card/40 backdrop-blur-sm px-6 py-7 sm:px-10 sm:py-8">
      <div className="flex items-center gap-4 text-center sm:text-left">
        <div className="hidden sm:inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-bitcoin/30 bg-bitcoin/[0.06]">
          <GitCommit className="h-5 w-5 text-bitcoin" />
        </div>
        <p className="font-display text-xl sm:text-2xl font-bold tracking-tight">
          Enterate de las propuestas
        </p>
      </div>
      <Link
        href="#oportunidades"
        className="group inline-flex items-center gap-2 rounded-2xl border border-bitcoin/40 bg-bitcoin/[0.08] px-5 py-3 font-semibold text-sm text-bitcoin hover:bg-bitcoin/[0.14] hover:border-bitcoin/60 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        Ver oportunidades
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </Link>
    </div>
  );
}

function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 left-1/4 h-[460px] w-[460px] rounded-full bg-bitcoin/[0.08] blur-3xl" />
      <div className="absolute -bottom-40 right-1/4 h-[520px] w-[520px] rounded-full bg-nostr/[0.08] blur-3xl" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-bitcoin/60 to-transparent" />
    </div>
  );
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
