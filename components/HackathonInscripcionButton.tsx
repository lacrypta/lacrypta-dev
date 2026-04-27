"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import LoginModal from "./LoginModal";
import NewProjectModal from "./NewProjectModal";

export default function HackathonInscripcionButton({
  hackathonId,
}: {
  hackathonId: string;
}) {
  const { auth } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);

  function handleClick() {
    if (auth) {
      setProjectOpen(true);
    } else {
      setLoginOpen(true);
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 text-black font-semibold text-sm shadow-lg shadow-bitcoin/20 hover:shadow-bitcoin/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
      >
        <Zap className="h-4 w-4" />
        Inscripción
      </button>
      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        redirectTo={`/hackathons/${hackathonId}`}
      />
      <NewProjectModal
        hackathonId={hackathonId}
        open={projectOpen}
        onClose={() => setProjectOpen(false)}
      />
    </>
  );
}
