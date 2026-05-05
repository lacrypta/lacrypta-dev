import Link from "next/link";
import Logo from "./Logo";
import { Zap } from "lucide-react";
import { GithubIcon, XIcon } from "@/components/BrandIcons";
import { version as appVersion } from "@/package.json";

const COLS = [
  {
    title: "Dev",
    links: [
      { href: "/", label: "Inicio" },
      { href: "/infrastructure", label: "Infraestructura" },
      { href: "/projects", label: "Proyectos" },
    ],
  },
  {
    title: "Comunidad",
    links: [
      { href: "/hackathons", label: "Hackatones" },
      {
        href: "https://lacrypta.ar",
        label: "La Crypta",
        external: true,
      },
    ],
  },
  {
    title: "Construí",
    links: [
      {
        href: "https://github.com/lacrypta-dev",
        label: "GitHub",
        external: true,
      },
      { href: "#", label: "Docs (pronto)" },
      { href: "#", label: "Estado (pronto)" },
    ],
  },
];

export default async function Footer() {
  "use cache";
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-auto border-t border-border bg-background-elevated/40">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bitcoin/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-2">
            <Logo />
            <p className="mt-4 text-sm text-foreground-muted leading-relaxed max-w-sm">
              El lab de I+D de La Crypta — explorando, investigando y lanzando
              sobre Bitcoin, Lightning y Nostr. Construido en abierto,
              compartido con libertad.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a
                href="https://github.com/lacrypta-dev"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
                aria-label="GitHub"
              >
                <GithubIcon className="h-4 w-4" />
              </a>
              <a
                href="https://twitter.com/lacryptaok"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
                aria-label="X"
              >
                <XIcon className="h-4 w-4" />
              </a>
              <a
                href="https://njump.me"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-nostr/30 bg-nostr/10 text-nostr text-xs font-mono font-semibold hover:bg-nostr/20 transition-colors"
                aria-label="Nostr"
              >
                <Zap className="h-3 w-3" />
                NOSTR
              </a>
            </div>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <h4 className="font-display text-sm font-bold uppercase tracking-widest text-foreground-muted mb-4">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {"external" in l && l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-foreground-muted hover:text-foreground transition-colors"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-sm text-foreground-muted hover:text-foreground transition-colors"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-foreground-subtle font-mono">
            © {year} La Crypta Dev · Buenos Aires, Argentina · Hecho con
            software libre
          </p>
          <div className="flex items-center gap-3 text-xs text-foreground-subtle">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="font-mono">v{appVersion} — EN LÍNEA</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
