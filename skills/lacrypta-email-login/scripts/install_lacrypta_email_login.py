#!/usr/bin/env python3
"""Scaffold lacrypta.dev email Nostr login into a Next.js app."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


DEFAULT_API_BASE = "https://lacrypta.dev"
DEFAULT_CALLBACK_PATH = "/auth/lacrypta-email"


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def write_text(path: Path, content: str, force: bool) -> None:
    if path.exists() and not force:
        raise SystemExit(f"Refusing to overwrite {path}. Re-run with --force.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"wrote {path}")


def detect_app_dir(root: Path) -> Path:
    if (root / "src" / "app").exists():
        return root / "src" / "app"
    if (root / "app").exists():
        return root / "app"
    return root / "src" / "app" if (root / "src").exists() else root / "app"


def detect_src_root(root: Path, app_dir: Path) -> Path:
    return root / "src" if app_dir.parts[-2:] == ("src", "app") else root


def detect_package_manager(root: Path) -> str:
    package_json = {}
    try:
        package_json = json.loads((root / "package.json").read_text(encoding="utf-8"))
    except Exception:
        pass
    package_manager = str(package_json.get("packageManager", ""))
    if package_manager.startswith("pnpm@") or (root / "pnpm-lock.yaml").exists():
        return "pnpm"
    if package_manager.startswith("yarn@") or (root / "yarn.lock").exists():
        return "yarn"
    if package_manager.startswith("bun@") or (root / "bun.lockb").exists() or (root / "bun.lock").exists():
        return "bun"
    return "npm"


def has_at_alias(root: Path) -> bool:
    try:
        tsconfig = json.loads((root / "tsconfig.json").read_text(encoding="utf-8"))
    except Exception:
        return False
    paths = tsconfig.get("compilerOptions", {}).get("paths", {})
    return "@/*" in paths


def import_spec(root: Path, src_root: Path, from_dir: Path, target: Path, alias: bool) -> str:
    if alias and target.is_relative_to(src_root):
        rel = target.relative_to(src_root).with_suffix("")
        return "@/" + rel.as_posix()
    rel = os.path.relpath(target.with_suffix(""), from_dir).replace(os.sep, "/")
    return rel if rel.startswith(".") else f"./{rel}"


def detect_adapter(root: Path, src_root: Path) -> str:
    identity = read_text(src_root / "lib" / "identity.ts")
    auth = read_text(src_root / "lib" / "auth.ts") or read_text(root / "lib" / "auth.ts")
    if "importLocalNsec" in identity:
        return "figus"
    if "setAuth" in auth and "localSecret" in auth:
        return "lacrypta-dev"
    return "generic"


def helper_source(api_base: str, callback_path: str) -> str:
    return f'''export type LacryptaEmailLoginRequest = {{
  email: string;
  redirectTo?: string;
}};

export type LacryptaEmailLoginConsumeResponse = {{
  nsec: string;
  pubkey: string;
  redirectTo: string;
}};

const DEFAULT_API_BASE = "{api_base}";
const CALLBACK_PATH = "{callback_path}";

function apiBase(): string {{
  return (
    process.env.NEXT_PUBLIC_LACRYPTA_EMAIL_LOGIN_API_BASE ??
    DEFAULT_API_BASE
  ).replace(/\\/+$/u, "");
}}

export function lacryptaEmailLoginCallbackUrl(): string {{
  if (typeof window === "undefined") return CALLBACK_PATH;
  return new URL(CALLBACK_PATH, window.location.origin).toString();
}}

export function currentLacryptaEmailRedirect(fallback = "/"): string {{
  if (typeof window === "undefined") return fallback;
  return safeLocalRedirect(
    `${{window.location.pathname}}${{window.location.search}}${{window.location.hash}}`,
    fallback,
  );
}}

export function safeLocalRedirect(value: unknown, fallback = "/"): string {{
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (candidate === "/api" || candidate.startsWith("/api/")) return fallback;
  if (/[\\u0000-\\u001f\\u007f]/u.test(candidate)) return fallback;
  return candidate;
}}

export async function requestLacryptaEmailLogin({{
  email,
  redirectTo = currentLacryptaEmailRedirect(),
}}: LacryptaEmailLoginRequest): Promise<void> {{
  const res = await fetch(`${{apiBase()}}/api/auth/email/request`, {{
    method: "POST",
    headers: {{ "content-type": "application/json" }},
    body: JSON.stringify({{
      callbackUrl: lacryptaEmailLoginCallbackUrl(),
      email,
      redirectTo: safeLocalRedirect(redirectTo),
    }}),
  }});
  const data = (await res.json().catch(() => ({{}}))) as {{ error?: string }};
  if (!res.ok) {{
    throw new Error(data.error ?? "Could not send the login email.");
  }}
}}

export async function consumeLacryptaEmailLogin(
  token: string,
): Promise<LacryptaEmailLoginConsumeResponse> {{
  const res = await fetch(`${{apiBase()}}/api/auth/email/consume`, {{
    method: "POST",
    headers: {{ "content-type": "application/json" }},
    body: JSON.stringify({{ token }}),
  }});
  const data = (await res.json().catch(() => ({{}}))) as
    | LacryptaEmailLoginConsumeResponse
    | {{ error?: string }};
  if (!res.ok || !("nsec" in data) || !("pubkey" in data)) {{
    throw new Error("error" in data ? data.error : "Could not consume the login token.");
  }}
  return data;
}}
'''


def adapter_source(adapter: str, root: Path, src_root: Path, lib_dir: Path, alias: bool) -> str:
    if adapter == "figus":
        identity_path = src_root / "lib" / "identity.ts"
        identity_import = import_spec(root, src_root, lib_dir, identity_path, alias)
        return f'''"use client";

import {{ importLocalNsec }} from "{identity_import}";
import type {{ LacryptaEmailLoginConsumeResponse }} from "./lacryptaEmailLogin";

export async function persistLacryptaEmailIdentity(
  data: LacryptaEmailLoginConsumeResponse,
) {{
  importLocalNsec(data.nsec);
}}
'''

    if adapter == "lacrypta-dev":
        auth_path = src_root / "lib" / "auth.ts"
        if not auth_path.exists():
            auth_path = root / "lib" / "auth.ts"
        auth_import = import_spec(root, src_root, lib_dir, auth_path, alias)
        return f'''"use client";

import {{ setAuth }} from "{auth_import}";
import type {{ LacryptaEmailLoginConsumeResponse }} from "./lacryptaEmailLogin";

export async function persistLacryptaEmailIdentity(
  data: LacryptaEmailLoginConsumeResponse,
) {{
  const {{ decode }} = await import("nostr-tools/nip19");
  const decoded = decode(data.nsec);
  if (decoded.type !== "nsec") throw new Error("Invalid nsec returned by lacrypta.dev.");
  setAuth({{
    method: "local",
    pubkey: data.pubkey,
    localSecret: Array.from(decoded.data as Uint8Array),
  }});
}}
'''

    return '''"use client";

import type { LacryptaEmailLoginConsumeResponse } from "./lacryptaEmailLogin";

export async function persistLacryptaEmailIdentity(
  data: LacryptaEmailLoginConsumeResponse,
) {
  localStorage.setItem("lacrypta:email-login:nsec", data.nsec);
  localStorage.setItem("lacrypta:email-login:pubkey", data.pubkey);
  window.dispatchEvent(
    new CustomEvent("lacrypta:email-login", { detail: data }),
  );
}
'''


def page_source() -> str:
    return '''import { Suspense } from "react";
import LacryptaEmailLoginClient from "./LacryptaEmailLoginClient";

export default function LacryptaEmailLoginPage() {
  return (
    <Suspense fallback={<Shell message="Starting session..." />}>
      <LacryptaEmailLoginClient />
    </Suspense>
  );
}

function Shell({ message }: { message: string }) {
  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      textAlign: "center",
    }}>
      <p>{message}</p>
    </main>
  );
}
'''


def client_source(helper_import: str, adapter_import: str) -> str:
    return f'''"use client";

import {{ useRouter, useSearchParams }} from "next/navigation";
import {{ useEffect, useState }} from "react";
import {{
  consumeLacryptaEmailLogin,
  safeLocalRedirect,
}} from "{helper_import}";
import {{ persistLacryptaEmailIdentity }} from "{adapter_import}";

export default function LacryptaEmailLoginClient() {{
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Starting session...");

  useEffect(() => {{
    let cancelled = false;
    const token = searchParams.get("token")?.trim();
    const fallbackRedirect = safeLocalRedirect(searchParams.get("next"), "/");
    if (!token) {{
      setMessage("Missing login token.");
      return;
    }}

    async function run() {{
      try {{
        const data = await consumeLacryptaEmailLogin(token!);
        await persistLacryptaEmailIdentity(data);
        if (cancelled) return;
        setMessage("Session ready. Redirecting...");
        router.replace(safeLocalRedirect(data.redirectTo, fallbackRedirect));
      }} catch (error) {{
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Could not start session.");
      }}
    }}

    void run();
    return () => {{
      cancelled = true;
    }};
  }}, [router, searchParams]);

  return (
    <main style={{{{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      textAlign: "center",
    }}}}>
      <p>{{message}}</p>
    </main>
  );
}}
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_root", nargs="?", default=".")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--callback-path", default=DEFAULT_CALLBACK_PATH)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    app_dir = detect_app_dir(root)
    src_root = detect_src_root(root, app_dir)
    lib_dir = src_root / "lib"
    alias = has_at_alias(root)
    adapter = detect_adapter(root, src_root)
    package_manager = detect_package_manager(root)

    callback_parts = [part for part in args.callback_path.strip("/").split("/") if part]
    callback_dir = app_dir.joinpath(*callback_parts)

    helper_path = lib_dir / "lacryptaEmailLogin.ts"
    adapter_path = lib_dir / "lacryptaEmailLoginAdapter.ts"
    client_path = callback_dir / "LacryptaEmailLoginClient.tsx"
    page_path = callback_dir / "page.tsx"

    helper_import = import_spec(root, src_root, callback_dir, helper_path, alias)
    adapter_import = import_spec(root, src_root, callback_dir, adapter_path, alias)

    write_text(helper_path, helper_source(args.api_base, args.callback_path), args.force)
    write_text(adapter_path, adapter_source(adapter, root, src_root, lib_dir, alias), args.force)
    write_text(page_path, page_source(), args.force)
    write_text(client_path, client_source(helper_import, adapter_import), args.force)

    print()
    print(f"Detected app dir: {app_dir}")
    print(f"Detected adapter: {adapter}")
    print(f"Detected package manager: {package_manager}")
    print()
    print("Next steps:")
    print("1. Import requestLacryptaEmailLogin from the generated helper in your login UI.")
    print("2. Replace the current email form submit with requestLacryptaEmailLogin({ email, redirectTo }).")
    print("3. Run the app build, for example:")
    print(f"   {package_manager} run build")


if __name__ == "__main__":
    main()
