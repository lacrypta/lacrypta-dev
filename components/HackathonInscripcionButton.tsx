"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
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
  const [pendingInscription, setPendingInscription] = useState(false);

  function handleClick() {
    if (auth) {
      setProjectOpen(true);
    } else {
      setPendingInscription(true);
      setLoginOpen(true);
    }
  }

  // After login succeeds, resume the inscription intent automatically.
  useEffect(() => {
    if (auth && pendingInscription) {
      setPendingInscription(false);
      setLoginOpen(false);
      setProjectOpen(true);
    }
  }, [auth, pendingInscription]);

  return (
    <>
      <button
        onClick={handleClick}
        className="inline-flex items-center justify-center gap-3 min-w-[20rem] px-12 py-5 rounded-2xl bg-gradient-to-r from-bitcoin to-yellow-500 text-black font-display font-black text-xl uppercase tracking-wide shadow-lg shadow-bitcoin/30 hover:shadow-bitcoin/50 hover:scale-[1.03] active:scale-[0.97] transition-all"
      >
        <UserPlus className="h-6 w-6" />
        Inscribite gratis
      </button>
      <LoginModal
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          // Drop the deferred inscription intent so a later auth recovery
          // (signer revival, other-tab login) doesn't pop NewProjectModal
          // out of nowhere.
          setPendingInscription(false);
        }}
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
