import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_STATE,
  confirmedSettlements,
  explainAi,
  predict,
  resolveEntries,
  roundTiming,
  scorePick,
  settlementLedger,
} from "./game";
import type { Entry, Settlement, Status } from "./types";

// The brief's worked case: at 02:12 UTC the builder anchor is round 613
// (confirmed 02:00:36Z) while round 614 is only submitted, not confirmed.
const now = Date.parse("2026-11-08T02:12:00Z");
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
function settlement(round: number, work: string, blocks: number, at: string): Settlement {
  return {
    transactionHash: tx(round),
    previousSettledThroughRound: round - 1,
    settledThroughRound: round,
    workAdded: work,
    completedBlockCount: blocks,
    activeRoundCount: work === "0" ? 0 : 1,
    blockTimestamp: at,
  };
}
function status(lifecycle = "submitted"): Status {
  return {
    schemaVersion: 1,
    installationId: "test-only",
    generatedAt: new Date(now).toISOString(),
    measurement: null,
    builder: {
      status: "available",
      anchor: {
        settledThroughRound: lifecycle === "confirmed" ? "614" : "613",
        blockHeight: "2500",
        blockProgress: "0",
        confirmedAt: lifecycle === "confirmed" ? "2026-11-08T02:15:36.000Z" : "2026-11-08T02:00:36.000Z",
      },
    },
    oracle: {
      state: "accepted",
      latestClosure: { lastRound: "614", acceptedAt: "2026-11-08T02:10:01.000Z" },
    },
    settlementQueue: {
      status: "available",
      buffered: { firstRound: null, lastRound: null, roundCount: "0" },
      latestSubmission: {
        lifecycle,
        previousSettledThroughRound: "613",
        settledThroughRound: "614",
        roundCount: "1",
        transactionHash: tx(614),
        submittedAt: "2026-11-08T02:10:28.000Z",
        confirmedAt: lifecycle === "confirmed" ? "2026-11-08T02:15:28.000Z" : null,
      },
    },
  };
}
const s613 = settlement(613, "0", 0, "2026-11-08T02:00:36.000Z");
const s614 = settlement(614, "120", 14, "2026-11-08T02:10:36.000Z");
function entry(round: number): Entry {
  return {
    round,
    pick: { call: "SPRINT", bracket: "11-30" },
    ai: predict([], now),
    lockedAt: "2026-11-08T02:01:00.000Z",
    closesAt: Date.parse("2026-11-08T02:10:00Z"),
    mode: "live",
    installationId: "test-only",
  };
}

test("ledger shows 613 confirmed and 614 pending (submitted), never settled", () => {
  const ledger = settlementLedger(status());
  assert.equal(ledger.through, 613);
  assert.equal(ledger.confirmedAt, "2026-11-08T02:00:36.000Z");
  assert.deepEqual(
    ledger.pending.map((p) => [p.first, p.last, p.stage]),
    [[614, 614, "submitted"]],
  );
});
test("an unconfirmed 614 settlement cannot resolve a call, even if it is in the feed", () => {
  const st = { ...structuredClone(EMPTY_STATE), entries: [entry(614)] };
  const usable = confirmedSettlements([s613, s614], status());
  assert.deepEqual(usable.map((s) => s.settledThroughRound), [613]);
  assert.equal(resolveEntries(st, usable, now + 600_000), st);
});
test("once confirmed, 614 resolves with the normal scoring", () => {
  const st = { ...structuredClone(EMPTY_STATE), entries: [entry(614)] };
  const usable = confirmedSettlements([s613, s614], status("confirmed"));
  const resolved = resolveEntries(st, usable, now + 600_000);
  assert.equal(resolved.entries[0].result?.player.total, 10 + 15 + 5);
  assert.deepEqual(settlementLedger(status("confirmed")).pending, []);
});
test("a round covered by a pending submission is closed for new calls", () => {
  const window = { round: "614", startsAt: "2026-11-08T02:00:00Z", endsAt: "2026-11-08T02:10:00Z" };
  const st = status();
  st.oracle.latestClosure = { lastRound: "613", acceptedAt: "2026-11-08T02:00:01.000Z" };
  assert.equal(roundTiming(st, [s613], Date.parse("2026-11-08T02:05:00Z"), window).closed, true);
});
test("queued and oracle-closed rounds are listed as pending, in order", () => {
  const st = status();
  st.settlementQueue.latestSubmission = null;
  st.settlementQueue.buffered = { firstRound: "614", lastRound: "615", roundCount: "2" };
  st.oracle.latestClosure = { lastRound: "616", acceptedAt: "2026-11-08T02:30:01.000Z" };
  assert.deepEqual(
    settlementLedger(st).pending.map((p) => [p.first, p.last, p.stage]),
    [[614, 615, "queued"], [616, 616, "closed"]],
  );
});
test("worked check: same history gives the same Professor call and reasoning", () => {
  const h = [s613, settlement(612, "40", 5, "2026-11-08T01:50:36.000Z")];
  assert.deepEqual(predict(h, now), predict([...h].reverse(), now));
  assert.equal(explainAi(predict(h, now)), explainAi(predict(h, now)));
  assert.match(explainAi(predict([], now)), /50\/50/);
});
test("worked check: +10 call, +15 bracket, +5 per streak step", () => {
  const first = scorePick({ call: "SPRINT", bracket: "11-30" }, s614, 0);
  assert.deepEqual([first.base, first.bracket, first.bonus, first.total], [10, 15, 5, 30]);
  const second = scorePick({ call: "NAP", bracket: null }, s613, first.streak);
  assert.deepEqual([second.base, second.bonus, second.total, second.streak], [10, 10, 20, 2]);
  const miss = scorePick({ call: "NAP", bracket: null }, s614, second.streak);
  assert.deepEqual([miss.total, miss.streak], [0, 0]);
});
