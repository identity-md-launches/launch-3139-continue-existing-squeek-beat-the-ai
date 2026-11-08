import type { Settlement } from "./types";
// Deliberately fixed fixtures. They never enter the live feed or live score.
export function practiceSettlement(round: number, now: number): Settlement {
  const scenarios = [
    { workAdded: "0", completedBlockCount: 0 },
    { workAdded: "44", completedBlockCount: 6 },
    { workAdded: "880", completedBlockCount: 78 },
  ];
  const s = scenarios[(round - 1) % scenarios.length];
  return {
    ...s,
    transactionHash: `0x${round.toString(16).padStart(64, "0")}`,
    previousSettledThroughRound: round - 1,
    settledThroughRound: round,
    activeRoundCount: s.workAdded === "0" ? 0 : 1,
    blockTimestamp: new Date(now).toISOString(),
  };
}
