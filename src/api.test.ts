import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FeedError, normalizeSettlement, readApi, retryAfterMs } from "./api";

test("Retry-After supports seconds, HTTP date, malformed and absent headers", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  assert.equal(retryAfterMs("90", now), 90_000);
  assert.equal(retryAfterMs("Sun, 08 Nov 2026 12:01:00 GMT", now), 60_000);
  assert.equal(retryAfterMs("broken", now), 0);
  assert.equal(retryAfterMs(null, now), 0);
});
test("malformed settlements are errors, not zero-work rounds", () => {
  assert.throws(
    () =>
      normalizeSettlement(
        {
          previousSettledThroughRound: "1",
          settledThroughRound: "2",
          workAdded: "0",
          completedBlockCount: "0",
          activeRoundCount: "0",
        },
        "not-a-hash",
        "not-a-date",
      ),
    FeedError,
  );
  assert.throws(
    () =>
      normalizeSettlement(
        {
          previousSettledThroughRound: "1",
          settledThroughRound: "9007199254740995",
          workAdded: "0",
          completedBlockCount: "0",
          activeRoundCount: "0",
        },
        `0x${"a".repeat(64)}`,
        "2026-11-08T12:00:00Z",
      ),
    FeedError,
  );
});
test("unknown schema versions fail closed", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ schemaVersion: 99 }), { status: 200 }),
  );
  await assert.rejects(
    readApi("/v1/status", "status"),
    /Unknown feed format or schema version/,
  );
});
test("network failure is an explicit offline error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(readApi("/v1/status", "status"), /Wheel feed offline/);
});
test("downloaded status, history and event fixtures match the official schemas", async (t) => {
  for (const [file, kind] of [
    ["status", "status"],
    ["settlements", "history"],
    ["events", "events"],
  ] as const) {
    const d = JSON.parse(
      await readFile(
        new URL(`../test/fixtures/${file}.json`, import.meta.url),
        "utf8",
      ),
    );
    d.generatedAt = new Date().toISOString();
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(JSON.stringify(d), { status: 200 }),
    );
    const result = await readApi("/fixture-only", kind);
    assert.equal(result.schemaVersion, d.schemaVersion);
    t.mock.restoreAll();
  }
});
test("non-Sepolia and stale settlement responses are rejected", async (t) => {
  const d = JSON.parse(
    await readFile(
      new URL("../test/fixtures/settlements.json", import.meta.url),
      "utf8",
    ),
  );
  d.generatedAt = new Date().toISOString();
  d.chain.chainId = "1";
  d.chain.target = "ethereum";
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(d), { status: 200 }),
  );
  await assert.rejects(
    readApi("/fixture-only", "history"),
    /Unexpected network|Unknown feed format/,
  );
  d.chain.chainId = "11155111";
  d.chain.target = "sepolia";
  d.generatedAt = new Date(Date.now() - 180_000).toISOString();
  await assert.rejects(
    readApi("/fixture-only", "history"),
    /snapshot is stale/,
  );
});
test("429 obeys Retry-After and blocks further requests during the cooldown", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("{}", {
      status: 429,
      headers: { "Retry-After": "120" },
    });
  });
  const before = Date.now();
  await assert.rejects(
    readApi("/v1/status", "status"),
    (error: unknown) =>
      error instanceof FeedError && error.retryAt >= before + 120_000,
  );
  await assert.rejects(
    readApi("/v1/settlements?range=7d", "history"),
    /rate limit/,
  );
  assert.equal(calls, 1);
});
