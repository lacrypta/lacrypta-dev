import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

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
  metadataBase: new URL("https://labs.lacrypta.ar"),
  title: {
    default: "La Crypta Labs — Explorando Bitcoin, Lightning y Nostr",
    template: "%s · La Crypta Labs",
  },
  description:
    "La Crypta Labs — investigación open source, prototipos y productos reales sobre Bitcoin, Lightning y Nostr. Infraestructura, hackatones y talleres de la comunidad La Crypta.",
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
  authors: [{ name: "La Crypta Labs" }],
  openGraph: {
    title: "La Crypta Labs",
    description:
      "Investigación, prototipos y productos open source sobre Bitcoin, Lightning y Nostr.",
    type: "website",
    siteName: "La Crypta Labs",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: "La Crypta Labs",
    description:
      "Investigación, prototipos y productos open source sobre Bitcoin, Lightning y Nostr.",
  },
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
      <body className="min-h-full flex flex-col bg-background text-foreground overflow-x-hidden">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
