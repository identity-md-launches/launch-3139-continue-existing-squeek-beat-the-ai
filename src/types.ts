export type Call = "NAP" | "SPRINT";
export type Bracket = "1-10" | "11-30" | "31-60" | "61+";
export const BRACKETS: Bracket[] = ["1-10", "11-30", "31-60", "61+"];
export type Pick = { call: Call; bracket: Bracket | null };
export type Settlement = {
  transactionHash: string;
  previousSettledThroughRound: number;
  settledThroughRound: number;
  workAdded: string;
  completedBlockCount: number;
  blockTimestamp: string;
  activeRoundCount: number;
};
export type Measurement = {
  freshness: string;
  observedAt: string;
  receivedAt: string;
  staleAfterSeconds: number;
  provenance: string;
  coreStatus: string;
  rpmMilli: number;
  speedMmPerSecond: number;
  distanceMm: number;
  counterEpoch: string;
};
export type Status = {
  schemaVersion: 1;
  installationId: string;
  generatedAt: string;
  measurement: Measurement | null;
  builder: {
    status: string;
    anchor?: {
      settledThroughRound: string;
      blockHeight: string;
      blockProgress: string;
      confirmedAt: string | null;
    };
    queued?: { openRoundWorkUnits: string };
  };
  oracle: {
    state: string;
    latestClosure: { lastRound: string; acceptedAt: string } | null;
  };
  settlementQueue: {
    status: string;
    state?: string;
    buffered?: {
      firstRound?: string | null;
      lastRound: string | null;
      roundCount?: string;
    };
    latestSubmission?: Submission | null;
  };
};
export type Submission = {
  lifecycle: string;
  previousSettledThroughRound: string;
  settledThroughRound: string;
  roundCount?: string;
  transactionHash?: string | null;
  submittedAt?: string | null;
  confirmedAt?: string | null;
  changedAt?: string | null;
};
export type Bucket = {
  startAt: string;
  endAt: string;
  settlementCount: string;
  activeRoundCount: string;
  workAdded: string;
  completedBlockCount: string;
};
export type RoundWindow = { round: string; startsAt: string; endsAt: string };
export type History = {
  installationId: string;
  generatedAt: string;
  range: string;
  buckets: Bucket[];
  recentSettlements: Settlement[];
  nextRound?: RoundWindow;
};
export type AiPick = Pick & {
  probability: number;
  hourProbability: number;
  momentum: number;
  lastThree: Call[];
  samples: number;
  hourSamples: number;
  bracketSamples: number;
  hour: number;
  fallback: boolean;
};
export type Score = {
  total: number;
  base: number;
  bracket: number;
  bonus: number;
  streak: number;
  correct: boolean;
  exactBracket: boolean;
};
export type Result = {
  settlement: Settlement;
  player: Score;
  ai: Score;
  friend?: Score;
  duelPlayer?: Score;
  won: boolean;
  resolvedAt: string;
};
export type Entry = {
  round: number;
  pick: Pick;
  ai: AiPick;
  lockedAt: string;
  closesAt: number;
  installationId: string;
  mode: "live" | "practice";
  friend?: Pick;
  result?: Result;
};
export type CollectionItem = {
  key: string;
  settlement: Settlement;
  collectedAt: string;
  mode: "live" | "practice";
};
export type GameState = {
  version: 1;
  entries: Entry[];
  collection: CollectionItem[];
  achievements: Record<string, string>;
};
export type Feed = {
  status: Status | null;
  history: History | null;
  settlements: Settlement[];
  statusError: string | null;
  historyError: string | null;
  eventsError: string | null;
  statusAt: number;
  historyAt: number;
  eventsAt: number;
  eventsInstallationId: string | null;
  historyComplete: boolean;
  retryAt: number;
  loading: boolean;
};
