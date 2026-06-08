"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ImageCropModal from "@/components/ImageCropModal";
import { AvatarUploader, BannerUploader } from "@/components/ImageUploader";
import Logo from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { uploadToBlossom } from "@/lib/blossom";
import { cn } from "@/lib/cn";
import { DEFAULT_LOGIN_REDIRECT, safeLoginRedirect } from "@/lib/loginRedirect";
import {
  COVER_COLORS,
  ELEMENTS,
  avatarVariantFromText,
  lowpolyAvatarSvg,
  lowpolyCoverSvg,
  type Element,
} from "@/lib/lowpolyArt";
import { publishNostrProfile } from "@/lib/nostrProfile";
import { getSigner } from "@/lib/nostrSigner";
import { randomDisplayName, slugifyName } from "@/lib/randomName";
import { svgToDataUri, svgToPngBlob } from "@/lib/svgRaster";
import { useBlossomUpload } from "@/lib/useBlossomUpload";

type Phase =
  | "idle"
  | "rasterizing"
  | "uploading"
  | "publishing"
  | "success"
  | "error";

const randInt = (n: number) => Math.floor(Math.random() * n);

export default function OnboardingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth, ready } = useAuth();
  const { push: pushToast } = useToast();

  const next = safeLoginRedirect(
    searchParams.get("next"),
    DEFAULT_LOGIN_REDIRECT,
  );
  const pubkey = auth?.pubkey ?? "";

  const [initialized, setInitialized] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const [element, setElement] = useState<Element>("fuego");
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Custom images uploaded by the user (override the generated ones).
  const [customPicture, setCustomPicture] = useState<string | null>(null);
  const [customBanner, setCustomBanner] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const upload = useBlossomUpload(auth, {
    onUploaded: (target, url) => {
      if (target === "picture") setCustomPicture(url);
      else setCustomBanner(url);
    },
    onAuthUrl: (url) =>
      pushToast({
        kind: "info",
        title: "Autorizá la firma en tu firmante",
        description: url,
        duration: 20000,
      }),
    onError: (msg) =>
      pushToast({
        kind: "error",
        title: "No se pudo subir la imagen",
        description: msg.split("\n")[0],
        duration: 12000,
      }),
  });

  // Redirect out if not authenticated; seed every field at random once ready.
  useEffect(() => {
    if (!ready) return;
    if (!auth) {
      router.replace("/");
      return;
    }
    if (initialized) return;
    setDisplayName(randomDisplayName());
    setColorIdx(randInt(COVER_COLORS.length));
    setElement(ELEMENTS[randInt(ELEMENTS.length)].id);
    setInitialized(true);
  }, [ready, auth, initialized, router]);

  // The avatar is derived deterministically from the display name as it's
  // typed — same name always yields the same mesh + palette.
  const avatarVariant = useMemo(
    () => avatarVariantFromText(displayName.trim() || pubkey),
    [displayName, pubkey],
  );
  const avatarUri = useMemo(
    () =>
      svgToDataUri(
        lowpolyAvatarSvg(avatarVariant.seed, avatarVariant.palette),
      ),
    [avatarVariant],
  );
  const coverUri = useMemo(
    () =>
      pubkey ? svgToDataUri(lowpolyCoverSvg(colorIdx, element, pubkey)) : "",
    [pubkey, colorIdx, element],
  );

  // What the user actually sees / will publish: an uploaded image wins over
  // the generated one.
  const effectiveAvatar = customPicture ?? avatarUri;
  const effectiveCover = customBanner ?? coverUri;

  // Focus the name field whenever step 1 is shown.
  useEffect(() => {
    if (step === 1 && initialized) {
      const t = window.setTimeout(() => nameRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [step, initialized]);

  const busy =
    phase === "rasterizing" || phase === "uploading" || phase === "publishing";

  async function handleFinish() {
    if (!auth || busy) return;
    setError(null);
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      // Rasterise + upload only the generated images the user kept (uploaded
      // custom images already have a Blossom URL).
      setPhase("rasterizing");
      const toUpload: { target: "avatar" | "cover"; file: File }[] = [];
      if (!customPicture) {
        const avatarSvg = lowpolyAvatarSvg(
          avatarVariant.seed,
          avatarVariant.palette,
        );
        const avatarPng = await svgToPngBlob(avatarSvg, 400, 400);
        toUpload.push({
          target: "avatar",
          file: new File([avatarPng], "avatar.png", { type: "image/png" }),
        });
      }
      if (!customBanner) {
        const coverSvg = lowpolyCoverSvg(colorIdx, element, pubkey);
        const coverPng = await svgToPngBlob(coverSvg, 1500, 500);
        toUpload.push({
          target: "cover",
          file: new File([coverPng], "cover.png", { type: "image/png" }),
        });
      }

      signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({
            kind: "info",
            title: "Autorizá la firma en tu firmante",
            description: url,
            duration: 20000,
          });
        },
      });

      let pictureUrl = customPicture;
      let bannerUrl = customBanner;
      if (toUpload.length) {
        setPhase("uploading");
        for (const item of toUpload) {
          setPhaseDetail(item.target === "avatar" ? "avatar" : "portada");
          const desc = await uploadToBlossom(item.file, signer);
          if (item.target === "avatar") pictureUrl = desc.url;
          else bannerUrl = desc.url;
        }
      }

      setPhase("publishing");
      const name = displayName.trim();
      await publishNostrProfile(signer, {
        display_name: name,
        name: slugifyName(name),
        picture: pictureUrl ?? undefined,
        banner: bannerUrl ?? undefined,
      });

      setPhase("success");
      pushToast({
        kind: "success",
        title: "¡Perfil listo!",
        description: "Tu avatar y portada quedaron publicados.",
      });
      router.replace(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPhase("error");
      setError(msg);
      pushToast({
        kind: "error",
        title: "No se pudo crear el perfil",
        description: msg.split("\n")[0],
        duration: 12000,
      });
    } finally {
      signer?.close?.().catch(() => {});
    }
  }

  if (!ready || !initialized) {
    return (
      <main className="min-h-screen px-6 pt-28 pb-16">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-background-card/80 p-8 text-center shadow-xl">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-bitcoin" />
          <h1 className="mt-4 font-display text-2xl font-bold">
            Preparando tu perfil…
          </h1>
        </div>
      </main>
    );
  }

  const finishLabel =
    phase === "rasterizing"
      ? "Generando imágenes…"
      : phase === "uploading"
        ? `Subiendo ${phaseDetail ?? "imágenes"}…`
        : phase === "publishing"
          ? "Publicando perfil…"
          : phase === "success"
            ? "¡Listo!"
            : "Finalizar";

  return (
    <main className="min-h-screen px-4 pt-24 pb-16 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Logo variant="mark" className="h-10 w-10" />
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold leading-tight">
              Creá tu perfil
            </h1>
            <p className="text-sm text-foreground-muted">
              Ya está todo elegido al azar — ajustá lo que quieras y seguí.
            </p>
          </div>
          <span className="rounded-full border border-border bg-white/[0.03] px-3 py-1 font-mono text-xs text-foreground-muted">
            Paso {step}/2
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-bitcoin to-nostr"
            initial={false}
            animate={{ width: step === 1 ? "50%" : "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 260 }}
          />
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-background-card/80 shadow-xl">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-bitcoin/5 via-transparent to-nostr/5" />

          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="relative p-6"
              >
                <h2 className="font-display text-lg font-bold">Tu identidad</h2>
                <p className="mb-6 text-sm text-foreground-muted">
                  Elegí tu nombre — tu avatar se genera solo.
                </p>

                {/* Deterministic avatar preview, generated from the name */}
                <div className="mb-6 flex flex-col items-center gap-4">
                  <div className="h-28 w-28 overflow-hidden rounded-2xl border border-border-strong bg-black/40 shadow-lg">
                    {avatarUri && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUri}
                        alt="Avatar"
                        className="h-full w-full"
                      />
                    )}
                  </div>

                  <form
                    className="w-full"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (displayName.trim()) setStep(2);
                    }}
                  >
                    <span className="mb-1.5 block text-xs font-medium text-foreground-muted">
                      Nombre para mostrar
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        ref={nameRef}
                        type="text"
                        value={displayName}
                        maxLength={48}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Tu nombre"
                        autoFocus
                        className="w-full rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-sm transition-colors placeholder:text-foreground-subtle focus:border-bitcoin/50 focus:bg-white/[0.05]"
                      />
                      <button
                        type="button"
                        onClick={() => setDisplayName(randomDisplayName())}
                        title="Sortear nombre"
                        className="shrink-0 rounded-xl border border-border bg-white/[0.03] p-3 text-foreground-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!displayName.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 px-6 py-3 text-sm font-bold text-black transition-all hover:shadow-lg hover:shadow-bitcoin/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Siguiente
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="relative p-6"
              >
                <h2 className="font-display text-lg font-bold">Tu portada</h2>
                <p className="mb-4 text-sm text-foreground-muted">
                  Elegí un color o subí tu propia imagen.
                </p>

                {/* Profile preview — banner + avatar are clickable uploaders */}
                <div className="mb-5 overflow-hidden rounded-xl border border-border-strong">
                  <BannerUploader
                    src={effectiveCover}
                    uploading={upload.uploadingTarget === "banner"}
                    disabled={busy || upload.uploadingTarget !== null}
                    onPick={() => bannerInputRef.current?.click()}
                    reveal={
                      upload.reveal?.target === "banner"
                        ? {
                            localUrl: upload.reveal.localUrl,
                            percent: upload.reveal.percent,
                            fading: upload.reveal.fading,
                          }
                        : null
                    }
                  />
                  <div className="flex items-center gap-3 bg-background-card px-4 pb-3 pt-3">
                    <div className="-mt-12 shrink-0">
                      <AvatarUploader
                        src={effectiveAvatar}
                        name={displayName}
                        uploading={upload.uploadingTarget === "picture"}
                        disabled={busy || upload.uploadingTarget !== null}
                        onPick={() => avatarInputRef.current?.click()}
                        reveal={
                          upload.reveal?.target === "picture"
                            ? {
                                localUrl: upload.reveal.localUrl,
                                percent: upload.reveal.percent,
                                fading: upload.reveal.fading,
                              }
                            : null
                        }
                      />
                    </div>
                    <div className="min-w-0 font-display font-bold">
                      {displayName}
                    </div>
                  </div>
                </div>

                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (file) upload.pickedFile("picture", file);
                  }}
                />
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (file) upload.pickedFile("banner", file);
                  }}
                />

                {/* Colors — picking one reverts to the generated cover */}
                <span className="mb-2 block text-xs font-medium text-foreground-muted">
                  Color de portada generada
                </span>
                <div className="mb-2 flex flex-wrap gap-2.5">
                  {COVER_COLORS.map((c, i) => {
                    const active = !customBanner && i === colorIdx;
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => {
                          setColorIdx(i);
                          setCustomBanner(null);
                        }}
                        title={c.label}
                        aria-label={c.label}
                        className={cn(
                          "h-9 w-9 rounded-full border-2 transition-transform hover:scale-110",
                          active
                            ? "border-foreground ring-2 ring-foreground/30"
                            : "border-white/20",
                        )}
                        style={{ backgroundColor: c.hex }}
                      />
                    );
                  })}
                </div>
                {customBanner && (
                  <p className="mb-2 text-xs text-foreground-subtle">
                    Estás usando una portada subida. Elegí un color para volver
                    a la generada.
                  </p>
                )}

                {error && (
                  <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error.split("\n")[0]}
                  </div>
                )}

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-sm font-semibold text-foreground-muted transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Atrás
                  </button>
                  <button
                    type="button"
                    onClick={handleFinish}
                    disabled={busy || phase === "success" || !displayName.trim()}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 px-6 py-3 text-sm font-bold text-black transition-all hover:shadow-lg hover:shadow-bitcoin/30 disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none"
                  >
                    {busy || phase === "success" ? (
                      phase === "success" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {finishLabel}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-4 text-center text-xs text-foreground-subtle">
          Vas a poder cambiar todo más tarde desde tu dashboard.
        </p>
      </div>

      <ImageCropModal
        open={upload.cropSource !== null}
        file={upload.cropSource?.file ?? null}
        aspect={upload.cropSource?.target === "banner" ? 3 : 1}
        title={
          upload.cropSource?.target === "banner"
            ? "Recortá tu portada"
            : "Recortá tu avatar"
        }
        hint={upload.cropSource?.target === "banner" ? "Portada 3:1" : "Avatar 1:1"}
        maxOutputPx={upload.cropSource?.target === "banner" ? 1500 : 1024}
        outputType="image/jpeg"
        onConfirm={upload.handleCropConfirm}
        onCancel={upload.cancelCrop}
      />
    </main>
  );
}
