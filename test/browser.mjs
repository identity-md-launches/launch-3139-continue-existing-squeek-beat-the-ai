import assert from "node:assert/strict";
import axe from "axe-core";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";

// Uses the supplied browser runtime; installs nothing and never reads machine configuration.
const { chromium, webkit } = await import(
  pathToFileURL(
    process.env.IMD_PLAYWRIGHT ||
      "/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs",
  ).href
);
const fixtures = Object.fromEntries(
  await Promise.all(
    ["status", "settlements", "events"].map(async (name) => [
      name,
      JSON.parse(await readFile(`test/fixtures/${name}.json`, "utf8")),
    ]),
  ),
);
const scratch = "test/scratch/browser";
await mkdir(scratch, { recursive: true });
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".png": "image/png",
};
const HOSTED_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; media-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-src https:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const server = createServer(async (req, res) => {
  const requested = decodeURIComponent(new URL(req.url, "http://test").pathname);
  const pathname = requested.startsWith("/preview/")
    ? requested.slice("/preview".length)
    : requested;
  const file = resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);
  if (!file.startsWith(`${root}/`)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      // The exact policy the hosted .imd.site domain sends. It forbids eval, which is
      // what left the published page blank; serving it here catches that regression.
      "Content-Security-Policy": HOSTED_CSP,
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const base = Date.parse("2026-11-08T12:05:00Z");
const reports = [];
function report(name, details) {
  reports.push({ name, passed: true, details });
  console.log(`PASS ${name}: ${details}`);
}
const clone = (x) => structuredClone(x);
async function audit(page, name) {
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(async () =>
    window.axe.run({
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"],
      },
    }),
  );
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
  await writeFile(
    `${scratch}/axe-${name}.json`,
    JSON.stringify({ violations, passes: results.passes.length }, null, 2),
  );
  assert.deepEqual(violations, [], `${name} accessibility findings`);
  report(
    `accessibility ${name}`,
    `${results.passes.length} axe checks passed, zero violations.`,
  );
}

function mockedData(now, settled = false, stale = false) {
  const status = clone(fixtures.status),
    history = clone(fixtures.settlements),
    events = clone(fixtures.events);
  const stamp = new Date(now).toISOString();
  for (const d of [status, history, events]) {
    d.generatedAt = stamp;
    d.installationId = "sepolia-browser-test-only";
  }
  status.measurement.receivedAt = new Date(
    stale ? now - 180_000 : now,
  ).toISOString();
  status.measurement.observedAt = status.measurement.receivedAt;
  status.measurement.freshness = stale ? "stale" : "online";
  status.measurement.provenance = "hardware";
  status.measurement.coreStatus = "ACTIVE";
  status.measurement.rpmMilli = 42000;
  status.builder.anchor.settledThroughRound = settled ? "101" : "100";
  status.builder.anchor.confirmedAt = settled
    ? "2026-11-08T12:10:36.000Z"
    : "2026-11-08T12:00:36.000Z";
  // Keep the fixture's last submission at its synthetic confirmed frontier.
  // Retaining the downloaded #607 submission while moving the anchor to #100
  // correctly closes #101, so it cannot represent an open-round test feed.
  const submission = status.settlementQueue.latestSubmission;
  submission.previousSettledThroughRound = settled ? "100" : "99";
  submission.settledThroughRound = status.builder.anchor.settledThroughRound;
  submission.confirmedAt = status.builder.anchor.confirmedAt;
  submission.terminalAt = submission.confirmedAt;
  submission.changedAt = submission.confirmedAt;
  submission.createdAt = submission.submittedAt = new Date(
    Date.parse(submission.confirmedAt) - 8_000,
  ).toISOString();
  status.oracle.state = "accepted";
  status.oracle.latestClosure = {
    firstRound: settled ? "101" : "100",
    lastRound: settled ? "101" : "100",
    roundCount: "1",
    acceptedAt: settled
      ? "2026-11-08T12:10:01.000Z"
      : "2026-11-08T12:00:01.000Z",
  };
  status.settlementQueue.buffered = {
    firstRound: null,
    lastRound: null,
    roundCount: "0",
    activeRoundCount: "0",
    workUnits: "0",
  };
  history.mining.nextRound.round = settled ? "102" : "101";
  history.mining.nextRound.startsAt = settled
    ? "2026-11-08T12:10:00.000Z"
    : "2026-11-08T12:00:00.000Z";
  history.mining.nextRound.endsAt = settled
    ? "2026-11-08T12:20:00.000Z"
    : "2026-11-08T12:10:00.000Z";
  history.recentSettlements = [];
  const originals = clone(events.events);
  events.events = originals.map((e, i) => {
    e.payload.previousSettledThroughRound = String(99 - i);
    e.payload.settledThroughRound = String(100 - i);
    e.payload.workAdded = ["0", "44", "880", "0"][i];
    e.payload.completedBlockCount = ["0", "6", "78", "0"][i];
    e.payload.activeRoundCount = i === 0 || i === 3 ? "0" : "1";
    e.occurredAt = new Date(
      Date.parse("2026-11-08T12:00:36Z") - i * 600_000,
    ).toISOString();
    e.recordedAt = e.occurredAt;
    return e;
  });
  if (settled) {
    const e = clone(events.events[1]);
    e.id += "-test-next";
    e.source.transactionHash = `0x${"ab".repeat(32)}`;
    e.payload.previousSettledThroughRound = "100";
    e.payload.settledThroughRound = "101";
    e.occurredAt = "2026-11-08T12:10:36.000Z";
    e.recordedAt = e.occurredAt;
    events.events.unshift(e);
  }
  events.nextCursor = null;
  return { status, history, events };
}
async function mockFeed(context, control) {
  await context.route("https://api.squeekchain.com/**", async (route) => {
    const url = new URL(route.request().url());
    control.requests.push({ path: url.pathname, at: control.now });
    if (control.offline) {
      await route.abort("failed");
      return;
    }
    if (control.cursorError && url.pathname === "/v1/events" && url.searchParams.has("cursor")) {
      control.cursorError = false;
      await route.fulfill({ status: 409, contentType: "application/json", body: '{"error":"cursor_invalidated"}' });
      return;
    }
    const data = mockedData(control.now, control.settled, control.stale);
    if (control.transform) control.transform(data, url);
    if (control.schema && url.pathname === "/v1/status") {
      data.status.schemaVersion = 99;
    }
    if (control.rate && url.pathname === "/v1/status") {
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "120" },
        body: "{}",
      });
      return;
    }
    let body;
    if (url.pathname === "/v1/status") body = data.status;
    else if (url.pathname === "/v1/events") body = data.events;
    else if (url.pathname === "/v1/settlements") {
      body = data.history;
      body.range = url.searchParams.get("range");
    } else throw new Error(`Unexpected API path ${url.pathname}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}
const errors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  // Exercise the emitted module in a browser, not just the source in Node: Vite
  // and Node expose Ajv's CommonJS string-length helper differently.
  const schemaChunk = (await readdir(resolve(root, "assets"))).find(
    (name) => name.startsWith("api-schemas-") && name.endsWith(".js"),
  );
  assert.ok(schemaChunk, "Built validator chunk must exist");
  for (const width of [390, 1440]) {
    const bundledCtx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      reducedMotion: "reduce",
    });
    const control = { now: base, requests: [] };
    await mockFeed(bundledCtx, control);
    const bundled = await bundledCtx.newPage();
    const runtimeErrors = [];
    bundled.on("pageerror", (e) => runtimeErrors.push(e.message));
    bundled.on("console", (msg) => {
      if (msg.type() === "error") runtimeErrors.push(msg.text());
    });
    bundled.on("requestfailed", (req) => runtimeErrors.push(req.url()));
    await bundled.clock.install({ time: base });
    await bundled.goto(`${origin}/preview/index.html?v=20261108`);
    const results = await bundled.evaluate(async ({ url, data }) => {
      const module = await import(url);
      const validators = Object.values(module).find(
        (value) => value && typeof value.status === "function",
      );
      if (!validators) throw new Error("Missing production validators");
      return Object.fromEntries(["status", "history", "events"].map((kind) => [
        kind,
        {
          valid: validators[kind](data[kind]),
          unknownVersion: validators[kind]({ ...data[kind], schemaVersion: 99 }),
        },
      ]));
    }, {
      url: `${origin}/preview/assets/${schemaChunk}`,
      data: mockedData(base),
    });
    for (const [kind, result] of Object.entries(results)) {
      assert.equal(result.valid, true, `Bundled ${kind} accepts a valid response`);
      assert.equal(result.unknownVersion, false, `Bundled ${kind} rejects an unknown version`);
    }
    await bundled.getByRole("button", { name: "Lock my prediction", exact: true }).waitFor();
    assert.ok(await bundled.getByRole("button", { name: "Lock my prediction", exact: true }).isEnabled());
    assert.ok(await bundled.getByText("LIVE", { exact: true }).isVisible());
    assert.equal(await bundled.locator(".wheel-readings strong").first().textContent(), "42.0");
    assert.ok((await bundled.locator(".round-number").textContent()).includes("#101"));
    assert.equal(await bundled.locator(".feed-notice").count(), 0);
    assert.ok(await bundled.locator(".professor-reason").isVisible());
    const bounds = await bundled.locator(".prediction-column .primary-button").boundingBox();
    assert.ok(bounds.y + bounds.height <= (width === 390 ? 844 : 900));
    assert.ok(await bundled.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await bundled.screenshot({ path: `${scratch}/bundled-live-${width}.png` });
    assert.deepEqual(runtimeErrors, [], "No production console or resource errors");
    report(`bundled validators and clean live board at ${width}`, "Valid status/history/events accepted; unknown versions rejected; subpath index.html/query entry renders LIVE with an enabled first-screen prediction and no console/resource errors.");
    await bundledCtx.close();
  }
  const offline = { now: base, offline: true, requests: [] };
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await mockFeed(ctx, offline);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: base });
  await page.goto(origin);
  await page.getByText("OFFLINE", { exact: true }).waitFor();
  assert.equal(await page.locator(".scene-hamster").count(), 0);
  assert.ok(
    await page
      .getByRole("button", { name: "Waiting for wheel feed", exact: true })
      .isDisabled(),
  );
  const box = await page
    .locator(".prediction-column .primary-button")
    .boundingBox();
  assert.ok(
    box.y + box.height <= 844,
    `Primary action bottom ${box.y + box.height}`,
  );
  const recoveryBox = await page.getByRole("button", { name: "Play practice", exact: true }).boundingBox();
  assert.ok(recoveryBox.y + recoveryBox.height <= 844, "Practice recovery is on the first phone screen");
  assert.ok(await page.getByRole("button", { name: "Retry now", exact: true }).isVisible());
  await page.screenshot({ path: `${scratch}/offline-390.png` });
  report(
    "offline honesty and phone first screen",
    `No sleeping/live hamster, unknown metrics, disabled live call; primary action bottom ${box.y + box.height}, practice recovery bottom ${recoveryBox.y + recoveryBox.height} within 390×844.`,
  );
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Nap Zero work" }).click();
  const practiceBox = await page
    .getByRole("button", { name: "Lock practice call", exact: true })
    .boundingBox();
  assert.ok(
    practiceBox.y + practiceBox.height <= 844,
    `Practice action bottom ${practiceBox.y + practiceBox.height}`,
  );
  await page
    .getByRole("button", { name: "Lock practice call", exact: true })
    .click();
  await page.getByRole("button", { name: "Dismiss achievement" }).click();
  await page.getByRole("button", { name: "Reveal practice round" }).click();
  await page.getByRole("dialog", { name: "A nap it is." }).waitFor();
  assert.ok(
    await page
      .getByRole("dialog")
      .getByText("+15", { exact: true })
      .isVisible(),
  );
  await page.screenshot({ path: `${scratch}/practice-result-390.png` });
  await audit(page, "practice-result");
  await page.getByRole("button", { name: "Close result" }).click();
  for (const bracket of ["1–10", "61+"]) {
    await page.getByRole("button", { name: "Sprint Some work" }).click();
    await page.getByRole("button", { name: bracket, exact: true }).click();
    await page
      .getByRole("button", { name: "Lock practice call", exact: true })
      .click();
    await page.getByRole("button", { name: "Reveal practice round" }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "Close result" }).click();
  }
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("squeek.predictor.v1")),
  );
  assert.equal(
    saved.entries
      .filter((e) => e.mode === "practice")
      .reduce((n, e) => n + (e.result?.player.total ?? 0), 0),
    90,
  );
  assert.equal(saved.collection.filter((i) => i.mode === "practice").length, 3);
  assert.ok(saved.achievements["practice:hat"]);
  assert.equal(saved.entries.filter((e) => e.mode === "live").length, 0);
  report(
    "practice complete game",
    "NAP, small sprint, large sprint; 90 player points, streak 3, three artworks, Hat Trick; live score untouched.",
  );
  await page.reload();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("squeek.predictor.v1")).collection
          .length,
    ),
    3,
  );
  await page.getByRole("button", { name: /^Art/ }).click();
  assert.equal(await page.locator(".collection-view .art-card").count(), 3);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download round 3", exact: true })
    .click();
  const download = await downloadPromise;
  await download.saveAs(`${scratch}/artwork.png`);
  const bytes = await readFile(`${scratch}/artwork.png`);
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  assert.equal(bytes.readUInt32BE(16), 1080);
  await page.getByRole("button", { name: "View artwork for round 3" }).click();
  await page.getByRole("dialog", { name: "Round #3" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("button", { name: "Awards", exact: true }).click();
  assert.equal(await page.locator(".achievement").count(), 9);
  assert.ok((await page.locator(".achievement.unlocked").count()) >= 2);
  await page.getByRole("button", { name: "How to play", exact: true }).click();
  assert.ok(
    await page
      .getByText(
        "Squeek Beat-the-AI Predictor is a community project for the Squeekchain Buildooooor badge.",
        { exact: true },
      )
      .isVisible(),
  );
  report(
    "local save, collection, download and about",
    "Reload retained progress; 1080px PNG download; native artwork modal/Escape; nine achievements; required About attribution.",
  );

  const control = { now: base, offline: false, settled: false, requests: [] };
  const liveCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await mockFeed(liveCtx, control);
  const live = await liveCtx.newPage();
  live.on("pageerror", (e) => errors.push(e.message));
  await live.clock.install({ time: base });
  await live.goto(origin);
  await live
    .getByRole("button", { name: "Lock my prediction", exact: true })
    .waitFor();
  assert.ok(await live.getByText("LIVE", { exact: true }).isVisible());
  await live.screenshot({ path: `${scratch}/live-mocked-390.png` });
  await audit(live, "live-board");
  await live.setViewportSize({ width: 1440, height: 1000 });
  await live.screenshot({ path: `${scratch}/live-mocked-1440.png` });
  await live.getByRole("button", { name: "Nap Zero work" }).click();
  await live
    .getByRole("button", { name: "Lock my prediction", exact: true })
    .click();
  await live.getByRole("button", { name: "Dismiss achievement" }).click();
  await live
    .getByRole("button", { name: "Duel a friend", exact: true })
    .click();
  const link = await live.locator(".share-field input").inputValue();
  assert.ok(link.includes("#duel="));
  const friendCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await mockFeed(friendCtx, control);
  const friend = await friendCtx.newPage();
  friend.on("pageerror", (e) => errors.push(e.message));
  await friend.clock.install({ time: base });
  await friend.goto(link);
  await friend
    .getByRole("button", { name: "Lock my prediction", exact: true })
    .waitFor();
  await friend.getByRole("button", { name: "Sprint Some work" }).click();
  await friend.getByRole("button", { name: "1–10", exact: true }).click();
  await friend
    .getByRole("button", { name: "Lock my prediction", exact: true })
    .click();
  await friend.getByRole("button", { name: "Dismiss achievement" }).click();
  assert.equal(await friend.getByRole("dialog").count(), 0);
  assert.ok(
    await friend
      .getByText("Waiting for settlement. Your call stays saved.", {
        exact: true,
      })
      .isVisible(),
  );
  control.now = base + 180_000;
  await live.clock.fastForward(180_000);
  await friend.clock.fastForward(180_000);
  assert.equal(await friend.getByRole("dialog").count(), 0);
  report(
    "live locking and shared duel",
    "Schema-valid mocked feed; live call locks; a second browser accepts encoded same-round friend call; no early reveal.",
  );
  control.now = base + 360_000;
  control.transform = (data) => {
    const confirmed = mockedData(control.now, true);
    const submission = clone(confirmed.status.settlementQueue.latestSubmission);
    submission.lifecycle = "submitted";
    submission.confirmedAt = submission.terminalAt = null;
    submission.changedAt = submission.submittedAt;
    data.status.settlementQueue.latestSubmission = submission;
    data.status.oracle.latestClosure = confirmed.status.oracle.latestClosure;
    // Even a supplied covering event cannot outrun the confirmed status anchor.
    data.events.events.unshift(confirmed.events.events[0]);
  };
  await friend.clock.fastForward(180_000);
  await live.clock.fastForward(180_000);
  await friend.locator(".ledger-pending").getByText("Round #101", { exact: true }).waitFor();
  assert.ok((await friend.locator(".ledger-confirmed .ledger-lead").textContent()).includes("#100"));
  assert.equal(await friend.getByRole("dialog").count(), 0);
  assert.equal(await friend.getByRole("button", { name: "View artwork for round 101", exact: true }).count(), 0);
  assert.ok(await friend.evaluate(() => JSON.parse(localStorage.getItem("squeek.predictor.v1")).entries.every((e) => !e.result)));
  await friend.screenshot({ path: `${scratch}/submitted-pending-390.png`, fullPage: true });
  report("submitted is pending", "Submitted #101 and its covering event remain separate from confirmed-through #100: no points, result dialog, or round artwork before confirmation.");
  control.transform = null;
  control.now = base + 480_000;
  control.settled = true;
  await friend.clock.fastForward(120_000);
  await live.clock.fastForward(120_000);
  await friend.getByRole("dialog", { name: "He chose to sprint." }).waitFor();
  assert.ok(await friend.getByText(/Friend duel: You win/).isVisible());
  const friendSave = await friend.evaluate(() =>
    JSON.parse(localStorage.getItem("squeek.predictor.v1")),
  );
  assert.equal(friendSave.entries[0].result.player.total, 30);
  assert.equal(friendSave.entries[0].result.friend.total, 0);
  assert.ok(friendSave.achievements["live:duel"]);
  await friend.screenshot({ path: `${scratch}/duel-result-390.png` });
  await friend.getByRole("button", { name: "Close result" }).click();
  await friend.reload();
  const afterReload = await friend.evaluate(() =>
    JSON.parse(localStorage.getItem("squeek.predictor.v1")),
  );
  assert.equal(afterReload.entries.length, 1);
  assert.equal(afterReload.entries[0].result.player.total, 30);
  report(
    "confirmed resolution and duel",
    "Covering settlement reveals only after confirmation; player +30 vs friend 0; Duelist; no duplicate points after reload.",
  );

  // Synthetic review regression: leave an unsettled call, return eight days later,
  // and recover its evidence from an older cursor page after locking a new call.
  const absence = 8 * 86_400_000;
  const returnControl = {
    now: base,
    settled: false,
    returned: false,
    olderPages: 0,
    requests: [],
    transform(data, url) {
      if (!this.returned) return;
      const shift = (stamp) => new Date(Date.parse(stamp) + absence).toISOString();
      const shiftRound = (r) => String(Number(r) + 1152);
      const { status, history, events } = data;
      status.builder.anchor.settledThroughRound = shiftRound(status.builder.anchor.settledThroughRound);
      status.builder.anchor.confirmedAt = shift(status.builder.anchor.confirmedAt);
      status.oracle.latestClosure.firstRound = shiftRound(status.oracle.latestClosure.firstRound);
      status.oracle.latestClosure.lastRound = shiftRound(status.oracle.latestClosure.lastRound);
      status.oracle.latestClosure.acceptedAt = shift(status.oracle.latestClosure.acceptedAt);
      history.mining.nextRound.round = shiftRound(history.mining.nextRound.round);
      history.mining.nextRound.startsAt = shift(history.mining.nextRound.startsAt);
      history.mining.nextRound.endsAt = shift(history.mining.nextRound.endsAt);
      for (const e of events.events) {
        e.payload.previousSettledThroughRound = shiftRound(e.payload.previousSettledThroughRound);
        e.payload.settledThroughRound = shiftRound(e.payload.settledThroughRound);
        e.occurredAt = shift(e.occurredAt);
        e.recordedAt = e.occurredAt;
      }
      if (!this.settled) return; // The old evidence is not yet supplied by this test feed.
      if (url.searchParams.get("cursor") === "return-older") {
        this.olderPages++;
        const old = clone(events.events[0]);
        old.id = "review-return-old-101";
        old.source.transactionHash = `0x${"cd".repeat(32)}`;
        old.payload.previousSettledThroughRound = "100";
        old.payload.settledThroughRound = "101";
        old.occurredAt = "2026-11-08T12:10:36.000Z";
        old.recordedAt = old.occurredAt;
        events.events = [old];
        events.nextCursor = null;
      } else {
        const boundary = clone(events.events[0]);
        boundary.id = "review-return-training-boundary";
        boundary.source.transactionHash = `0x${"ef".repeat(32)}`;
        boundary.payload.previousSettledThroughRound = "199";
        boundary.payload.settledThroughRound = "200";
        boundary.occurredAt = "2026-11-09T12:00:36.000Z";
        boundary.recordedAt = boundary.occurredAt;
        events.events.push(boundary);
        events.nextCursor = "return-older";
      }
    },
  };
  const returnCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await mockFeed(returnCtx, returnControl);
  const returning = await returnCtx.newPage();
  returning.on("pageerror", (e) => errors.push(e.message));
  await returning.clock.install({ time: base });
  await returning.goto(origin);
  await returning.getByRole("button", { name: "Lock my prediction", exact: true }).waitFor();
  await returning.getByRole("button", { name: "Sprint Some work" }).click();
  await returning.getByRole("button", { name: "1–10", exact: true }).click();
  await returning.getByRole("button", { name: "Lock my prediction", exact: true }).click();
  await returning.getByRole("button", { name: "Dismiss achievement" }).click();
  returnControl.returned = true;
  returnControl.now = base + absence;
  await returning.clock.setSystemTime(returnControl.now);
  await returning.reload();
  await returning.getByRole("button", { name: "Lock my prediction", exact: true }).waitFor();
  assert.equal(await returning.getByRole("dialog").count(), 0);
  await returning.getByRole("button", { name: "Sprint Some work" }).click();
  await returning.getByRole("button", { name: "1–10", exact: true }).click();
  await returning.getByRole("button", { name: "Lock my prediction", exact: true }).click();
  await returning.waitForFunction(() => JSON.parse(localStorage.getItem("squeek.predictor.v1")).entries.length === 2);
  const pendingSave = await returning.evaluate(() => JSON.parse(localStorage.getItem("squeek.predictor.v1")));
  assert.deepEqual(pendingSave.entries.map((e) => e.round), [101, 1253]);
  assert.ok(pendingSave.entries.every((e) => !e.result));
  await returning.screenshot({ path: `${scratch}/return-pending-390.png` });
  returnControl.now += 360_000;
  returnControl.settled = true;
  returnControl.cursorError = true;
  await returning.clock.fastForward(360_000);
  await returning.getByText(/Feed unavailable \(HTTP 409\)/).waitFor();
  assert.equal(await returning.getByRole("dialog").count(), 0);
  const afterInvalidation = await returning.evaluate(() => JSON.parse(localStorage.getItem("squeek.predictor.v1")));
  assert.ok(afterInvalidation.entries.every((e) => !e.result));
  returnControl.now += 120_000;
  await returning.clock.fastForward(120_000);
  await returning.getByRole("dialog", { name: "He chose to sprint." }).waitFor();
  const recovered = await returning.evaluate(() => JSON.parse(localStorage.getItem("squeek.predictor.v1")));
  assert.deepEqual(recovered.entries.map((e) => e.result?.player.total), [30, 35]);
  assert.deepEqual(recovered.entries.map((e) => e.result?.player.streak), [1, 2]);
  assert.equal(recovered.collection.filter((i) => i.mode === "live").length, 2);
  assert.equal(returnControl.olderPages, 1);
  await returning.screenshot({ path: `${scratch}/return-result-390.png` });
  await audit(returning, "return-result");
  await returning.getByRole("button", { name: "Close result" }).click();
  assert.equal(await returning.locator(".score-numbers > div").first().locator("strong").textContent(), "35");
  await returning.getByRole("button", { name: "All time", exact: true }).click();
  assert.equal(await returning.locator(".score-numbers > div").first().locator("strong").textContent(), "65");
  await returning.reload();
  await returning.getByRole("button", { name: "All time", exact: true }).click();
  assert.equal(await returning.locator(".score-numbers > div").first().locator("strong").textContent(), "65");
  assert.equal(await returning.getByRole("dialog").count(), 0);
  report(
    "eight-day return recovers old and new results",
    "390px: locked #101, returned eight days later, locked #1253; both waited for supplied evidence and a 409 cursor restart, then older backfill resolved +30/+35, streak 2, two artworks, weekly 35/all-time 65; reload did not duplicate points.",
  );
  await returnCtx.close();

  const staleControl = { now: base, stale: true, requests: [] };
  const staleCtx = await browser.newContext();
  await mockFeed(staleCtx, staleControl);
  const stale = await staleCtx.newPage();
  await stale.clock.install({ time: base });
  await stale.goto(origin);
  await stale.getByText("UNKNOWN", { exact: true }).waitFor();
  assert.equal(await stale.locator(".scene-hamster").count(), 0);
  assert.ok(
    await stale
      .getByRole("button", { name: "Waiting for wheel feed", exact: true })
      .isDisabled(),
  );
  report(
    "stale handling",
    "A stale IDLE/ACTIVE measurement is unknown, with no live hamster animation or playable live call.",
  );
  const schemaControl = { now: base, schema: true, requests: [] };
  const schemaCtx = await browser.newContext();
  await mockFeed(schemaCtx, schemaControl);
  const schemaPage = await schemaCtx.newPage();
  await schemaPage.clock.install({ time: base });
  await schemaPage.goto(origin);
  await schemaPage.getByText("OFFLINE", { exact: true }).waitFor();
  assert.ok(
    await schemaPage
      .getByText(/Unknown feed format or schema version/)
      .isVisible(),
  );
  report(
    "unknown schema handling",
    "Unrecognized schemaVersion fails closed with a visible explanation.",
  );

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of ["Play", "Art", "Awards"]) {
      await page
        .locator('nav[aria-label="Game sections"] button')
        .nth(["Play", "Art", "Awards"].indexOf(label))
        .click();
      const dims = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: document.documentElement.clientWidth,
      }));
      assert.ok(dims.scroll <= dims.width, `${width}/${label} overflow`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Pause wheel animation" }).click();
  assert.ok(
    await page
      .getByRole("button", { name: "Resume wheel animation" })
      .isVisible(),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.effect?.getTiming().iterations === Infinity &&
              a.playState === "running",
          ).length,
    ),
    0,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.activeElement).outlineStyle,
    ),
    "solid",
  );
  await audit(page, "practice-board");
  report(
    "responsive and motion",
    "Play, collection and achievements have no overflow at 320/390/1440; reduced motion stops loops; pause and keyboard focus work.",
  );

  const noJsCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  });
  const noJs = await noJsCtx.newPage();
  await noJs.goto(`${origin}/preview/`);
  assert.equal(await noJs.locator("#root").isVisible(), false);
  const explanation = await noJs.locator("noscript .boot p").boundingBox();
  const reload = await noJs.getByRole("link", { name: "Reload the game" }).boundingBox();
  assert.ok(explanation.y >= 0 && explanation.y + explanation.height <= 844);
  assert.ok(reload.y >= 0 && reload.y + reload.height <= 844);
  await noJs.screenshot({ path: `${scratch}/no-javascript-390.png` });
  await noJsCtx.close();
  report("JavaScript disabled", "The explanation and reload link appear immediately on the first 390×844 screen; the loading root is hidden.");

  const bootCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const bootControl = { now: base, offline: true, requests: [] };
  await mockFeed(bootCtx, bootControl);
  await bootCtx.route("**/assets/index-*.js", (route) => route.abort("failed"));
  const bootPage = await bootCtx.newPage();
  await bootPage.clock.install({ time: base });
  await bootPage.goto(`${origin}/preview/`);
  assert.ok(await bootPage.getByText("Waking the hamster and loading the game…").isVisible());
  assert.equal(await bootPage.evaluate(() => document.getAnimations().filter(
    (a) => a.playState === "running" && a.effect.getTiming().iterations === Infinity,
  ).length), 0);
  await bootPage.screenshot({ path: `${scratch}/boot-reduced-motion-390.png` });
  await bootPage.clock.fastForward(20_001);
  await bootPage.getByRole("heading", { name: "The game didn’t start" }).waitFor();
  const bootRetry = await bootPage.getByRole("button", { name: "Try again", exact: true }).boundingBox();
  assert.ok(bootRetry.y + bootRetry.height <= 844);
  await bootPage.screenshot({ path: `${scratch}/boot-error-390.png` });
  await bootCtx.unroute("**/assets/index-*.js");
  await bootPage.getByRole("button", { name: "Try again", exact: true }).click();
  await bootPage.getByText("OFFLINE", { exact: true }).waitFor();
  bootControl.offline = false;
  await bootPage.getByRole("button", { name: "Retry now", exact: true }).click();
  await bootPage.getByRole("button", { name: "Lock my prediction", exact: true }).waitFor();
  assert.ok(await bootPage.getByText("LIVE", { exact: true }).isVisible());
  await bootCtx.close();
  report("boot and API recovery", "Blocked entry keeps visible static loading with no reduced-motion loop, then shows a retry error after 20 virtual seconds; retry mounts the game, and feed Retry now recovers from OFFLINE to LIVE.");
  assert.deepEqual(errors, []);
  report(
    "browser runtime",
    "No uncaught JavaScript errors across tested flows.",
  );
  await ctx.close();
  await liveCtx.close();
  await friendCtx.close();
  await staleCtx.close();
  await schemaCtx.close();
  let safari;
  try {
    safari = await webkit.launch({ headless: true });
  } catch {
    reports.push({
      name: "WebKit",
      passed: null,
      details: "WebKit runtime unavailable; Safari behavior not verified.",
    });
    console.log(
      "LIMIT WebKit runtime unavailable; Safari behavior not verified.",
    );
  }
  if (safari) {
    const sc = await safari.newContext({
      viewport: { width: 390, height: 844 },
    });
    await mockFeed(sc, offline);
    const sp = await sc.newPage();
    await sp.goto(origin);
    await sp.getByRole("button", { name: "Practice", exact: true }).click();
    await sp.getByRole("button", { name: "Nap Zero work" }).click();
    await sp
      .getByRole("button", { name: "Lock practice call", exact: true })
      .click();
    await sp.getByRole("button", { name: "Reveal practice round" }).click();
    await sp.getByRole("dialog", { name: "A nap it is." }).waitFor();
    await safari.close();
    report("WebKit practice", "Primary lock/reveal flow passed.");
  }
  await writeFile(`${scratch}/results.json`, JSON.stringify(reports, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
