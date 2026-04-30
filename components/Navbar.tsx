"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import {
  Menu,
  X,
  LogIn,
  Zap,
  LayoutDashboard,
  FolderKanban,
  LogOut,
  ExternalLink,
  Trophy,
  Globe,
  ChevronDown,
} from "lucide-react";
import Logo from "./Logo";
import LoginModal from "./LoginModal";
import { cn } from "@/lib/cn";
import { useAuth, clearAuth, readAndClearLogoutReason } from "@/lib/auth";
import { useScrollLock } from "@/lib/useScrollLock";
import { useNostrProfile } from "@/lib/nostrProfile";
import { useToast } from "./Toast";

type NavLink = {
  href: string;
  label: string;
  external?: boolean;
};

const NAV_LINKS: NavLink[] = [
  { href: "/hackathons", label: "Hackatones" },
  { href: "/projects", label: "Proyectos" },
  { href: "/infrastructure", label: "Infra pública" },
];

const NARRATIVE_NAV = [
  {
    href: "/hackathons",
    role: "CÓMO",
    label: "Hackatones",
    description: "Desde 0, ganando premios",
    icon: Trophy,
    colorClass: "text-bitcoin",
    bgClass: "bg-bitcoin/10",
    borderClass: "border-bitcoin/30",
    glowClass: "hover:shadow-[0_0_40px_-8px_theme(colors.bitcoin/0.5)]",
  },
  {
    href: "/projects",
    role: "QUÉ",
    label: "Proyectos",
    description: "Construí algo real, open source y usable hoy",
    icon: FolderKanban,
    colorClass: "text-nostr",
    bgClass: "bg-nostr/10",
    borderClass: "border-nostr/30",
    glowClass: "hover:shadow-[0_0_40px_-8px_theme(colors.nostr/0.5)]",
  },
  {
    href: "/infrastructure",
    role: "CON",
    label: "Infra propia",
    description: "Herramientas y nodos abiertos para todos",
    icon: Globe,
    colorClass: "text-cyan",
    bgClass: "bg-cyan/10",
    borderClass: "border-cyan/30",
    glowClass: "hover:shadow-[0_0_40px_-8px_theme(colors.cyan/0.5)]",
  },
] as const;

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { auth } = useAuth();
  const { profile } = useNostrProfile(auth?.pubkey);
  const [scrolled, setScrolled] = useState(false);
  const isHome = pathname === "/";
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { push: pushToast } = useToast();

  const { scrollY } = useScroll();

  // Sync expanded state whenever route changes
  useEffect(() => {
    setIsExpanded(isHome && scrollY.get() < 80);
  }, [isHome, scrollY]);

  useMotionValueEvent(scrollY, "change", (v) => {
    setScrolled(v > 8);
    setIsExpanded(isHome && v < 80);
  });

  // Detect desktop (lg breakpoint) — useLayoutEffect avoids flash on mobile
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function handleLogout() {
    clearAuth("user");
    setMobileOpen(false);
    if (pathname.startsWith("/dashboard")) router.push("/");
  }

  useEffect(() => {
    if (auth) return;
    const reason = readAndClearLogoutReason();
    if (!reason) return;
    if (reason === "signer-missing") {
      pushToast({
        kind: "info",
        title: "Se cerró la sesión",
        description:
          "Tu extensión Nostr (Alby, nos2x…) no está disponible. Reconectá para volver a firmar.",
        duration: 10000,
      });
      setLoginOpen(true);
    }
  }, [auth, pushToast]);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  useScrollLock(mobileOpen);

  return (
    <>
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={cn(
          "fixed top-0 inset-x-0 z-50",
          "transition-[height,background-color,border-color,box-shadow] duration-500 ease-in-out",
          isDesktop && isExpanded ? "h-screen" : "h-16",
          scrolled
            ? "glass-strong border-b border-border"
            : isExpanded && isDesktop
              ? "bg-background/98 backdrop-blur-2xl border-b border-white/[0.06]"
              : "bg-transparent border-b border-transparent",
        )}
      >
        {/* Top bar — always 64px */}
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between relative z-10">
          <Link href="/" className="group relative z-10">
            <Logo />
          </Link>

          {/* Compact desktop nav — fades in when collapsed */}
          <div
            className={cn(
              "hidden lg:flex items-center gap-1 transition-opacity duration-300",
              isDesktop && isExpanded ? "opacity-0 pointer-events-none" : "opacity-100",
            )}
            aria-hidden={isDesktop && isExpanded}
          >
            {NAV_LINKS.map((link) => {
              const active =
                link.external
                  ? false
                  : link.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.href);
              const className = cn(
                "relative px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                active
                  ? "text-foreground"
                  : "text-foreground-muted hover:text-foreground",
              );
              const content = (
                <>
                  {active && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute inset-0 bg-white/5 border border-border rounded-lg"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                  <span className="relative inline-flex items-center gap-1">
                    {link.label}
                    {link.external && (
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    )}
                  </span>
                </>
              );
              return link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                  tabIndex={isDesktop && isExpanded ? -1 : 0}
                >
                  {content}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={className}
                  tabIndex={isDesktop && isExpanded ? -1 : 0}
                >
                  {content}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/lacrypta"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
              aria-label="GitHub"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577v-2.165c-3.338.725-4.042-1.415-4.042-1.415-.546-1.387-1.332-1.756-1.332-1.756-1.09-.744.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.997.107-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.932 0-1.31.467-2.38 1.235-3.22-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.52 11.52 0 0 1 3.003-.404c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.118 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.803 5.628-5.476 5.922.43.37.81 1.103.81 2.222v3.293c0 .322.22.694.825.577C20.565 21.795 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>GitHub</span>
            </a>

            {auth ? (
              <div ref={userMenuRef} className="relative hidden lg:block">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="relative inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-sm font-semibold bg-white/[0.03] border border-border hover:bg-white/[0.06] hover:border-border-strong transition-all"
                  aria-label="Menú de usuario"
                  aria-expanded={userMenuOpen}
                >
                  <span className="relative h-7 w-7 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-bitcoin/30 to-nostr/30 ring-1 ring-border-strong flex items-center justify-center text-[10px] font-display font-bold">
                    {profile?.picture ? (
                      <img
                        src={profile.picture}
                        alt=""
                        className="block w-full h-full object-cover object-center"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span>{auth.pubkey.slice(0, 2).toUpperCase()}</span>
                    )}
                  </span>
                  <span className="text-xs text-foreground truncate max-w-[14ch]">
                    {profile?.display_name || profile?.name || `${auth.pubkey.slice(0, 6)}…`}
                  </span>
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-background-elevated shadow-xl overflow-hidden z-50"
                    >
                      <Link
                        href="/dashboard"
                        className="flex items-center gap-2.5 px-4 py-3 text-sm text-foreground-muted hover:text-foreground hover:bg-white/[0.05] transition-colors"
                      >
                        <LayoutDashboard className="h-4 w-4 shrink-0" />
                        Mi dashboard
                      </Link>
                      <Link
                        href="/dashboard/projects"
                        className="flex items-center gap-2.5 px-4 py-3 text-sm text-foreground-muted hover:text-foreground hover:bg-white/[0.05] transition-colors"
                      >
                        <FolderKanban className="h-4 w-4 shrink-0" />
                        Mis proyectos
                      </Link>
                      <div className="border-t border-border mx-2" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-foreground-muted hover:text-danger hover:bg-danger/5 transition-colors"
                      >
                        <LogOut className="h-4 w-4 shrink-0" />
                        Cerrar sesión
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={() => setLoginOpen(true)}
                className="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-bitcoin to-bitcoin/80 text-black hover:from-bitcoin hover:to-yellow-500 transition-all shadow-lg shadow-bitcoin/20 hover:shadow-bitcoin/40 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Zap className="h-4 w-4" strokeWidth={2.5} />
                <span>Ingresar</span>
              </button>
            )}

            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-foreground hover:bg-white/5 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </nav>

        {/* Expanded full-screen nav — desktop only, fades out on scroll */}
        <div
          style={{ height: "calc(100vh - 4rem)" }}
          className={cn(
            "hidden lg:flex flex-col items-center px-8 pb-8",
            "transition-opacity duration-300",
            isDesktop && isExpanded ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          aria-hidden={!(isDesktop && isExpanded)}
        >
          <div className="flex-1 flex flex-col items-center justify-center w-full gap-14 px-8">
            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-center"
            >
              <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-foreground-subtle mb-4">
                La Crypta Labs
              </p>
              <h1 className="font-display text-6xl xl:text-7xl font-bold tracking-tight leading-tight">
                <span className="text-foreground-muted">Aprendé </span>
                <span className="text-foreground">haciendo</span>
              </h1>
            </motion.div>

            {/* Timeline row */}
            <div className="relative w-full max-w-3xl xl:max-w-4xl">
              {/* Connecting gradient line */}
              <div className="absolute top-[27px] left-[calc(1/6*100%+4px)] right-[calc(1/6*100%+4px)] h-px"
                style={{ background: "linear-gradient(to right, #f7931a, #a855f7 50%, #22d3ee)" }}
              />

              <div className="relative flex justify-between items-start">
                {NARRATIVE_NAV.map(({ href, role, label, description, icon: Icon, colorClass, bgClass, borderClass, glowClass }, i) => (
                  <motion.div
                    key={href}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.1, duration: 0.4, ease: "easeOut" }}
                    className="flex-1 flex flex-col items-center gap-4 px-6 xl:px-10"
                  >
                    {/* Icon circle */}
                    <div className={cn(
                      "h-14 w-14 rounded-full border-2 flex items-center justify-center transition-all duration-300 shrink-0",
                      "bg-background",
                      bgClass.replace("/10", "/20"),
                      borderClass,
                    )}>
                      <Icon className={cn("h-6 w-6", colorClass)} aria-hidden />
                    </div>

                    {/* Role badge */}
                    <span className={cn(
                      "text-[10px] font-mono tracking-[0.22em] uppercase font-bold",
                      colorClass,
                    )}>
                      {role}
                    </span>

                    {/* Label + description as link */}
                    <Link
                      href={href}
                      tabIndex={isExpanded ? 0 : -1}
                      className={cn(
                        "group flex flex-col items-center gap-2 px-5 py-4 rounded-2xl border",
                        "bg-white/[0.02] border-white/[0.06]",
                        "hover:bg-white/[0.06] hover:border-white/[0.14]",
                        "hover:scale-[1.02] active:scale-[0.99]",
                        "transition-all duration-300 text-center w-full",
                        glowClass,
                      )}
                    >
                      <span className={cn(
                        "font-display font-bold text-xl xl:text-2xl tracking-tight transition-colors duration-200",
                        colorClass,
                      )}>
                        {label}
                      </span>
                      <span className="text-xs text-foreground-subtle leading-snug">
                        {description}
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="flex flex-col items-center gap-1.5 text-foreground-subtle"
            aria-hidden="true"
          >
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase">Scroll</span>
            <ChevronDown className="h-4 w-4" />
          </motion.div>
        </div>
      </motion.header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 bottom-0 w-[85%] max-w-sm glass-strong border-l border-border pt-20 pb-8 px-6 flex flex-col"
            >
              <div className="flex flex-col gap-1 mb-8">
                {NAV_LINKS.map((link, i) => {
                  const active =
                    link.external
                      ? false
                      : link.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(link.href);
                  const itemClass = cn(
                    "flex items-center justify-between gap-2 px-4 py-3 rounded-lg text-base font-medium transition-colors",
                    active
                      ? "bg-bitcoin/10 text-bitcoin border border-bitcoin/20"
                      : "text-foreground-muted hover:text-foreground hover:bg-white/5",
                  );
                  const inner = (
                    <>
                      <span>{link.label}</span>
                      {link.external && (
                        <ExternalLink className="h-4 w-4 opacity-60" />
                      )}
                    </>
                  );
                  return (
                    <motion.div
                      key={link.href}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i + 0.1 }}
                    >
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setMobileOpen(false)}
                          className={itemClass}
                        >
                          {inner}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          onClick={() => setMobileOpen(false)}
                          className={itemClass}
                        >
                          {inner}
                        </Link>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-auto flex flex-col gap-3">
                {auth ? (
                  <>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-white/[0.02]">
                      <span className="relative h-10 w-10 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-bitcoin/30 to-nostr/30 ring-1 ring-border-strong flex items-center justify-center text-xs font-display font-bold">
                        {profile?.picture ? (
                          <img
                            src={profile.picture}
                            alt=""
                            className="block w-full h-full object-cover object-center"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <span>{auth.pubkey.slice(0, 2).toUpperCase()}</span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-semibold truncate">
                            {profile?.display_name ||
                              profile?.name ||
                              `${auth.pubkey.slice(0, 10)}…`}
                          </div>
                        </div>
                        <div className="text-[11px] text-foreground-subtle font-mono truncate">
                          {auth.pubkey.slice(0, 10)}…{auth.pubkey.slice(-4)}
                        </div>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="shrink-0 p-2 rounded-md text-foreground-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                        aria-label="Cerrar sesión"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-bitcoin to-yellow-500 text-black"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Mi dashboard
                    </Link>
                    <Link
                      href="/dashboard/projects"
                      onClick={() => setMobileOpen(false)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold border border-border hover:bg-foreground/5 transition-colors"
                    >
                      <FolderKanban className="h-4 w-4" />
                      Mis Proyectos
                    </Link>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      setLoginOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-bitcoin to-yellow-500 text-black"
                  >
                    <LogIn className="h-4 w-4" />
                    Ingresar con Nostr
                  </button>
                )}
                <a
                  href="https://github.com/lacrypta"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border border-border hover:bg-white/5"
                >
                  GitHub
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
