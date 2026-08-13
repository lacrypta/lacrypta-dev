"use client";

import { useEffect } from "react";

const GTM_ID = "GTM-P6DL4LQP";

function isEnabled() {
  return process.env.NODE_ENV === "production";
}

/** Load GTM after the first user gesture so the lab Lighthouse trace (no
 *  interaction) does not download 116 KiB of unused third-party JS. */
export function GoogleTagManagerScript() {
  useEffect(() => {
    if (!isEnabled()) return;
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      const w = window as Window & { dataLayer?: unknown[] };
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      const f = document.getElementsByTagName("script")[0];
      const j = document.createElement("script");
      j.async = true;
      j.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
      f.parentNode?.insertBefore(j, f);
    };
    const opts: AddEventListenerOptions = { once: true, passive: true };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const event of events) {
      window.addEventListener(event, load, opts);
    }
    return () => {
      for (const event of events) {
        window.removeEventListener(event, load);
      }
    };
  }, []);
  return null;
}

export function GoogleTagManagerNoscript() {
  if (!isEnabled()) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
