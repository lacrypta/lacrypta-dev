import { Suspense } from "react";
import type { Metadata } from "next";
import MisHackatonesClient from "./MisHackatonesClient";

export const metadata: Metadata = {
  title: "Mis hackatones",
  description: "Los hackatones en los que participaste y con qué proyectos.",
  robots: { index: false, follow: false },
};

export default function MisHackatonesPage() {
  return (
    <Suspense>
      <MisHackatonesClient />
    </Suspense>
  );
}
