"use client";

import dynamic from "next/dynamic";
import animationData from "./animations/brokenCable.json";

const Lottie = dynamic(() => import("lottie-react"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full" aria-hidden="true" role="presentation" />
  ),
});

export default function BrokenCableAnimation({
  className,
  ariaLabel = "Cable cortado",
}: {
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <Lottie
        animationData={animationData}
        loop
        autoplay
        rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
