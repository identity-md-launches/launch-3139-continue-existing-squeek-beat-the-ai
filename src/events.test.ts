import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchEvents, normalizeSettlement } from "./api";
import type { EventScan } from "./api";
import { EMPTY_STATE, predict, resolveEntries, totals, weekStart } from "./game";
import type { Entry } from "./types";

// Synthetic, schema-valid review fixtures; never used by the live game.
const fixture = JSON.parse(
  await readFile(new URL("../test/fixtures/events.json", import.meta.url), "utf8"),
);
const now = Date.parse("2026-11-16T12:15:00Z");
const installationId = fixture.installationId;
function entry(round: number, date: string): Entry {
  const lockedAt = `${date}T12:05:00Z`;
  return {
    round,
    lockedAt,
    closesAt: Date.parse(lockedAt) + 300_000,
    installationId,
    mode: "live",
    pick: { call: "SPRINT", bracket: "1-10" },
    ai: predict([], Date.parse(lockedAt)),
  };
}
function event(round: number, date: string) {
  const e = structuredClone(fixture.events[0]);
  e.id = `review-fixture-${round}`;
  e.source.transactionHash = `0x${round.toString(16).padStart(64, "0")}`;
  e.payload.previousSettledThroughRound = String(round - 1);
  e.payload.settledThroughRound = String(round);
  e.payload.workAdded = "44";
  e.payload.completedBlockCount = "6";
  e.payload.activeRoundCount = "1";
  e.occurredAt = `${date}T12:10:36Z`;
  e.recordedAt = e.occurredAt;
  return e;
}
function page(events: any[], nextCursor: string | null = null) {
  return {
    ...structuredClone(fixture),
    generatedAt: new Date(now).toISOString(),
    events,
    nextCursor,
  };
}

test("eight-day-old saved call and current call both resolve in streak order", async (t) => {
  t.mock.method(Date, "now", () => now);
  const entries = [entry(101, "2026-11-08"), entry(1253, "2026-11-16")];
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(page([event(1253, "2026-11-16"), event(101, "2026-11-08")])),
  );
  const loaded = await fetchEvents([], installationId, () => {}, entries);
  assert.equal(loaded.complete, true);
  assert.deepEqual(loaded.rows.map((s) => s.settledThroughRound), [101, 1253]);
  const state = { ...structuredClone(EMPTY_STATE), entries };
  const resolved = resolveEntries(state, loaded.rows, now, "live");
  assert.deepEqual(resolved.entries.map((e) => e.result?.player.total), [30, 35]);
  assert.deepEqual(resolved.entries.map((e) => e.result?.player.streak), [1, 2]);
  assert.equal(totals(resolved.entries).player, 65);
  assert.equal(totals(resolved.entries, weekStart(now)).player, 35);
  assert.equal(resolveEntries(resolved, loaded.rows, now, "live"), resolved);
  assert.deepEqual(predict(loaded.rows, now), predict([loaded.rows[1]], now));
});

test("pagination crosses the training cutoff and cached overlap to recover an older call", async (t) => {
  t.mock.method(Date, "now", () => now);
  const entries = [entry(101, "2026-11-08"), entry(1253, "2026-11-16")];
  const newest = event(1253, "2026-11-16");
  const cached = normalizeSettlement(newest.payload, newest.source.transactionHash, newest.occurredAt);
  const cursors: (string | null)[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("category"), "protocol");
    assert.equal(query.get("limit"), "100");
    const cursor = query.get("cursor");
    cursors.push(cursor);
    if (!cursor) return Response.json(page([newest, event(200, "2026-11-09")], "older_-"));
    assert.equal(cursor, "older_-");
    return Response.json(page([event(101, "2026-11-08")]));
  });
  const loaded = await fetchEvents([cached], installationId, () => {}, entries);
  assert.deepEqual(cursors, [null, "older_-"]);
  assert.deepEqual(loaded.rows.map((s) => s.settledThroughRound), [101, 200, 1253]);
  assert.ok(resolveEntries({ ...structuredClone(EMPTY_STATE), entries }, loaded.rows, now).entries.every((e) => e.result));
});

test("older confirmed evidence is retained on later incremental polls while needed", async (t) => {
  let clock = now;
  t.mock.method(Date, "now", () => clock);
  const entries = [entry(101, "2026-11-08")];
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    const response = page(calls === 1
      ? [event(1253, "2026-11-16"), event(101, "2026-11-08")]
      : [event(1253, "2026-11-16")], calls === 1 ? null : "unused-older");
    response.generatedAt = new Date(clock).toISOString();
    return Response.json(response);
  });
  const first = await fetchEvents([], installationId, () => {}, entries);
  clock += 86_400_000;
  const second = await fetchEvents(first.rows, installationId, () => {}, entries);
  assert.equal(calls, 2); // Covered old calls allow the normal incremental overlap shortcut.
  assert.equal(second.complete, true);
  assert.deepEqual(second.rows.map((s) => s.settledThroughRound), [101, 1253]);
});

test("practice, resolved and other-installation calls do not extend the live window", async (t) => {
  t.mock.method(Date, "now", () => now);
  const pending = entry(101, "2026-11-08");
  const old = event(101, "2026-11-08");
  const evidence = normalizeSettlement(old.payload, old.source.transactionHash, old.occurredAt);
  const resolved = resolveEntries({ ...structuredClone(EMPTY_STATE), entries: [pending] }, [evidence], now).entries[0];
  const entries: Entry[] = [
    { ...pending, mode: "practice" },
    { ...pending, installationId: "another-installation" },
    resolved,
  ];
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(page([event(1253, "2026-11-16"), event(200, "2026-11-09")], "unneeded-older"));
  });
  const loaded = await fetchEvents([], installationId, () => {}, entries);
  assert.equal(calls, 1);
  assert.equal(loaded.complete, true);
  assert.deepEqual(loaded.rows.map((s) => s.settledThroughRound), [1253]);
});

test("long backfills resume beyond the forty-page poll budget", async (t) => {
  t.mock.method(Date, "now", () => now);
  const entries = [entry(101, "2026-11-08"), entry(1253, "2026-11-16")];
  const cursors: (string | null)[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const cursor = new URL(url).searchParams.get("cursor");
    cursors.push(cursor);
    const index = cursor ? Number(cursor.slice(5)) : 0;
    if (index === 40) return Response.json(page([event(101, "2026-11-08")]));
    return Response.json(page([event(1253 - index, "2026-11-16")], `page-${index + 1}`));
  });
  const first = await fetchEvents([], installationId, () => {}, entries);
  assert.equal(first.complete, false);
  assert.equal(first.continuation?.cursor, "page-40");
  assert.equal(first.rows.length, 40);
  const second = await fetchEvents([], installationId, () => {}, entries, first.continuation);
  assert.equal(second.complete, true);
  assert.equal(second.continuation, null);
  assert.equal(cursors.length, 41);
  assert.equal(cursors[40], "page-40");
  assert.equal(second.rows.length, 41);
  const resolved = resolveEntries({ ...structuredClone(EMPTY_STATE), entries }, second.rows, now);
  assert.deepEqual(resolved.entries.map((e) => e.result?.player.total), [30, 35]);
});

test("a failed page resumes at its checkpoint without losing confirmed evidence", async (t) => {
  t.mock.method(Date, "now", () => now);
  const entries = [entry(101, "2026-11-08"), entry(1253, "2026-11-16")];
  let offline = true;
  const cursors: (string | null)[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const cursor = new URL(url).searchParams.get("cursor");
    cursors.push(cursor);
    if (!cursor) return Response.json(page([event(1253, "2026-11-16")], "older"));
    if (offline) throw new TypeError("Synthetic offline failure");
    return Response.json(page([event(101, "2026-11-08")]));
  });
  let checkpoint: EventScan | null = null;
  await assert.rejects(fetchEvents([], installationId, (_rows, next) => { checkpoint = next; }, entries), /offline/);
  offline = false;
  const loaded = await fetchEvents([], installationId, () => {}, entries, checkpoint);
  assert.deepEqual(cursors, [null, "older", "older"]);
  assert.deepEqual(loaded.rows.map((s) => s.settledThroughRound), [101, 1253]);
});

test("missing evidence remains pending instead of granting points or claiming a nap", async (t) => {
  t.mock.method(Date, "now", () => now);
  const entries = [entry(101, "2026-11-08"), entry(1253, "2026-11-16")];
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(page([event(1253, "2026-11-16")])),
  );
  const loaded = await fetchEvents([], installationId, () => {}, entries);
  const state = { ...structuredClone(EMPTY_STATE), entries };
  assert.equal(resolveEntries(state, loaded.rows, now), state);
});

test("backfill rejects changed installations and unsafe settlement evidence", async (t) => {
  t.mock.method(Date, "now", () => now);
  const entries = [entry(101, "2026-11-08")];
  const old = event(101, "2026-11-08");
  let changed = true;
  t.mock.method(globalThis, "fetch", async () => {
    const response = page([old]);
    if (changed) response.installationId = "another-installation";
    return Response.json(response);
  });
  await assert.rejects(fetchEvents([], installationId, () => {}, entries), /installation changed/);
  changed = false;
  old.source.confirmationStatus = "pending";
  await assert.rejects(fetchEvents([], installationId, () => {}, entries), /Unsupported settlement event|Unknown feed format/);
});
