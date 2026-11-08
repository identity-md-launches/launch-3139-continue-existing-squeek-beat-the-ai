import { useCallback, useEffect, useRef, useState } from "react";
import {
  cooldownUntil,
  FeedError,
  fetchEvents,
  fetchHistory,
  fetchStatus,
} from "./api";
import type { EventScan } from "./api";
import type { Entry, Feed, Settlement } from "./types";

const initial: Feed = {
  status: null,
  history: null,
  settlements: [],
  statusError: null,
  historyError: null,
  eventsError: null,
  statusAt: 0,
  historyAt: 0,
  eventsAt: 0,
  eventsInstallationId: null,
  retryAt: 0,
  historyComplete: false,
  loading: true,
};
export function useFeed(saved: Entry[]) {
  const [feed, setFeed] = useState<Feed>(initial);
  // Bumping the attempt restarts every poll loop at once (the "Retry now" button).
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setFeed((f) => ({ ...f, loading: true }));
    setAttempt((n) => n + 1);
  }, []);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let rows: Settlement[] = [],
      installation: string | null = null,
      complete = false;
    let continuation: EventScan | null = null;
    const loop = (work: () => Promise<void>, base: number) => {
      let failures = 0;
      async function run() {
        try {
          await work();
          failures = 0;
        } catch {
          failures++;
        }
        if (active) {
          const delay = Math.max(
            base * Math.min(16, 2 ** failures),
            cooldownUntil() - Date.now(),
          );
          setFeed((f) => ({ ...f, retryAt: cooldownUntil(), loading: false }));
          timers.push(setTimeout(run, delay));
        }
      }
      void run();
    };
    loop(async () => {
      try {
        const status = await fetchStatus();
        if (active)
          setFeed((f) => ({
            ...f,
            status,
            statusAt: Date.now(),
            statusError: null,
          }));
      } catch (e) {
        if (active)
          setFeed((f) => ({ ...f, statusError: (e as Error).message }));
        throw e;
      }
    }, 10_000);
    loop(async () => {
      try {
        const [day, week] = await Promise.all([
          fetchHistory("24h"),
          fetchHistory("7d"),
        ]);
        if (day.installationId !== week.installationId)
          throw new Error("History installation mismatch.");
        if (active)
          setFeed((f) => ({
            ...f,
            history: week,
            historyAt: Date.now(),
            historyError: null,
          }));
      } catch (e) {
        if (active)
          setFeed((f) => ({ ...f, historyError: (e as Error).message }));
        throw e;
      }
    }, 60_000);
    loop(async () => {
      try {
        const data = await fetchEvents(
          complete ? rows : [],
          installation,
          (partial, checkpoint) => {
            continuation = checkpoint;
            if (active) setFeed((f) => ({ ...f, settlements: partial }));
          },
          savedRef.current,
          continuation,
        );
        rows = data.rows;
        installation = data.installationId;
        complete = data.complete;
        if (active)
          setFeed((f) => ({
            ...f,
            settlements: rows,
            eventsAt: Date.now(),
            eventsInstallationId: data.installationId,
            historyComplete: complete,
            eventsError: null,
          }));
      } catch (e) {
        // Documented cursor invalidation requires a fresh scan, never a completed-history claim.
        if (e instanceof FeedError && (e.status === 400 || e.status === 409)) {
          continuation = null;
          complete = false;
        }
        if (active)
          setFeed((f) => ({
            ...f,
            eventsError: (e as Error).message,
            historyComplete: false,
          }));
        throw e;
      }
    }, 60_000);
    return () => {
      active = false;
      timers.forEach(clearTimeout);
    };
  }, [attempt]);
  return { feed, retry };
}
