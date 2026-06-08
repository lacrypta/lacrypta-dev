"use client";

/**
 * Browser helpers to turn an SVG string into something uploadable.
 *
 * Blossom stores image blobs, so generated low-poly SVGs are rasterised to a
 * PNG before upload. `svgToDataUri` is the cheap path for inline `<img>`
 * previews in the wizard.
 */

/** Inline an SVG string as a data URI (for `<img src>` previews). */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Rasterise an SVG string to a PNG blob at the requested pixel size by
 * drawing it onto an offscreen canvas. Rejects if the browser cannot decode
 * the SVG or produce a blob.
 */
export function svgToPngBlob(
  svg: string,
  width: number,
  height: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo crear el contexto 2D del canvas."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("No se pudo generar el PNG."));
          },
          "image/png",
        );
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error("No se pudo decodificar el SVG."));
    img.src = svgToDataUri(svg);
  });
}
