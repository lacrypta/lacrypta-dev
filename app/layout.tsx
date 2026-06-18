import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DevModeBar from "@/components/DevModeBar";
import { ToastProvider } from "@/components/Toast";
import { isDevMode } from "@/lib/devMode";
import { cn } from "@/lib/cn";
import {
  GoogleTagManagerNoscript,
  GoogleTagManagerScript,
} from "@/components/GoogleTagManager";
import { jsonLdScript, organizationLd } from "@/lib/jsonld";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lacrypta.dev"),
  title: {
    default: "La Crypta Dev — Explorando Bitcoin, Lightning y Nostr",
    template: "%s · La Crypta Dev",
  },
  description:
    "La Crypta Dev — investigación open source, prototipos y productos reales sobre Bitcoin, Lightning y Nostr. Infraestructura, hackatones y talleres de la comunidad La Crypta.",
  keywords: [
    "Bitcoin",
    "Lightning Network",
    "Nostr",
    "La Crypta",
    "Código abierto",
    "Argentina",
    "LaWallet",
    "Hackatón",
    "Blossom",
  ],
  authors: [{ name: "La Crypta Dev" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "La Crypta Dev",
    description:
      "Investigación, prototipos y productos open source sobre Bitcoin, Lightning y Nostr.",
    type: "website",
    siteName: "La Crypta Dev",
    locale: "es_AR",
    url: "https://lacrypta.dev",
  },
  twitter: {
    card: "summary_large_image",
    title: "La Crypta Dev",
    description:
      "Investigación, prototipos y productos open source sobre Bitcoin, Lightning y Nostr.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#05070e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased scroll-smooth`}
    >
      <head>
        {jsonLdScript(organizationLd(), "ld-organization")}
        <GoogleTagManagerScript />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground overflow-x-hidden">
        <GoogleTagManagerNoscript />
        <Suspense>
          <ToastProvider>
            {isDevMode() && <DevModeBar />}
            <Suspense>
              <Navbar />
            </Suspense>
            <main className={cn("flex-1", isDevMode() && "pt-8")}>
              {children}
            </main>
            <Footer />
          </ToastProvider>
        </Suspense>
      </body>
    </html>
  );
}
