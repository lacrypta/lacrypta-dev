"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { auth } = useAuth();
  const { profile } = useNostrProfile(auth?.pubkey);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { push: pushToast } = useToast();

  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (v) => {
    setScrolled(v > 8);
  });

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
          "fixed top-0 inset-x-0 z-50 h-16",
          "transition-[background-color,border-color,box-shadow] duration-300 ease-in-out",
          scrolled
            ? "glass-strong border-b border-border"
            : "bg-transparent border-b border-transparent",
        )}
      >
        {/* Top bar — always 64px */}
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between relative z-10">
          <Link href="/" className="group relative z-10">
            <Logo />
          </Link>

          <div className="hidden lg:flex items-center gap-1">
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
                >
                  {content}
                </a>
              ) : (
                <Link key={link.href} href={link.href} className={className}>
                  {content}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/lacrypta-dev"
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
                  href="https://github.com/lacrypta-dev"
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
