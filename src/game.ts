import {
  BRACKETS,
  type AiPick,
  type Bracket,
  type Call,
  type Entry,
  type GameState,
  type Pick,
  type RoundWindow,
  type Score,
  type Settlement,
  type Status,
} from "./types";

export const ROUND_MS = 600_000;
export const WEEK_MS = 7 * 24 * 60 * 60_000;
export type DistanceObservation = {
  round: number;
  baseline: number;
  last: number;
  epoch: string;
  interrupted: boolean;
};
export function observeDistance(
  previous: DistanceObservation | null,
  round: number,
  distanceMm: number,
  epoch: string,
): DistanceObservation {
  if (!previous || previous.round !== round)
    return {
      round,
      baseline: distanceMm,
      last: distanceMm,
      epoch,
      interrupted: false,
    };
  return {
    ...previous,
    last: distanceMm,
    epoch,
    interrupted:
      previous.interrupted ||
      previous.epoch !== epoch ||
      distanceMm < previous.last,
  };
}
export function openRound(status: Status | null): number | null {
  const value =
    status?.builder.status === "available"
      ? status.builder.anchor?.settledThroughRound
      : undefined;
  if (!value || !/^\d+$/.test(value)) return null;
  const round = Number(value) + 1;
  return Number.isSafeInteger(round) ? round : null;
}
export function bracketOf(blocks: number): Bracket | null {
  return blocks < 1
    ? null
    : blocks <= 10
      ? "1-10"
      : blocks <= 30
        ? "11-30"
        : blocks <= 60
          ? "31-60"
          : "61+";
}
export function outcome(s: Settlement): Call {
  return BigInt(s.workAdded) > 0n ? "SPRINT" : "NAP";
}
export function scorePick(
  pick: Pick,
  s: Settlement,
  previousStreak: number,
): Score {
  const correct = pick.call === outcome(s);
  const streak = correct ? previousStreak + 1 : 0;
  const exactBracket =
    correct &&
    pick.call === "SPRINT" &&
    pick.bracket !== null &&
    pick.bracket === bracketOf(s.completedBlockCount);
  const base = correct ? 10 : 0;
  const bracket = exactBracket ? 15 : 0;
  // The first correct call starts the streak: 5, 10, 15… bonus points.
  const bonus = correct ? 5 * streak : 0;
  return {
    total: base + bracket + bonus,
    base,
    bracket,
    bonus,
    streak,
    correct,
    exactBracket,
  };
}
export function mergeSettlements(...groups: Settlement[][]): Settlement[] {
  const map = new Map<string, Settlement>();
  for (const s of groups.flat())
    map.set(`${s.transactionHash}:${s.settledThroughRound}`, s);
  return [...map.values()].sort(
    (a, b) => a.settledThroughRound - b.settledThroughRound,
  );
}
export function trainingRounds(history: Settlement[], now: number) {
  // Mixed multi-round positive batches cannot identify any individual round's outcome.
  // Exclude those. A zero-work span does establish a NAP for every covered round.
  return history
    .filter(
      (s) =>
        Date.parse(s.blockTimestamp) <= now &&
        Date.parse(s.blockTimestamp) >= now - WEEK_MS,
    )
    .flatMap((s) => {
      const span = s.settledThroughRound - s.previousSettledThroughRound;
      if (span === 1)
        return [
          {
            round: s.settledThroughRound,
            at: Date.parse(s.blockTimestamp),
            call: outcome(s),
            blocks: s.completedBlockCount,
          },
        ];
      if (s.workAdded !== "0" || span > 2000) return [];
      return Array.from({ length: span }, (_, i) => ({
        round: s.previousSettledThroughRound + i + 1,
        at: Date.parse(s.blockTimestamp),
        call: "NAP" as Call,
        blocks: 0,
      }));
    })
    .filter((r) => r.at >= now - WEEK_MS && r.at <= now)
    .sort((a, b) => a.round - b.round);
}
export function predict(history: Settlement[], now: number): AiPick {
  const rows = trainingRounds(history, now);
  const hour = new Date(now).getUTCHours();
  const matching = rows.filter((r) => new Date(r.at).getUTCHours() === hour);
  const sample = matching.length ? matching : rows;
  const hourProbability = sample.length
    ? sample.filter((r) => r.call === "SPRINT").length / sample.length
    : 0.5;
  const last = rows.slice(-3);
  const momentum = last.length
    ? last.filter((r) => r.call === "SPRINT").length / last.length
    : hourProbability;
  const probability = 0.7 * hourProbability + 0.3 * momentum;
  const sprints = (
    matching.filter((r) => r.call === "SPRINT").length ? matching : rows
  ).filter((r) => r.call === "SPRINT" && bracketOf(r.blocks));
  const counts = BRACKETS.map(
    (b) => sprints.filter((r) => bracketOf(r.blocks) === b).length,
  );
  const bracket = BRACKETS[counts.indexOf(Math.max(...counts))];
  return {
    call: probability >= 0.5 ? "SPRINT" : "NAP",
    bracket: probability >= 0.5 ? bracket : null,
    probability,
    hourProbability,
    momentum,
    lastThree: last.map((r) => r.call),
    samples: rows.length,
    hourSamples: matching.length,
    bracketSamples: sprints.length,
    hour,
    fallback: matching.length === 0,
  };
}
export function feedHealth(
  status: Status | null,
  fetchedAt: number,
  failed: boolean,
  now: number,
): "live" | "offline" | "unknown" {
  if (failed) return "offline";
  const m = status?.measurement;
  if (
    !m ||
    m.freshness !== "online" ||
    m.provenance !== "hardware" ||
    m.coreStatus === "COUNTER_FAULT"
  )
    return "unknown";
  const age = now - Date.parse(m.receivedAt);
  const generatedAge = now - Date.parse(status!.generatedAt);
  if (
    !Number.isFinite(age) ||
    age < -30_000 ||
    age > m.staleAfterSeconds * 1000 ||
    generatedAge < -30_000 ||
    generatedAge > 120_000 ||
    now - fetchedAt > 30_000
  )
    return "unknown";
  return "live";
}
export function roundTiming(
  status: Status | null,
  settlements: Settlement[],
  now: number,
  window?: RoundWindow,
) {
  const round = openRound(status);
  const closure = status?.oracle.latestClosure;
  // Derive the configured round origin from documented mining.nextRound times.
  // Oracle acceptance and Ethereum timestamps are not round boundaries.
  const verifiedClose =
    !!window &&
    Number.isSafeInteger(Number(window.round)) &&
    Date.parse(window.endsAt) - Date.parse(window.startsAt) === ROUND_MS;
  const closesAt =
    round !== null && verifiedClose
      ? Date.parse(window!.endsAt) + (round - Number(window!.round)) * ROUND_MS
      : NaN;
  const closed =
    round === null ||
    !Number.isFinite(closesAt) ||
    closesAt <= now ||
    (!!closure && Number(closure.lastRound) >= round) ||
    Number(status?.settlementQueue.buffered?.lastRound ?? -1) >= round ||
    // A submitted (not yet confirmed) settlement already covers this round.
    Number(status?.settlementQueue.latestSubmission?.settledThroughRound ?? -1) >=
      round;
  const sorted = [...settlements].sort(
    (a, b) => Date.parse(b.blockTimestamp) - Date.parse(a.blockTimestamp),
  );
  const spacing = sorted
    .slice(0, 12)
    .slice(1)
    .map(
      (s, i) =>
        Date.parse(sorted[i].blockTimestamp) - Date.parse(s.blockTimestamp),
    )
    .filter((n) => n > 0 && n < 3_600_000);
  const median = spacing.length
    ? [...spacing].sort((a, b) => a - b)[Math.floor(spacing.length / 2)]
    : 750_000;
  const interval = Math.min(900_000, Math.max(600_000, median));
  const last = sorted[0] ? Date.parse(sorted[0].blockTimestamp) : NaN;
  const expectedAt = Number.isFinite(last)
    ? Math.max(last + interval, closesAt + 36_000)
    : closesAt + 120_000;
  return { round, closesAt, closed, expectedAt, interval, verifiedClose };
}
export function resolveEntries(
  state: GameState,
  settlements: Settlement[],
  now: number,
  onlyMode?: "live" | "practice",
): GameState {
  let changed = false;
  const entries = state.entries.map((e) => ({ ...e }));
  for (const mode of ["live", "practice"] as const) {
    if (onlyMode && mode !== onlyMode) continue;
    let ps = 0,
      ais = 0;
    const ordered = entries
      .filter((e) => e.mode === mode)
      .sort((a, b) => a.round - b.round);
    for (const entry of ordered) {
      if (entry.result) {
        ps = entry.result.player.streak;
        ais = entry.result.ai.streak;
        continue;
      }
      const s = settlements.find(
        (s) =>
          s.previousSettledThroughRound < entry.round &&
          s.settledThroughRound >= entry.round &&
          Date.parse(s.blockTimestamp) > Date.parse(entry.lockedAt) &&
          Date.parse(s.blockTimestamp) <= now,
      );
      if (!s) break; // Resolve in order so unresolved rounds cannot change a future streak.
      const player = scorePick(entry.pick, s, ps),
        ai = scorePick(entry.ai, s, ais);
      const friend = entry.friend ? scorePick(entry.friend, s, 0) : undefined;
      const duelPlayer = entry.friend ? scorePick(entry.pick, s, 0) : undefined;
      entry.result = {
        settlement: s,
        player,
        ai,
        friend,
        duelPlayer,
        won: player.total > ai.total,
        resolvedAt: new Date(now).toISOString(),
      };
      ps = player.streak;
      ais = ai.streak;
      changed = true;
    }
  }
  return changed ? { ...state, entries } : state;
}
export function weekStart(now: number) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime();
}
export function totals(entries: Entry[], since = 0) {
  return entries.reduce(
    (acc, e) => {
      if (e.result && Date.parse(e.result.settlement.blockTimestamp) >= since) {
        acc.player += e.result.player.total;
        acc.ai += e.result.ai.total;
        acc.rounds++;
      }
      return acc;
    },
    { player: 0, ai: 0, rounds: 0 },
  );
}
export const ACHIEVEMENTS = [
  ["first", "First Call", "Lock your first prediction.", "flag"],
  [
    "night",
    "Night Owl",
    "A correct call settled between 00:00 and 05:00 UTC.",
    "moon",
  ],
  ["hat", "Hat Trick", "Get 3 calls right in a row.", "flame"],
  ["ten", "Ten Streak", "Get 10 calls right in a row.", "zap"],
  ["bracket", "Bracket Master", "Predict 5 exact block brackets.", "target"],
  [
    "professor",
    "Beat the Professor",
    "Finish a UTC week ahead of the AI.",
    "graduation",
  ],
  ["duel", "Duelist", "Win a shared friend duel.", "swords"],
  ["collector", "Collector", "Collect 10 settlement artworks.", "image"],
  ["sleep", "Sleep Whisperer", "Correctly predict 5 naps.", "cloud"],
] as const;
export function earnedAchievements(
  state: GameState,
  mode: "live" | "practice",
  now: number,
) {
  const entries = state.entries.filter((e) => e.mode === mode),
    results = entries.filter((e) => e.result);
  const correct = results.filter((e) => e.result!.player.correct);
  const previousWeeks = [
    ...new Set(
      results.map((e) =>
        weekStart(Date.parse(e.result!.settlement.blockTimestamp)),
      ),
    ),
  ].filter((w) => w < weekStart(now));
  return [
    entries.length > 0,
    correct.some(
      (e) => new Date(e.result!.settlement.blockTimestamp).getUTCHours() < 5,
    ),
    correct.some((e) => e.result!.player.streak >= 3),
    correct.some((e) => e.result!.player.streak >= 10),
    results.filter((e) => e.result!.player.exactBracket).length >= 5,
    previousWeeks.some((w) => {
      const t = totals(
        entries.filter(
          (e) =>
            e.result &&
            Date.parse(e.result.settlement.blockTimestamp) < w + WEEK_MS,
        ),
        w,
      );
      return t.player > t.ai;
    }),
    results.some(
      (e) =>
        e.result!.friend &&
        e.result!.duelPlayer &&
        e.result!.duelPlayer.total > e.result!.friend.total,
    ),
    state.collection.filter((i) => i.mode === mode).length >= 10,
    correct.filter((e) => outcome(e.result!.settlement) === "NAP").length >= 5,
  ].flatMap((yes, i) => (yes ? [ACHIEVEMENTS[i][0]] : []));
}
export type Duel = {
  version: 1;
  round: number;
  pick: Pick;
  installationId: string;
  closesAt: number;
};
export function encodeDuel(duel: Duel) {
  const bytes = new TextEncoder().encode(JSON.stringify(duel));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function decodeDuel(value: string): Duel | null {
  try {
    if (value.length > 1000) return null;
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
    const d = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (c) => c.charCodeAt(0)),
      ),
    );
    if (
      d.version !== 1 ||
      !Number.isSafeInteger(d.round) ||
      d.round < 1 ||
      !Number.isFinite(d.closesAt) ||
      typeof d.installationId !== "string" ||
      d.installationId.length > 128 ||
      !["NAP", "SPRINT"].includes(d.pick.call) ||
      (d.pick.call === "NAP"
        ? d.pick.bracket !== null
        : !BRACKETS.includes(d.pick.bracket))
    )
      return null;
    return d;
  } catch {
    return null;
  }
}
export const EMPTY_STATE: GameState = {
  version: 1,
  entries: [],
  collection: [],
  achievements: {},
};

/** Highest round whose settlement Ethereum has confirmed, per /v1/status. */
export function confirmedThrough(status: Status | null): number | null {
  const v =
    status?.builder.status === "available"
      ? status.builder.anchor?.settledThroughRound
      : undefined;
  return v && /^\d+$/.test(v) ? Number(v) : null;
}
/**
 * Only confirmed settlements may resolve calls. Events are already filtered to
 * `safe` chain confirmations; when /v1/status is known, anything beyond its
 * confirmed anchor, or matching a submission that is not yet confirmed, waits.
 */
export function confirmedSettlements(
  settlements: Settlement[],
  status: Status | null,
): Settlement[] {
  const through = confirmedThrough(status);
  const sub = status?.settlementQueue.latestSubmission;
  const unconfirmedTx =
    sub && sub.lifecycle !== "confirmed" ? sub.transactionHash : null;
  return settlements.filter(
    (s) =>
      (through === null || s.settledThroughRound <= through) &&
      (!unconfirmedTx || s.transactionHash !== unconfirmedTx),
  );
}
export type PendingRange = {
  first: number;
  last: number;
  stage: "submitted" | "queued" | "closed";
  at: string | null;
};
/** Confirmed and pending rounds, kept apart. Pending rounds are never scored. */
export function settlementLedger(status: Status | null) {
  const through = confirmedThrough(status);
  const pending: PendingRange[] = [];
  if (through === null)
    return { through, confirmedAt: null as string | null, pending };
  let covered = through;
  const sub = status!.settlementQueue.latestSubmission;
  const subLast = Number(sub?.settledThroughRound ?? NaN);
  if (sub && sub.lifecycle !== "confirmed" && subLast > covered) {
    pending.push({
      first: Math.max(covered, Number(sub.previousSettledThroughRound)) + 1,
      last: subLast,
      stage: "submitted",
      at: sub.submittedAt ?? sub.changedAt ?? null,
    });
    covered = subLast;
  }
  const bufLast = Number(status!.settlementQueue.buffered?.lastRound ?? NaN);
  if (bufLast > covered) {
    pending.push({ first: covered + 1, last: bufLast, stage: "queued", at: null });
    covered = bufLast;
  }
  const closure = status!.oracle.latestClosure;
  const closedLast = Number(closure?.lastRound ?? NaN);
  if (closedLast > covered) {
    pending.push({
      first: covered + 1,
      last: closedLast,
      stage: "closed",
      at: closure?.acceptedAt ?? null,
    });
  }
  return {
    through,
    confirmedAt: status!.builder.anchor?.confirmedAt ?? null,
    pending,
  };
}
/** The Professor's reasoning in one plain sentence, from the same inputs he used. */
export function explainAi(ai: AiPick): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  if (ai.samples === 0)
    return `I have no settled rounds from the last week yet, so I start from an even 50/50 guess and call ${ai.call === "NAP" ? "a nap" : "a 1–10 block sprint"}.`;
  const where = ai.fallback
    ? `Across the last week (nothing settled at ${String(ai.hour).padStart(2, "0")}:00 UTC yet)`
    : `At ${String(ai.hour).padStart(2, "0")}:00 UTC over the last week`;
  const recent = ai.lastThree.length
    ? `${ai.lastThree.filter((c) => c === "SPRINT").length} of the last ${ai.lastThree.length} rounds were sprints`
    : "I have no recent rounds";
  const verdict =
    ai.call === "SPRINT"
      ? `so I call a sprint of ${(ai.bracket ?? "1-10").replace("-", "–")} blocks, the most common sprint size I have seen.`
      : "so I call a nap.";
  return `${where}, the hamster sprinted in ${pct(ai.hourProbability)} of rounds and ${recent}. That makes ${pct(ai.probability)} sprint odds, ${verdict}`;
}
