// Precompiled at build time (scripts/build-validators.mjs). The hosted CSP has no
// 'unsafe-eval', so runtime schema compilation (new Function) would stop the app mounting.
import * as validators from "./validation/validators.js";
import { mergeSettlements, WEEK_MS } from "./game";
import type { Entry, History, Settlement, Status } from "./types";

export const API = "https://api.squeekchain.com";
export class FeedError extends Error {
  retryAt: number;
  constructor(
    message: string,
    retryAt = 0,
    readonly status?: number,
  ) {
    super(message);
    this.retryAt = retryAt;
  }
}
export function retryAfterMs(value: string | null, now: number) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - now) || 0;
}
let cooldown = 0;
export const cooldownUntil = () => cooldown;
export async function readApi(
  path: string,
  kind: "status" | "history" | "events",
): Promise<any> {
  if (Date.now() < cooldown)
    throw new FeedError("Feed is resting after a rate limit.", cooldown);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${API}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (response.status === 429 || response.status === 503) {
      cooldown = Math.max(
        cooldown,
        Date.now() +
          Math.max(
            10_000,
            retryAfterMs(response.headers.get("Retry-After"), Date.now()),
          ),
      );
      throw new FeedError(
        `Feed unavailable (HTTP ${response.status}). Retrying after its requested pause.`,
        cooldown,
      );
    }
    if (!response.ok)
      throw new FeedError(
        `Feed unavailable (HTTP ${response.status}).`,
        0,
        response.status,
      );
    const data = await response.json();
    const valid: boolean = Boolean(validators[kind](data));
    if (!valid)
      throw new FeedError(
        "Unknown feed format or schema version. Waiting for a compatible response.",
      );
    if (kind !== "status" && data.status !== "available")
      throw new FeedError(`History unavailable: ${data.reason ?? "unknown"}.`);
    if (
      kind !== "status" &&
      (data.chain?.chainId !== "11155111" || data.chain?.target !== "sepolia")
    )
      throw new FeedError("Unexpected network. This game only reads Sepolia.");
    if (
      Date.parse(data.generatedAt) > Date.now() + 30_000 ||
      Date.now() - Date.parse(data.generatedAt) > 120_000
    )
      throw new FeedError("Feed snapshot is stale.");
    return data;
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError(
      error instanceof Error && error.name === "AbortError"
        ? "Feed timed out. Retrying automatically."
        : "Wheel feed offline. Retrying automatically.",
    );
  } finally {
    clearTimeout(timer);
  }
}
function uint(value: unknown): number {
  const n = Number(value);
  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(n) ||
    n < 0
  )
    throw new FeedError("Settlement contains an unsupported number.");
  return n;
}
export function normalizeSettlement(
  raw: any,
  transactionHash = raw.transactionHash,
  blockTimestamp = raw.blockTimestamp,
): Settlement {
  const s: Settlement = {
    transactionHash,
    blockTimestamp,
    previousSettledThroughRound: uint(raw.previousSettledThroughRound),
    settledThroughRound: uint(raw.settledThroughRound),
    workAdded: raw.workAdded,
    completedBlockCount: uint(raw.completedBlockCount),
    activeRoundCount: uint(raw.activeRoundCount),
  };
  if (
    !/^0x[0-9a-f]{64}$/.test(s.transactionHash) ||
    !Number.isFinite(Date.parse(s.blockTimestamp)) ||
    typeof s.workAdded !== "string" ||
    !/^\d+$/.test(s.workAdded) ||
    s.settledThroughRound <= s.previousSettledThroughRound
  )
    throw new FeedError("Incomplete settlement.");
  return s;
}
export async function fetchStatus(): Promise<Status> {
  return readApi("/v1/status", "status");
}
export async function fetchHistory(range: "24h" | "7d"): Promise<History> {
  const data = await readApi(`/v1/settlements?range=${range}`, "history");
  return {
    installationId: data.installationId,
    generatedAt: data.generatedAt,
    range,
    buckets: data.buckets,
    recentSettlements: data.recentSettlements.map((s: any) =>
      normalizeSettlement(s),
    ),
    nextRound:
      data.mining?.status === "available" ? data.mining.nextRound : undefined,
  };
}
// A checkpoint lets bounded polls and transient failures resume an older backfill.
export type EventScan = {
  rows: Settlement[];
  cursor: string;
  installationId: string;
  cutoff: number;
};
export async function fetchEvents(
  existing: Settlement[],
  installationId: string | null,
  progress: (rows: Settlement[], continuation: EventScan | null) => void,
  saved: Entry[] = [],
  resume: EventScan | null = null,
): Promise<{
  rows: Settlement[];
  complete: boolean;
  installationId: string;
  continuation: EventScan | null;
}> {
  let cursor: string | null = resume?.cursor ?? null;
  let rows = mergeSettlements(existing, resume?.rows ?? []);
  const known = new Set(existing.map((s) => s.transactionHash));
  let cutoff = Math.min(Date.now() - WEEK_MS, resume?.cutoff ?? Infinity);
  let feedInstallation = resume?.installationId ?? installationId;
  let continuation: EventScan | null = resume;
  for (let page = 0; page < 40; page++) {
    const data = await readApi(
      `/v1/events?category=protocol&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      "events",
    );
    if (feedInstallation && data.installationId !== feedInstallation)
      throw new FeedError(
        "Feed installation changed. Reload to start on the new installation.",
      );
    feedInstallation = data.installationId;
    const pending = saved.filter(
      (e) =>
        e.mode === "live" &&
        !e.result &&
        e.installationId === feedInstallation,
    );
    // Evidence must reach every pending lock, even after the AI's training window expires.
    for (const entry of pending) {
      const lockedAt = Date.parse(entry.lockedAt);
      if (Number.isFinite(lockedAt)) cutoff = Math.min(cutoff, lockedAt);
    }
    let overlap = false;
    for (const event of data.events) {
      if (event.type !== "system.settlement_completed") continue;
      if (
        event.eventVersion !== 2 ||
        event.source.kind !== "chain" ||
        event.source.chainId !== "11155111"
      )
        throw new FeedError("Unsupported settlement event.");
      // The schema only admits "safe" chain events; anything else is still pending
      // (shown from /v1/status) and must never resolve a call.
      if (event.source.confirmationStatus !== "safe") continue;
      const s = normalizeSettlement(
        event.payload,
        event.source.transactionHash,
        event.occurredAt,
      );
      rows.push(s);
      if (known.has(s.transactionHash)) overlap = true;
    }
    rows = mergeSettlements(existing, rows).filter(
      (s) => Date.parse(s.blockTimestamp) >= cutoff,
    );
    const reachedPast = data.events.some(
      (e: any) => Date.parse(e.occurredAt) < cutoff,
    );
    const frontier = rows.at(-1)?.settledThroughRound ?? -1;
    const pendingCovered = pending.every(
      (e) =>
        e.round > frontier ||
        rows.some(
          (s) =>
            s.previousSettledThroughRound < e.round &&
            s.settledThroughRound >= e.round &&
            Date.parse(s.blockTimestamp) > Date.parse(e.lockedAt),
        ),
    );
    // A known recent event proves incremental overlap, not coverage of an older saved call.
    const complete =
      !data.nextCursor || reachedPast || (overlap && pendingCovered);
    continuation = complete
      ? null
      : {
          rows,
          cursor: data.nextCursor,
          installationId: feedInstallation!,
          cutoff,
        };
    progress(rows, continuation);
    if (complete)
      return {
        rows,
        complete: true,
        installationId: feedInstallation!,
        continuation,
      };
    cursor = data.nextCursor;
  }
  return {
    rows,
    complete: false,
    installationId: feedInstallation!,
    continuation,
  };
}
