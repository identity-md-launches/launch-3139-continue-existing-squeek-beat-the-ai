import { useEffect, useRef } from "react";
import { drawArt } from "./art";
import type { Settlement } from "./types";

export function ArtCanvas({
  settlement,
  size = 360,
}: {
  settlement: Settlement;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawArt(ref.current, settlement);
  }, [settlement, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      role="img"
      aria-label={`${settlement.workAdded === "0" ? "Calm night sky" : "Energetic generative swirls"} for settled round ${settlement.settledThroughRound}. Seeded by its transaction hash.`}
    />
  );
}
