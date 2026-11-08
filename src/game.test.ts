import test from "node:test";
import assert from "node:assert/strict";
import {
  ACHIEVEMENTS,
  EMPTY_STATE,
  bracketOf,
  decodeDuel,
  earnedAchievements,
  encodeDuel,
  feedHealth,
  mergeSettlements,
  openRound,
  outcome,
  observeDistance,
  predict,
  resolveEntries,
  roundTiming,
  scorePick,
  totals,
  trainingRounds,
  weekStart,
} from "./game";
import { seededRandom } from "./art";
import { practiceSettlement } from "./practice";
import type { Entry, GameState, Pick, Settlement, Status } from "./types";

const now = Date.parse("2026-11-08T12:05:00Z");
function settlement(
  round = 100,
  work = "0",
  blocks = 0,
  time = now - 300_000,
): Settlement {
  return {
    transactionHash: `0x${round.toString(16).padStart(64, "0")}`,
    previousSettledThroughRound: round - 1,
    settledThroughRound: round,
    workAdded: work,
    completedBlockCount: blocks,
    activeRoundCount: work === "0" ? 0 : 1,
    blockTimestamp: new Date(time).toISOString(),
  };
}
function status(): Status {
  return {
    schemaVersion: 1,
    installationId: "test-only",
    generatedAt: new Date(now).toISOString(),
    measurement: {
      freshness: "online",
      observedAt: new Date(now).toISOString(),
      receivedAt: new Date(now).toISOString(),
      staleAfterSeconds: 120,
      provenance: "hardware",
      coreStatus: "ACTIVE",
      rpmMilli: 42000,
      speedMmPerSecond: 600,
      distanceMm: 1000,
      counterEpoch: "test-only",
    },
    builder: {
      status: "available",
      anchor: {
        settledThroughRound: "100",
        blockHeight: "200",
        blockProgress: "500000000",
        confirmedAt: new Date(now - 300_000).toISOString(),
      },
    },
    oracle: {
      state: "accepted",
      latestClosure: {
        lastRound: "100",
        acceptedAt: new Date(now - 300_000).toISOString(),
      },
    },
    settlementQueue: { status: "available", buffered: { lastRound: null } },
  };
}
const window = {
  round: "101",
  startsAt: "2026-11-08T12:00:00Z",
  endsAt: "2026-11-08T12:10:00Z",
};
function entry(
  round = 101,
  pick: Pick = { call: "NAP", bracket: null },
): Entry {
  return {
    round,
    pick,
    ai: predict([], now),
    lockedAt: new Date(now).toISOString(),
    closesAt: now + 300_000,
    mode: "live",
    installationId: "test-only",
  };
}
function state(entries: Entry[]): GameState {
  return { ...structuredClone(EMPTY_STATE), entries };
}

test("AI is deterministic for identical history and time", () => {
  const h = [
    settlement(99, "22", 4),
    settlement(98, "0"),
    settlement(100, "44", 20),
  ];
  assert.deepEqual(predict(h, now), predict(h, now));
  assert.deepEqual(predict(h, now), predict([...h].reverse(), now));
});
test("AI applies 70% hour history plus 30% last-three momentum", () => {
  const h = [
    settlement(96, "12", 4, now - 600_000),
    settlement(97, "0", 0, now - 500_000),
    settlement(98, "12", 6, now - 200_000),
    settlement(99, "0", 0, now - 100_000),
    settlement(100, "12", 5, now - 50_000),
  ];
  const a = predict(h, now);
  assert.equal(a.hourSamples, 3); // The first two records belong to the previous UTC hour.
  assert.equal(a.hourProbability, 2 / 3);
  assert.equal(a.momentum, 2 / 3);
  assert.equal(a.probability, 0.7 * (2 / 3) + 0.3 * (2 / 3));
  assert.equal(a.call, "SPRINT");
  assert.equal(a.bracket, "1-10");
});
test("AI only trains on last-seven-day past observations", () => {
  const a = predict(
    [
      settlement(1, "1", 1, now - 8 * 86_400_000),
      settlement(2, "1", 1, now + 1000),
      settlement(3, "0"),
    ],
    now,
  );
  assert.equal(a.samples, 1);
  assert.equal(a.call, "NAP");
});
test("AI discloses empty-history prior without claiming a sample", () => {
  const a = predict([], now);
  assert.equal(a.probability, 0.5);
  assert.equal(a.samples, 0);
  assert.equal(a.call, "SPRINT");
  assert.equal(a.bracket, "1-10");
  assert.equal(a.fallback, true);
});
test("AI bracket ties prefer the smaller bracket", () => {
  const a = predict(
    [
      settlement(99, "10", 12, now - 1000),
      settlement(100, "10", 42, now - 500),
    ],
    now,
  );
  assert.equal(a.bracket, "11-30");
});
test("mixed positive batches do not invent individual AI training outcomes", () => {
  const s = { ...settlement(100, "10", 12), previousSettledThroughRound: 97 };
  assert.equal(trainingRounds([s], now).length, 0);
});
test("a confirmed zero-work span establishes naps for its covered rounds", () => {
  const s = { ...settlement(), previousSettledThroughRound: 97 };
  assert.equal(trainingRounds([s], now).length, 3);
  assert.ok(trainingRounds([s], now).every((r) => r.call === "NAP"));
});
test("bracket boundaries include 1, 10, 11, 30, 31, 60 and 61", () => {
  assert.deepEqual([0, 1, 10, 11, 30, 31, 60, 61, 1000].map(bracketOf), [
    null,
    "1-10",
    "1-10",
    "11-30",
    "11-30",
    "31-60",
    "31-60",
    "61+",
    "61+",
  ]);
});
test("zero and positive work are classified with integer precision", () => {
  assert.equal(outcome(settlement()), "NAP");
  assert.equal(outcome(settlement(1, "18446744073709551615")), "SPRINT");
});
test("first correct nap earns 10 + 5, then the streak increases", () => {
  const a = scorePick({ call: "NAP", bracket: null }, settlement(), 0),
    b = scorePick({ call: "NAP", bracket: null }, settlement(), a.streak);
  assert.equal(a.total, 15);
  assert.equal(a.bonus, 5);
  assert.equal(b.total, 20);
  assert.equal(b.streak, 2);
});
test("correct sprint and bracket earns 10 + 15 + streak bonus", () => {
  const s = scorePick(
    { call: "SPRINT", bracket: "11-30" },
    settlement(100, "80", 15),
    2,
  );
  assert.deepEqual(s, {
    total: 40,
    base: 10,
    bracket: 15,
    bonus: 15,
    streak: 3,
    correct: true,
    exactBracket: true,
  });
});
test("wrong bracket still earns the correct-call and streak points", () => {
  const s = scorePick(
    { call: "SPRINT", bracket: "61+" },
    settlement(100, "5", 4),
    0,
  );
  assert.equal(s.total, 15);
  assert.equal(s.exactBracket, false);
});
test("positive work with no completed blocks never earns a bracket", () => {
  assert.equal(
    scorePick({ call: "SPRINT", bracket: "1-10" }, settlement(100, "1", 0), 0)
      .bracket,
    0,
  );
});
test("wrong call earns zero and resets the streak", () => {
  const s = scorePick(
    { call: "NAP", bracket: null },
    settlement(100, "8", 1),
    9,
  );
  assert.equal(s.total, 0);
  assert.equal(s.streak, 0);
});
for (const [label, work, blocks, pick] of [
  ["NAP", "0", 0, { call: "NAP", bracket: null }],
  ["small sprint", "44", 6, { call: "SPRINT", bracket: "1-10" }],
  ["large sprint", "880", 78, { call: "SPRINT", bracket: "61+" }],
] as const) {
  test(`confirmed ${label} resolves a covering round and awards actual points`, () => {
    const e = entry(101, pick);
    const result = resolveEntries(
      state([e]),
      [settlement(101, work, blocks, now + 400_000)],
      now + 500_000,
    );
    assert.ok(result.entries[0].result);
    assert.equal(
      result.entries[0].result!.player.total,
      work === "0" ? 15 : 30,
    );
  });
}
test("resolution waits for a covering settlement and never uses a projection", () => {
  const s = state([entry()]);
  assert.equal(resolveEntries(s, [settlement(100)], now), s);
  assert.equal(resolveEntries(s, [], now), s);
});
test("future-dated or pre-lock settlements cannot resolve a call", () => {
  const s = state([entry()]);
  assert.equal(
    resolveEntries(s, [settlement(101, "0", 0, now + 300_000)], now),
    s,
  );
  assert.equal(
    resolveEntries(s, [settlement(101, "0", 0, now - 1000)], now),
    s,
  );
});
test("batched settlement uses aggregate outcome for each covered prediction", () => {
  const r = resolveEntries(
    state([entry()]),
    [
      {
        ...settlement(103, "0", 0, now + 400_000),
        previousSettledThroughRound: 100,
      },
    ],
    now + 500_000,
  );
  assert.equal(r.entries[0].result!.player.correct, true);
});
test("resolution is idempotent and leaves input entries unmodified", () => {
  const s = state([entry()]);
  const rows = [settlement(101, "0", 0, now + 400_000)];
  const r = resolveEntries(s, rows, now + 500_000);
  assert.equal(s.entries[0].result, undefined);
  assert.equal(resolveEntries(r, rows, now + 500_000), r);
});
test("out-of-order settlement arrival cannot jump an unresolved streak", () => {
  const s = state([entry(101), entry(102)]);
  assert.equal(
    resolveEntries(s, [settlement(102, "0", 0, now + 800_000)], now + 900_000),
    s,
  );
  const r = resolveEntries(
    s,
    [
      settlement(102, "0", 0, now + 800_000),
      settlement(101, "0", 0, now + 400_000),
    ],
    now + 900_000,
  );
  assert.equal(r.entries[1].result!.player.streak, 2);
});
test("practice settlement cannot change live scores", () => {
  const s = state([{ ...entry(101), mode: "practice" }, entry(101)]);
  const r = resolveEntries(
    s,
    [settlement(101, "0", 0, now + 400_000)],
    now + 500_000,
    "practice",
  );
  assert.ok(r.entries[0].result);
  assert.equal(r.entries[1].result, undefined);
});
test("duel compares both players from the same initial streak", () => {
  const first = resolveEntries(
    state([entry(100)]),
    [settlement(100, "0", 0, now + 1)],
    now + 2,
  ).entries[0];
  const e = { ...entry(101), friend: { call: "NAP", bracket: null } as Pick };
  const r = resolveEntries(
    state([first, e]),
    [settlement(101, "0", 0, now + 400_000)],
    now + 500_000,
  );
  assert.equal(r.entries[1].result!.player.total, 20);
  assert.equal(r.entries[1].result!.duelPlayer!.total, 15);
  assert.equal(r.entries[1].result!.friend!.total, 15);
});
test("open round is settled frontier plus one, with no false zero default", () => {
  assert.equal(openRound(status()), 101);
  assert.equal(openRound(null), null);
  const s = status();
  s.builder = { status: "unavailable" };
  assert.equal(openRound(s), null);
});
test("open round preserves values across 32-bit boundaries", () => {
  const s = status();
  s.builder.anchor!.settledThroughRound = "4294967296";
  assert.equal(openRound(s), 4294967297);
  s.builder.anchor!.settledThroughRound = "9007199254740992";
  assert.equal(openRound(s), null);
});
test("close time comes from the documented round window, not block time", () => {
  const t = roundTiming(status(), [settlement()], now, window);
  assert.equal(t.closesAt, Date.parse(window.endsAt));
  assert.equal(t.closed, false);
  assert.equal(t.verifiedClose, true);
});
test("unknown round timing disables a live prediction instead of guessing", () => {
  const t = roundTiming(status(), [settlement()], now);
  assert.equal(t.closed, true);
  assert.equal(t.verifiedClose, false);
});
test("closed or buffered rounds cannot accept calls even before settlement", () => {
  const s = status();
  s.oracle.latestClosure!.lastRound = "101";
  assert.equal(roundTiming(s, [], now, window).closed, true);
  s.oracle.latestClosure!.lastRound = "100";
  s.settlementQueue.buffered!.lastRound = "101";
  assert.equal(roundTiming(s, [], now, window).closed, true);
  assert.equal(roundTiming(status(), [], now + 300_000, window).closed, true);
});
test("expected settlement spacing stays within 10–15 minute estimate", () => {
  const t = roundTiming(
    status(),
    [settlement(100, "0", 0, now - 1000), settlement(99, "0", 0, now - 10_000)],
    now,
    window,
  );
  assert.ok(t.interval >= 600_000 && t.interval <= 900_000);
});
test("fresh hardware is live, an API failure is offline, absence is unknown", () => {
  assert.equal(feedHealth(status(), now, false, now), "live");
  assert.equal(feedHealth(status(), now, true, now), "offline");
  assert.equal(feedHealth(null, now, false, now), "unknown");
});
test("stale response and stale measurements become unknown, never asleep", () => {
  const s = status();
  s.measurement!.freshness = "stale";
  s.measurement!.coreStatus = "IDLE";
  assert.equal(feedHealth(s, now, false, now), "unknown");
  assert.equal(feedHealth(status(), now, false, now + 121_000), "unknown");
  assert.equal(feedHealth(status(), now - 31_000, false, now), "unknown");
});
test("simulated, replay, counter fault and future observations cannot be live", () => {
  for (const provenance of ["simulated", "replay", "derived"]) {
    const s = status();
    s.measurement!.provenance = provenance;
    assert.equal(feedHealth(s, now, false, now), "unknown");
  }
  const s = status();
  s.measurement!.coreStatus = "COUNTER_FAULT";
  assert.equal(feedHealth(s, now, false, now), "unknown");
  s.measurement!.coreStatus = "IDLE";
  s.measurement!.receivedAt = new Date(now + 40_000).toISOString();
  assert.equal(feedHealth(s, now, false, now), "unknown");
});
test("week starts on Monday in UTC, including Sunday boundary", () => {
  assert.equal(
    new Date(weekStart(now)).toISOString(),
    "2026-11-02T00:00:00.000Z",
  );
  assert.equal(
    new Date(weekStart(Date.parse("2026-11-09T00:00:00Z"))).toISOString(),
    "2026-11-09T00:00:00.000Z",
  );
});
test("totals use settlement time, not lock time", () => {
  const r = resolveEntries(
    state([entry()]),
    [settlement(101, "0", 0, now + 400_000)],
    now + 500_000,
  );
  assert.equal(totals(r.entries, now).player, 15);
  assert.equal(totals(r.entries, now + 600_000).rounds, 0);
});
test("achievement rules keep live and practice separate", () => {
  const s = state([{ ...entry(), mode: "practice" }]);
  assert.deepEqual(earnedAchievements(s, "live", now), []);
  assert.deepEqual(earnedAchievements(s, "practice", now), ["first"]);
  assert.equal(ACHIEVEMENTS.length, 9);
});
test("collector requires ten locally collected pieces", () => {
  const s = state([]);
  s.collection = Array.from({ length: 10 }, (_, i) => ({
    key: `live:${i}`,
    settlement: settlement(i + 1),
    mode: "live",
    collectedAt: new Date(now).toISOString(),
  }));
  assert.ok(earnedAchievements(s, "live", now).includes("collector"));
  assert.ok(!earnedAchievements(s, "practice", now).includes("collector"));
});
test("Beat the Professor waits until the UTC week has ended", () => {
  const r = resolveEntries(
    state([entry()]),
    [settlement(101, "0", 0, now + 400_000)],
    now + 500_000,
  );
  assert.ok(
    !earnedAchievements(r, "live", now + 500_000).includes("professor"),
  );
  assert.ok(
    earnedAchievements(r, "live", Date.parse("2026-11-09T00:00:00Z")).includes(
      "professor",
    ),
  );
});
test("duel links round-trip without touching server state", () => {
  const d = {
    version: 1 as const,
    round: 101,
    pick: { call: "SPRINT", bracket: "11-30" } as Pick,
    installationId: "test-only",
    closesAt: now + 300_000,
  };
  assert.deepEqual(decodeDuel(encodeDuel(d)), d);
});
test("malformed and unexpected duel payloads are rejected", () => {
  assert.equal(decodeDuel("!bad!"), null);
  for (const data of [
    { version: 2 },
    { version: 1, round: -1 },
    {
      version: 1,
      round: 101,
      pick: { call: "SPRINT", bracket: "500+" },
      installationId: "test",
      closesAt: now,
    },
  ])
    assert.equal(decodeDuel(btoa(JSON.stringify(data))), null);
  assert.equal(decodeDuel("x".repeat(1001)), null);
});
test("duel encoding preserves UTF-8 installation names", () => {
  const d = {
    version: 1 as const,
    round: 101,
    pick: { call: "NAP", bracket: null } as Pick,
    installationId: "test-é-only",
    closesAt: now + 300_000,
  };
  assert.deepEqual(decodeDuel(encodeDuel(d)), d);
});
test("settlement merging removes duplicates and keeps ascending round order", () => {
  const a = settlement(100),
    b = settlement(99);
  assert.deepEqual(mergeSettlements([a, b], [a]), [b, a]);
});
test("artwork random sequence is deterministic per transaction hash", () => {
  const a = seededRandom("0xabc"),
    b = seededRandom("0xabc"),
    c = seededRandom("0xdef");
  const first = Array.from({ length: 10 }, a);
  assert.deepEqual(first, Array.from({ length: 10 }, b));
  assert.notDeepEqual(first, Array.from({ length: 10 }, c));
});
test("practice scenarios are fixed: nap, small sprint, large sprint", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((r) => practiceSettlement(r, now).completedBlockCount),
    [0, 6, 78, 0],
  );
  assert.equal(practiceSettlement(1, now).workAdded, "0");
});
test("round distance is an observed delta and resets only on a new round", () => {
  const first = observeDistance(null, 101, 1000, "epoch-a"),
    next = observeDistance(first, 101, 1400, "epoch-a");
  assert.equal(next.last - next.baseline, 400);
  assert.equal(next.interrupted, false);
  const newRound = observeDistance(next, 102, 1600, "epoch-a");
  assert.equal(newRound.baseline, 1600);
});
test("distance becomes unknown after a daily reset or counter-epoch change", () => {
  const first = observeDistance(null, 101, 1000, "epoch-a");
  assert.equal(observeDistance(first, 101, 30, "epoch-a").interrupted, true);
  assert.equal(observeDistance(first, 101, 1400, "epoch-b").interrupted, true);
  const broken = observeDistance(first, 101, 30, "epoch-a");
  assert.equal(observeDistance(broken, 101, 1200, "epoch-a").interrupted, true);
});
