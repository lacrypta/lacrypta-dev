"use client";

/**
 * Reusable avatar/banner upload flow with the same live progress reveal used
 * by the dashboard profile editor: crop → sign Blossom auth → upload (real XHR
 * progress) → fetch the blob back from the CDN (warms the cache) → hand the
 * remote URL to the consumer and fade the overlay out.
 *
 * The consumer renders <ImageCropModal>, <AvatarUploader>/<BannerUploader>
 * (from components/) and wires them to the values returned here.
 */

import { useEffect, useRef, useState } from "react";
import type { Auth } from "./auth";
import {
  fetchBlobWithProgress,
  uploadToBlossom,
} from "./blossom";
import { getSigner } from "./nostrSigner";

export type UploadTarget = "picture" | "banner";

export type UploadReveal = {
  target: UploadTarget;
  localUrl: string;
  /** 0..100 */
  percent: number;
  fading?: boolean;
};

type CropResult = { blob: Blob; filename: string; type: string };

export function useBlossomUpload(
  auth: Auth | null,
  opts: {
    onUploaded: (target: UploadTarget, url: string) => void;
    onAuthUrl?: (url: string) => void;
    onError?: (msg: string) => void;
  },
) {
  const [cropSource, setCropSource] = useState<{
    target: UploadTarget;
    file: File;
  } | null>(null);
  const [uploadingTarget, setUploadingTarget] = useState<UploadTarget | null>(
    null,
  );
  const [reveal, setReveal] = useState<UploadReveal | null>(null);

  // Mirror cropSource so the confirm callback reads the latest value even
  // under React Strict Mode double-invocation.
  const cropSourceRef = useRef(cropSource);
  useEffect(() => {
    cropSourceRef.current = cropSource;
  }, [cropSource]);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Tracks the in-flight blob URL so the unmount cleanup can revoke it
  // directly (a setReveal updater may be skipped after unmount).
  const localUrlRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (localUrlRef.current) {
        URL.revokeObjectURL(localUrlRef.current);
        localUrlRef.current = null;
      }
    },
    [],
  );

  function pickedFile(target: UploadTarget, file: File) {
    if (!file.type.startsWith("image/")) {
      optsRef.current.onError?.("Solo imágenes (JPG, PNG, WebP, GIF).");
      return;
    }
    setCropSource({ target, file });
  }

  function cancelCrop() {
    setCropSource(null);
  }

  function handleCropConfirm(result: CropResult) {
    const current = cropSourceRef.current;
    setCropSource(null);
    if (!current) return;
    const file = new File([result.blob], result.filename, {
      type: result.type,
    });
    void doUpload(current.target, file);
  }

  async function doUpload(target: UploadTarget, file: File) {
    if (!auth) return;
    setUploadingTarget(target);
    // The cropped blob is local immediately — start the reveal at 0%.
    const localUrl = URL.createObjectURL(file);
    localUrlRef.current = localUrl;
    setReveal({ target, localUrl, percent: 0 });
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth, { onAuthUrl: optsRef.current.onAuthUrl });

      // 0–65% = bytes uploading to Blossom · 65–100% = fetching back from CDN.
      const UPLOAD_SHARE = 65;
      const desc = await uploadToBlossom(file, signer, {
        onProgress: (p) => {
          if (p.state === "uploading" && typeof p.percent === "number") {
            setReveal((prev) =>
              prev && prev.target === target
                ? {
                    ...prev,
                    percent: Math.min(
                      UPLOAD_SHARE,
                      Math.round(p.percent! * UPLOAD_SHARE),
                    ),
                  }
                : prev,
            );
          }
        },
      });
      setReveal((prev) =>
        prev && prev.target === target
          ? { ...prev, percent: UPLOAD_SHARE }
          : prev,
      );

      // Best-effort warm of the HTTP cache so the <img> swap is flicker-free.
      try {
        await fetchBlobWithProgress(desc.url, (p) => {
          if (typeof p.percent === "number") {
            const ui =
              UPLOAD_SHARE + Math.round(p.percent * (100 - UPLOAD_SHARE));
            setReveal((prev) =>
              prev && prev.target === target ? { ...prev, percent: ui } : prev,
            );
          }
        });
      } catch {
        /* CDN CORS / hiccup — the URL is published regardless */
      }
      setReveal((prev) =>
        prev && prev.target === target ? { ...prev, percent: 100 } : prev,
      );

      // Pre-decode so the consumer's <img src> swap lands on painted pixels.
      await new Promise<void>((resolve) => {
        const pre = new Image();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        pre.onload = done;
        pre.onerror = done;
        window.setTimeout(done, 4000);
        pre.src = desc.url;
      });

      optsRef.current.onUploaded(target, desc.url);

      // Fade the overlay out, then unmount it.
      await new Promise<void>((res) => window.setTimeout(res, 80));
      setReveal((prev) =>
        prev && prev.target === target ? { ...prev, fading: true } : prev,
      );
      await new Promise<void>((res) => window.setTimeout(res, 380));
      setReveal((prev) => (prev && prev.target === target ? null : prev));
      URL.revokeObjectURL(localUrl);
      if (localUrlRef.current === localUrl) localUrlRef.current = null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      optsRef.current.onError?.(msg);
      setReveal((prev) => (prev && prev.target === target ? null : prev));
      URL.revokeObjectURL(localUrl);
      if (localUrlRef.current === localUrl) localUrlRef.current = null;
    } finally {
      signer?.close?.().catch(() => {});
      setUploadingTarget(null);
    }
  }

  return {
    pickedFile,
    cropSource,
    cancelCrop,
    handleCropConfirm,
    reveal,
    uploadingTarget,
  };
}
