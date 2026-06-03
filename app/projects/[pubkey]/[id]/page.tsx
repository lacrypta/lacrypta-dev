import type { Metadata } from "next";
import { Suspense } from "react";
import StandaloneProjectPage from "./StandaloneProjectPage";

export const metadata: Metadata = {
  title: "Proyecto",
  robots: { index: false, follow: false },
};

function ProjectFallback() {
  return (
    <div className="relative pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4 mt-8">
          <div className="h-8 bg-white/5 rounded-lg w-64" />
          <div className="h-4 bg-white/5 rounded w-full max-w-lg" />
          <div className="h-4 bg-white/5 rounded w-3/4 max-w-md" />
        </div>
      </div>
    </div>
  );
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ pubkey: string; id: string }>;
}) {
  return (
    <Suspense fallback={<ProjectFallback />}>
      {params.then(({ pubkey, id: projectId }) => (
        <StandaloneProjectPage pubkey={pubkey} projectId={projectId} />
      ))}
    </Suspense>
  );
}
