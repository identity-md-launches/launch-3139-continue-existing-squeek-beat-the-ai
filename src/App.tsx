import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  CloudMoon,
  Download,
  Flame,
  Flag,
  GraduationCap,
  Image,
  Moon,
  Pause,
  Play,
  Radio,
  RotateCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ACHIEVEMENTS,
  decodeDuel,
  earnedAchievements,
  encodeDuel,
  feedHealth,
  observeDistance,
  outcome,
  confirmedSettlements,
  explainAi,
  predict,
  resolveEntries,
  settlementLedger,
  roundTiming,
  totals,
  weekStart,
} from "./game";
import type { DistanceObservation } from "./game";
import { BRACKETS } from "./types";
import { useFeed } from "./useFeed";
import { loadState, saveState } from "./storage";
import { practiceSettlement } from "./practice";
import { ArtCanvas } from "./ArtCanvas";
import { PixelHamster, WheelScene } from "./Characters";
import { drawArt } from "./art";
import type {
  Bracket,
  Call,
  Entry,
  GameState,
  Pick,
  Settlement,
  Status,
} from "./types";

const achievementIcons: Record<string, LucideIcon> = {
  flag: Flag,
  moon: Moon,
  flame: Flame,
  zap: Zap,
  target: Target,
  graduation: GraduationCap,
  swords: Swords,
  image: Image,
  cloud: CloudMoon,
};
const format = new Intl.NumberFormat("en");
const utc = (value: string | number) =>
  new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
const callLabel = (p: Pick) =>
  `${p.call === "NAP" ? "Nap" : "Sprint"}${p.call === "SPRINT" ? ` · ${p.bracket} blocks` : ""}`;
const countdown = (ms: number) =>
  !Number.isFinite(ms)
    ? "Unknown"
    : ms <= 0
      ? "Due now"
      : `${Math.floor(ms / 60_000)
          .toString()
          .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
          .toString()
          .padStart(2, "0")}`;

export default function App() {
  const [now, setNow] = useState(Date.now());
  const [state, setState] = useState<GameState>(() => loadState().state);
  const { feed, retry } = useFeed(state.entries);
  const [storageOk, setStorageOk] = useState(() => loadState().available);
  const [mode, setMode] = useState<"live" | "practice">("live");
  const [view, setView] = useState<
    "play" | "collection" | "achievements" | "about"
  >("play");
  const [call, setCall] = useState<Call | null>(null);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [message, setMessage] = useState("");
  const [paused, setPaused] = useState(false);
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [resultEntry, setResultEntry] = useState<Entry | null>(null);
  const [art, setArt] = useState<Settlement | null>(null);
  const [toast, setToast] = useState<string[]>([]);
  const [shareLink, setShareLink] = useState("");
  const [artLimit, setArtLimit] = useState(4);
  const [duelDismissed, setDuelDismissed] = useState(false);
  const [duelHash] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get("duel"),
  );
  const duel = duelHash ? decodeDuel(duelHash) : null;
  const dialog = useRef<HTMLDialogElement>(null);
  const artDialog = useRef<HTMLDialogElement>(null);
  const focusBeforeDialog = useRef<HTMLElement | null>(null);
  const lastSeenResults = useRef(
    new Set(
      state.entries
        .filter((e) => e.result)
        .map((e) => `${e.mode}:${e.installationId}:${e.round}`),
    ),
  );
  const distanceBaseline = useRef<DistanceObservation | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!saveState(state)) setStorageOk(false);
  }, [state]);
  const health = feedHealth(
    feed.status,
    feed.statusAt,
    !!feed.statusError,
    now,
  );
  const timing = roundTiming(
    feed.status,
    feed.settlements,
    now,
    feed.history?.nextRound,
  );
  const practiceEntries = state.entries.filter((e) => e.mode === "practice");
  const practiceRound =
    Math.max(
      0,
      ...practiceEntries.filter((e) => e.result).map((e) => e.round),
    ) + 1;
  const round = mode === "practice" ? practiceRound : timing.round;
  const installationId =
    mode === "practice" ? "practice-v1" : (feed.status?.installationId ?? "");
  const entries = state.entries.filter(
    (e) => e.mode === mode && e.installationId === installationId,
  );
  const locked = entries.find((e) => e.round === round);
  const practiceHistory = practiceEntries.flatMap((e) =>
    e.result ? [e.result.settlement] : [],
  );
  const liveSettlements = confirmedSettlements(feed.settlements, feed.status);
  const ai =
    locked?.ai ??
    predict(mode === "practice" ? practiceHistory : liveSettlements, now);
  const historyReady =
    !!feed.history &&
    feed.historyComplete &&
    !feed.historyError &&
    !feed.eventsError &&
    now - feed.historyAt < 120_000 &&
    now - feed.eventsAt < 120_000 &&
    feed.history.installationId === feed.status?.installationId &&
    feed.eventsInstallationId === feed.status?.installationId;
  const liveReady =
    health === "live" &&
    historyReady &&
    !timing.closed &&
    feed.status?.oracle.state === "accepted" &&
    feed.status?.settlementQueue.status === "available";
  const canCall = mode === "practice" || liveReady;
  const score = totals(entries, period === "week" ? weekStart(now) : 0);
  const latestResult = entries
    .filter((e) => e.result)
    .sort((a, b) => b.round - a.round)[0];
  const streak = latestResult?.result?.player.streak ?? 0;
  const collection = state.collection.filter((i) => i.mode === mode);
  const showDuel = !duelDismissed && !!duelHash && mode === "live";
  const duelValid =
    duel &&
    duel.round === round &&
    duel.installationId === installationId &&
    now < duel.closesAt &&
    !timing.closed;
  const m = feed.status?.measurement;
  if (mode === "live" && round !== null && m && health === "live")
    distanceBaseline.current = observeDistance(
      distanceBaseline.current,
      round,
      m.distanceMm,
      m.counterEpoch,
    );
  const trackedDistance =
    mode === "live" &&
    health === "live" &&
    m &&
    distanceBaseline.current &&
    !distanceBaseline.current.interrupted
      ? Math.max(0, m.distanceMm - distanceBaseline.current.baseline) / 1000
      : null;
  const wheelAsleep = mode === "practice" ? false : m?.coreStatus === "IDLE";
  const latest =
    mode === "practice"
      ? [...practiceHistory].reverse()
      : [...liveSettlements].reverse();

  useEffect(() => {
    setCall(null);
    setBracket(null);
    setMessage("");
    setShareLink("");
  }, [round, mode]);
  useEffect(() => {
    if (
      !feed.settlements.length ||
      feed.eventsInstallationId !== feed.status?.installationId
    )
      return;
    setState((s) => {
      const live = {
        ...s,
        entries: s.entries.filter(
          (e) =>
            e.mode === "live" &&
            e.installationId === feed.status?.installationId,
        ),
      };
      // Only confirmed settlements resolve calls; submitted ones stay pending.
      const resolved = resolveEntries(
        live,
        confirmedSettlements(feed.settlements, feed.status),
        Date.now(),
        "live",
      );
      if (resolved === live) return s;
      const map = new Map(
        resolved.entries.map((e) => [`${e.installationId}:${e.round}`, e]),
      );
      return {
        ...s,
        entries: s.entries.map((e) =>
          e.mode === "live"
            ? (map.get(`${e.installationId}:${e.round}`) ?? e)
            : e,
        ),
      };
    });
  }, [
    feed.settlements,
    feed.status,
    feed.eventsInstallationId,
  ]);
  useEffect(() => {
    const newly = state.entries.filter(
      (e) =>
        e.result &&
        !lastSeenResults.current.has(
          `${e.mode}:${e.installationId}:${e.round}`,
        ),
    );
    if (!newly.length) return;
    newly.forEach((e) =>
      lastSeenResults.current.add(`${e.mode}:${e.installationId}:${e.round}`),
    );
    setResultEntry(newly[newly.length - 1]);
    setState((s) => {
      const items = [...s.collection];
      newly.forEach((e) => {
        const key = `${e.mode}:${e.installationId}:${e.result!.settlement.transactionHash}`;
        if (!items.some((i) => i.key === key))
          items.push({
            key,
            settlement: e.result!.settlement,
            collectedAt: new Date().toISOString(),
            mode: e.mode,
          });
      });
      return { ...s, collection: items };
    });
  }, [state.entries]);
  useEffect(() => {
    const earned = earnedAchievements(state, mode, now).filter(
      (id) => !state.achievements[`${mode}:${id}`],
    );
    if (!earned.length) return;
    setState((s) => ({
      ...s,
      achievements: {
        ...s.achievements,
        ...Object.fromEntries(
          earned.map((id) => [`${mode}:${id}`, new Date().toISOString()]),
        ),
      },
    }));
    setToast((t) => [
      ...t,
      ...earned.map(
        (id) =>
          `${mode === "practice" ? "Practice · " : ""}${ACHIEVEMENTS.find((a) => a[0] === id)![1]}`,
      ),
    ]);
  }, [state, mode, now]);
  useEffect(() => {
    if (resultEntry && dialog.current && !dialog.current.open) {
      focusBeforeDialog.current = document.activeElement as HTMLElement;
      dialog.current.showModal();
    }
  }, [resultEntry]);
  useEffect(() => {
    if (art && artDialog.current && !artDialog.current.open) {
      focusBeforeDialog.current = document.activeElement as HTMLElement;
      artDialog.current.showModal();
    }
  }, [art]);

  function lockCall() {
    setMessage("");
    if (!call) {
      setMessage("Choose Nap or Sprint first.");
      return;
    }
    if (call === "SPRINT" && !bracket) {
      setMessage("Choose a block bracket for your sprint.");
      return;
    }
    if (
      round === null ||
      locked ||
      (mode === "live" &&
        (!liveReady ||
          roundTiming(
            feed.status,
            feed.settlements,
            Date.now(),
            feed.history?.nextRound,
          ).closed))
    ) {
      setMessage(
        "This round is closed or the feed is unknown. Try practice while you wait.",
      );
      return;
    }
    if (mode === "live" && showDuel && !duelValid) {
      setMessage(
        "This duel is no longer open. Dismiss it to make a call on the current round.",
      );
      return;
    }
    const entry: Entry = {
      round,
      pick: { call, bracket: call === "SPRINT" ? bracket : null },
      ai,
      lockedAt: new Date().toISOString(),
      closesAt: mode === "practice" ? Date.now() + 600_000 : timing.closesAt,
      mode,
      installationId,
      ...(duelValid && mode === "live" ? { friend: duel.pick } : {}),
    };
    setState((s) => ({ ...s, entries: [...s.entries, entry] }));
    setMessage("Call locked. The Professor’s call is locked too.");
  }
  function revealPractice() {
    if (!locked || locked.result) return;
    const settled = practiceSettlement(
      round!,
      Math.max(Date.now(), Date.parse(locked.lockedAt) + 1),
    );
    setNow(Date.parse(settled.blockTimestamp));
    setState((s) =>
      resolveEntries(
        s,
        [settled],
        Date.parse(settled.blockTimestamp),
        "practice",
      ),
    );
  }
  function collect(s: Settlement) {
    const key = `${mode}:${installationId}:${s.transactionHash}`;
    setState((st) =>
      st.collection.some((i) => i.key === key)
        ? st
        : {
            ...st,
            collection: [
              ...st.collection,
              {
                key,
                settlement: s,
                collectedAt: new Date().toISOString(),
                mode,
              },
            ],
          },
    );
  }
  async function share() {
    if (!locked || mode !== "live") return;
    const url = new URL(location.href);
    url.hash = `duel=${encodeDuel({ version: 1, round: locked.round, pick: locked.pick, installationId, closesAt: locked.closesAt })}`;
    setShareLink(url.href);
    try {
      await navigator.clipboard.writeText(url.href);
      setMessage(
        "Duel link copied. Your friend must call before the round closes.",
      );
    } catch {
      setMessage("Copy the duel link below.");
    }
  }
  function download(s: Settlement) {
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1080;
    drawArt(c, s);
    const a = document.createElement("a");
    a.download = `squeek-${mode}-round-${s.settledThroughRound}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  }
  function closeResult() {
    dialog.current?.close();
    setResultEntry(null);
    restoreFocus();
  }
  function closeArt() {
    artDialog.current?.close();
    setArt(null);
    restoreFocus();
  }
  function restoreFocus() {
    if (focusBeforeDialog.current?.isConnected)
      focusBeforeDialog.current.focus();
    else document.getElementById("main")?.focus();
  }
  function changeView(v: typeof view) {
    setView(v);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      <header className="site-header wrap">
        <button
          className="brand"
          onClick={() => changeView("play")}
          aria-label="Squeek home"
        >
          <img src="./favicon.svg" alt="" />
          <span>
            squeek<span className="brand-sub">Beat-the-AI Predictor</span>
          </span>
        </button>
        <div className="header-actions">
          <span className="network-label">
            <span />
            Sepolia playground
          </span>
          <button
            className="help-button"
            aria-label="How to play"
            onClick={() => changeView("about")}
          >
            <CircleHelp size={18} />
            <span>How to play</span>
          </button>
        </div>
      </header>
      <main id="main" className="wrap" tabIndex={-1}>
        <div className="intro-row">
          <div>
            <h1>
              Small hamster.
              <br className="mobile-break" /> <span>Big predictions.</span>
            </h1>
            <p>Outguess the AI with a real hamster.</p>
          </div>
          <div className="points-note">
            <ShieldCheck size={18} />
            <span>
              Free to play
              <br />
              Points only
            </span>
          </div>
        </div>
        <div className="navigation-row">
          <nav aria-label="Game sections">
            {(["play", "collection", "achievements"] as const).map((v) => (
              <button
                key={v}
                className={view === v ? "nav-active" : ""}
                aria-current={view === v ? "page" : undefined}
                onClick={() => changeView(v)}
              >
                {v === "play" ? (
                  <Swords size={17} />
                ) : v === "collection" ? (
                  <Image size={17} />
                ) : (
                  <Trophy size={17} />
                )}
                <span className="desktop-nav">
                  {v === "play"
                    ? "The arena"
                    : v === "collection"
                      ? "Collection"
                      : "Achievements"}
                </span>
                <span className="mobile-nav">
                  {v === "play"
                    ? "Play"
                    : v === "collection"
                      ? "Art"
                      : "Awards"}
                </span>
                {v === "collection" && collection.length > 0 && (
                  <span className="count">{collection.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="mode-control" aria-label="Game mode">
            <button
              onClick={() => setMode("live")}
              aria-pressed={mode === "live"}
            >
              Live
            </button>
            <button
              onClick={() => setMode("practice")}
              aria-pressed={mode === "practice"}
            >
              Practice
            </button>
          </div>
        </div>
        {!storageOk && (
          <div className="notice">
            Local storage is unavailable or your save could not be read. This
            session still works, but progress may not survive a reload.
          </div>
        )}
        {mode === "practice" && (
          <div className="practice-notice">
            <Sparkles size={17} />
            <span>
              <strong>PRACTICE</strong> · Fixed simulated rounds. Scores, art
              and achievements stay separate.
            </span>
            <button onClick={() => setMode("live")}>
              Back to live <ArrowRight size={15} />
            </button>
          </div>
        )}
        {showDuel && (
          <div className="duel-notice">
            <Swords size={24} />
            <div>
              <strong>
                {duel
                  ? "A friend has challenged you."
                  : "This duel link is invalid."}
              </strong>
              <p>
                {duel
                  ? `Round #${duel.round} · Friend called ${callLabel(duel.pick)}. ${duelValid ? "Make your own call below." : "That round is closed, unavailable, or belongs to a different installation."}`
                  : "Ask your friend for a new link."}
              </p>
              <small>
                Shared calls are editable in the link. This is a friendly local
                challenge; results do not sync.
              </small>
            </div>
            <button
              className="icon-button"
              onClick={() => setDuelDismissed(true)}
              aria-label="Dismiss friend duel"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {view === "play" && (
          <>
            <div className="arena-layout">
              <section className="arena" aria-label="Prediction arena">
                <div className="round-heading">
                  <div className="round-number">
                    <span className="round-icon">
                      <Flag size={18} />
                    </span>
                    <h2>
                      {mode === "practice"
                        ? "Practice round"
                        : timing.closed && round !== null
                          ? "Settling round"
                          : "Open round"}{" "}
                      <span>#{round ?? "?"}</span>
                    </h2>
                  </div>
                  <div className="round-timer">
                    <span>
                      {mode === "practice"
                        ? "You set the pace"
                        : timing.closed
                          ? "Waiting for settlement"
                          : "Expected settlement"}
                    </span>
                    <strong>
                      {mode === "practice" ? (
                        <Sparkles size={18} />
                      ) : (
                        countdown(timing.expectedAt - now)
                      )}
                    </strong>
                  </div>
                </div>
                <div className="game-board">
                  <div className="wheel-column">
                    <div className="wheel-label">
                      <span
                        className={`feed-label ${health === "live" && mode === "live" ? "online" : ""}`}
                      >
                        <i />
                        {mode === "practice"
                          ? "PRACTICE"
                          : health === "live"
                            ? "LIVE"
                            : health === "offline"
                              ? "OFFLINE"
                              : "UNKNOWN"}
                      </span>
                      <span>
                        {mode === "practice"
                          ? "Simulated"
                          : health === "live" && m
                            ? `${utc(m.receivedAt)} UTC`
                            : "Wheel feed unknown"}
                      </span>
                    </div>
                    <WheelScene
                      health={mode === "practice" ? "practice" : health}
                      asleep={wheelAsleep}
                      rpm={
                        mode === "practice"
                          ? 42
                          : health === "live" && m
                            ? m.rpmMilli / 1000
                            : 0
                      }
                      paused={paused}
                    />
                    <div className="wheel-readings">
                      <div>
                        <strong>
                          {mode === "practice"
                            ? "42.0"
                            : health === "live" && m
                              ? (m.rpmMilli / 1000).toFixed(1)
                              : "?"}
                        </strong>
                        <span>
                          rpm{" "}
                          {mode === "live" && health === "live" && wheelAsleep
                            ? "· idle"
                            : "· wheel"}
                        </span>
                      </div>
                      <div>
                        <strong>
                          {trackedDistance === null
                            ? "?"
                            : trackedDistance.toFixed(1)}{" "}
                          <small>m</small>
                        </strong>
                        <span>this round, since visit</span>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={
                          paused
                            ? "Resume wheel animation"
                            : "Pause wheel animation"
                        }
                        onClick={() => setPaused((p) => !p)}
                      >
                        {paused ? <Play size={16} /> : <Pause size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="prediction-column">
                    <div className="prediction-heading">
                      <span className="step-number">1</span>
                      <h3>What’s his next move?</h3>
                    </div>
                    <p className="control-hint">
                      Predict the next settled round.
                    </p>
                    <div
                      className="call-options"
                      role="group"
                      aria-label="Choose Nap or Sprint"
                    >
                      <button
                        className={`call-option nap ${call === "NAP" || locked?.pick.call === "NAP" ? "selected" : ""}`}
                        aria-pressed={
                          locked ? locked.pick.call === "NAP" : call === "NAP"
                        }
                        disabled={!!locked}
                        onClick={() => {
                          setCall("NAP");
                          setMessage("");
                        }}
                      >
                        <Moon size={24} />
                        <strong>Nap</strong>
                        <span>Zero work</span>
                        {(call === "NAP" || locked?.pick.call === "NAP") && (
                          <Check className="selection-check" size={15} />
                        )}
                      </button>
                      <button
                        className={`call-option sprint ${call === "SPRINT" || locked?.pick.call === "SPRINT" ? "selected" : ""}`}
                        aria-pressed={
                          locked
                            ? locked.pick.call === "SPRINT"
                            : call === "SPRINT"
                        }
                        disabled={!!locked}
                        onClick={() => {
                          setCall("SPRINT");
                          setMessage("");
                        }}
                      >
                        <Zap size={24} />
                        <strong>Sprint</strong>
                        <span>Some work</span>
                        {(call === "SPRINT" ||
                          locked?.pick.call === "SPRINT") && (
                          <Check className="selection-check" size={15} />
                        )}
                      </button>
                    </div>
                    <div
                      className={`bracket-section ${(locked?.pick.call ?? call) !== "SPRINT" ? "bracket-muted" : ""}`}
                    >
                      <div className="prediction-heading">
                        <span className="step-number">2</span>
                        <h3>If sprint, how many blocks?</h3>
                      </div>
                      <div
                        className="bracket-options"
                        role="group"
                        aria-label="Sprint block bracket"
                      >
                        {BRACKETS.map((b) => (
                          <button
                            key={b}
                            aria-pressed={
                              (locked?.pick.bracket ?? bracket) === b
                            }
                            className={
                              (locked?.pick.bracket ?? bracket) === b
                                ? "selected"
                                : ""
                            }
                            disabled={!!locked || call !== "SPRINT"}
                            onClick={() => setBracket(b)}
                          >
                            {b.replace("-", "–")}
                          </button>
                        ))}
                      </div>
                    </div>
                    {locked ? (
                      <div className="locked-area">
                        <div className="locked-call">
                          <Check size={17} />
                          <strong>{callLabel(locked.pick)} locked</strong>
                        </div>
                        {mode === "practice" ? (
                          <button
                            className="primary-button"
                            onClick={revealPractice}
                          >
                            Reveal practice round <Sparkles size={18} />
                          </button>
                        ) : (
                          <>
                            <p className="pending-text">
                              Waiting for settlement. Your call stays saved.
                            </p>
                            <button
                              className="secondary-button share-button"
                              onClick={share}
                            >
                              <Share2 size={16} />
                              Duel a friend
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <button
                          className="primary-button"
                          onClick={lockCall}
                          disabled={!canCall || (showDuel && !duelValid)}
                        >
                          {mode === "practice"
                            ? "Lock practice call"
                            : !canCall
                              ? health !== "live"
                                ? "Waiting for wheel feed"
                                : timing.closed
                                  ? "Waiting for settlement"
                                  : "Loading the Professor…"
                              : "Lock my prediction"}
                          <ArrowRight size={18} />
                        </button>
                        <p className="lock-hint">
                          {mode === "practice"
                            ? "Try a call, then reveal the fixed outcome."
                            : canCall
                              ? `Calls close in ${countdown(timing.closesAt - now)}. No edits after locking.`
                              : "Try Practice for an instant game while you wait."}
                          {!canCall && mode === "live" && (
                            <button
                              className="inline-button"
                              onClick={() => setMode("practice")}
                            >
                              Play practice <ArrowRight size={14} />
                            </button>
                          )}
                        </p>
                      </>
                    )}
                    <p className="form-message" role="status">
                      {message}
                    </p>
                    {mode === "live" &&
                      (feed.statusError || feed.historyError || feed.eventsError) && (
                        <div className="feed-notice" role="alert">
                          <Radio size={18} />
                          <div>
                            <strong>
                              {feed.statusError
                                ? "Can’t reach the wheel feed"
                                : "Settlement history is unavailable"}
                            </strong>
                            <p>
                              {feed.statusError ?? feed.historyError ?? feed.eventsError}{" "}
                              {feed.retryAt > now
                                ? `Next attempt no earlier than ${utc(feed.retryAt)} UTC.`
                                : "It retries by itself with a gradual backoff."}{" "}
                              Saved predictions wait for a confirmed settlement. Practice
                              works offline.
                            </p>
                          </div>
                          <button
                            className="secondary-button"
                            onClick={retry}
                            disabled={feed.retryAt > now}
                          >
                            <RotateCw size={16} /> Retry now
                          </button>
                        </div>
                      )}
                    {shareLink && (
                      <label className="share-field">
                        Copy your duel link
                        <input
                          readOnly
                          value={shareLink}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <small>
                          One-way challenge. Your friend compares your calls
                          locally.
                        </small>
                      </label>
                    )}
                  </div>
                </div>
                <div className="professor-strip">
                  <div className="professor-avatar">
                    <PixelHamster professor />
                  </div>
                  <div className="professor-copy">
                    <strong>
                      Professor Whiskers <span>AI rival</span>
                    </strong>
                    <p>
                      {mode === "live" && !historyReady
                        ? "“Checking my settlement notes.”"
                        : ai.call === "NAP"
                          ? "“My calculations suggest a little snooze.”"
                          : "“I sense a wheel-y productive round.”"}
                    </p>
                    {!(mode === "live" && !historyReady) && (
                      <p className="professor-reason">{explainAi(ai)}</p>
                    )}
                  </div>
                  <div
                    className={`professor-pick ${ai.call === "NAP" ? "nap-pick" : ""}`}
                  >
                    {mode === "live" && !historyReady ? (
                      <span>Studying…</span>
                    ) : (
                      <>
                        {ai.call === "NAP" ? (
                          <Moon size={18} />
                        ) : (
                          <Zap size={18} />
                        )}
                        <strong>{callLabel(ai)}</strong>
                      </>
                    )}
                  </div>
                </div>
                <details className="ai-details">
                  <summary>
                    Show the Professor’s thinking <ChevronRight size={16} />
                  </summary>
                  <div>
                    <p>
                      <strong>
                        {Math.round(ai.hourProbability * 100)}% sprint
                      </strong>{" "}
                      {ai.fallback
                        ? "across available rounds (no samples for this UTC hour)"
                        : `for UTC hour ${ai.hour.toString().padStart(2, "0")}:00`}
                      . Last 3:{" "}
                      <strong>
                        {ai.lastThree.length
                          ? ai.lastThree
                              .map((c) => (c === "NAP" ? "nap" : "sprint"))
                              .join(", ")
                          : "no settled history yet"}
                      </strong>
                      .
                    </p>
                    <p>
                      70% hour history + 30% recent momentum ={" "}
                      {Math.round(ai.probability * 100)}% sprint. At 50% or
                      more, he calls Sprint. His bracket is the most common past
                      sprint bracket, with ties going smaller.
                    </p>
                    <p>
                      {ai.samples} usable rounds in the last 7 days;{" "}
                      {ai.hourSamples} in this hour; {ai.bracketSamples} bracket
                      samples.{" "}
                      {ai.samples === 0
                        ? "No history: a disclosed 50% prior and 1–10 bracket. "
                        : ""}
                      This is a fixed rule, not a measured accuracy rate.{" "}
                      {mode === "practice"
                        ? "Practice uses only your practice history."
                        : feed.historyComplete
                          ? "Seven-day event scan complete."
                          : "Live history is still loading."}
                    </p>
                  </div>
                </details>
              </section>
              <aside className="score-panel">
                <div className="score-title">
                  <Trophy size={21} />
                  <h2>The friendly rivalry</h2>
                </div>
                <div className="score-period" aria-label="Score period">
                  <button
                    aria-pressed={period === "week"}
                    onClick={() => setPeriod("week")}
                  >
                    This week
                  </button>
                  <button
                    aria-pressed={period === "all"}
                    onClick={() => setPeriod("all")}
                  >
                    All time
                  </button>
                </div>
                <div className="score-portraits">
                  <div>
                    <div className="player-avatar">
                      <span>You</span>
                      <Sparkles size={20} />
                    </div>
                    <strong>You</strong>
                  </div>
                  <span className="versus">vs</span>
                  <div>
                    <div className="score-professor">
                      <PixelHamster professor />
                    </div>
                    <strong>The Professor</strong>
                  </div>
                </div>
                <div className="score-numbers">
                  <div>
                    <strong>{format.format(score.player)}</strong>
                    <span>points</span>
                  </div>
                  <span>:</span>
                  <div>
                    <strong>{format.format(score.ai)}</strong>
                    <span>points</span>
                  </div>
                </div>
                <div className="score-verdict">
                  {score.rounds === 0
                    ? "Your first call starts the rivalry."
                    : score.player > score.ai
                      ? "You have the upper paw."
                      : score.player < score.ai
                        ? "The Professor is ahead. For now."
                        : "Paw to paw. It’s a tie."}
                </div>
                <div className="streak-row">
                  <div>
                    <Flame size={19} />
                    <span>Current streak</span>
                  </div>
                  <strong>
                    {streak} <span>{streak === 1 ? "call" : "calls"}</span>
                  </strong>
                </div>
                <p className="local-note">
                  {mode === "practice"
                    ? "Practice scores only."
                    : "Saved only in this browser."}
                  <br />
                  Not a global leaderboard.
                </p>
                <div className="scoring-help">
                  <strong>Good instincts add up.</strong>
                  <span>
                    Correct call <b>+10</b>
                  </span>
                  <span>
                    Exact sprint bracket <b>+15</b>
                  </span>
                  <span>
                    Each streak step <b>+5</b>
                  </span>
                  <small>
                    First correct call: +5 bonus.
                    <br />
                    Then +10, +15… A miss resets it.
                  </small>
                </div>
              </aside>
            </div>
            {mode === "live" && <SettlementLedger status={feed.status} settlements={liveSettlements} />}
            <ActivityStrip
              buckets={feed.history?.buckets ?? []}
              offline={!!feed.historyError || now - feed.historyAt > 120_000}
              practice={mode === "practice"}
            />
            <div className="section-heading">
              <div>
                <h2>Art from the wheel</h2>
                <p>
                  Every settlement leaves a fingerprint. Keep your favourites.
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => changeView("collection")}
              >
                My collection <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="art-grid">
              {latest.slice(0, artLimit).map((s) => (
                <ArtCard
                  key={s.transactionHash}
                  settlement={s}
                  collected={collection.some(
                    (i) => i.settlement.transactionHash === s.transactionHash,
                  )}
                  onOpen={() => setArt(s)}
                  onCollect={() => collect(s)}
                />
              ))}
              {!latest.length && (
                <div className="empty-state">
                  <Image size={26} />
                  <div>
                    <strong>
                      {mode === "practice"
                        ? "Your first artwork is one call away."
                        : "Waiting for real settlement art."}
                    </strong>
                    <p>
                      {mode === "practice"
                        ? "Lock a prediction and reveal your practice round."
                        : "Art appears from confirmed settlements, never made-up live rounds."}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {latest.length > artLimit && (
              <button
                className="secondary-button more-art"
                onClick={() => setArtLimit((n) => n + 4)}
              >
                Show more settled art <ChevronRight size={16} />
              </button>
            )}
            <div className="achievement-preview">
              <div className="achievement-preview-icon">
                <Trophy size={23} />
              </div>
              <div>
                <h3>A little collection of firsts.</h3>
                <p>
                  {
                    ACHIEVEMENTS.filter(
                      (a) => state.achievements[`${mode}:${a[0]}`],
                    ).length
                  }{" "}
                  of 9 achievements unlocked{" "}
                  {mode === "practice" ? "in practice" : "locally"}.
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => changeView("achievements")}
              >
                See achievements <ArrowRight size={17} />
              </button>
            </div>
            {entries.length > 0 && (
              <section className="history-section">
                <div className="section-heading">
                  <div>
                    <h2>Your calls</h2>
                    <p>Saved here, ready when the settlement arrives.</p>
                  </div>
                </div>
                <div className="call-history">
                  {[...entries]
                    .reverse()
                    .slice(0, 15)
                    .map((e) => (
                      <div key={e.round}>
                        <strong>#{e.round}</strong>
                        <span>{callLabel(e.pick)}</span>
                        <span>
                          {e.result
                            ? `${e.result.player.total} points · ${e.result.player.correct ? "Correct call" : "Missed call"}`
                            : "Waiting for settlement"}
                        </span>
                        {e.result && (
                          <button
                            className="text-button"
                            onClick={() => setResultEntry(e)}
                          >
                            View result <ChevronRight size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </section>
            )}
          </>
        )}

        {view === "collection" && (
          <section className="collection-view">
            <div className="section-heading">
              <div>
                <h2>Your tiny art gallery</h2>
                <p>
                  {collection.length} locally collected pieces.{" "}
                  {mode === "practice"
                    ? "Fixed practice settlements."
                    : "Made from real settlement hashes."}
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() => changeView("play")}
              >
                Back to arena <ArrowRight size={16} />
              </button>
            </div>
            <div className="art-grid">
              {[...collection].reverse().map((i) => (
                <ArtCard
                  key={i.key}
                  settlement={i.settlement}
                  collected
                  onOpen={() => setArt(i.settlement)}
                  onCollect={() => download(i.settlement)}
                  download
                />
              ))}
              {!collection.length && (
                <div className="empty-state">
                  <Image size={30} />
                  <div>
                    <h3>An empty wall, for now.</h3>
                    <p>
                      Collect art from a recent settlement or complete your
                      first round.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => changeView("play")}
                    >
                      Make a prediction <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
        {view === "achievements" && (
          <section className="achievements-view">
            <div className="section-heading">
              <div>
                <h2>Small victories, well earned.</h2>
                <p>
                  {mode === "practice" ? "Practice" : "Live"} achievements stay
                  in this browser. No badges, prizes or rewards.
                </p>
              </div>
            </div>
            <div className="achievement-grid">
              {ACHIEVEMENTS.map(([id, name, description, icon]) => {
                const unlocked = state.achievements[`${mode}:${id}`],
                  Icon = achievementIcons[icon];
                return (
                  <article
                    key={id}
                    className={`achievement ${unlocked ? "unlocked" : ""}`}
                  >
                    <div className="achievement-symbol">
                      <Icon size={25} />
                    </div>
                    <div>
                      <h3>{name}</h3>
                      <p>{description}</p>
                      <span>
                        {unlocked
                          ? `Unlocked ${new Date(unlocked).toLocaleDateString("en", { timeZone: "UTC" })}`
                          : "Still to discover"}
                      </span>
                    </div>
                    {unlocked && <Check size={18} />}
                  </article>
                );
              })}
            </div>
          </section>
        )}
        {view === "about" && <About onPlay={() => changeView("play")} />}
      </main>
      <footer className="wrap site-footer">
        <div>
          <span className="footer-brand">squeek</span>
          <p>One hamster. Two sets of instincts.</p>
        </div>
        <div className="footer-links">
          <button onClick={() => changeView("about")}>About & rules</button>
          <a
            href="https://docs.squeekchain.com/"
            target="_blank"
            rel="noreferrer"
          >
            Squeekchain docs <ArrowUpRight size={14} />
          </a>
          <a
            href="https://squeekchain.com/genesis/code"
            target="_blank"
            rel="noreferrer"
          >
            Genesis /code <ArrowUpRight size={14} />
          </a>
        </div>
        <p className="footer-disclaimer">
          Community project · Built through{" "}
          <a href="https://imd.fun/" target="_blank" rel="noreferrer">
            IdentityMD
          </a>
          .<br />
          Sepolia testnet only · November 2026 · $SQK has not launched on
          mainnet.
          <br />
          Points only. No money, prizes, airdrops or Genesis approval.
        </p>
      </footer>
      <div className="toast-region" role="status">
        {toast[0] && (
          <div className="toast">
            <Trophy size={22} />
            <div>
              <span>Achievement unlocked</span>
              <strong>{toast[0]}</strong>
            </div>
            <button
              className="icon-button"
              aria-label="Dismiss achievement"
              onClick={() => setToast((t) => t.slice(1))}
            >
              <X size={18} />
            </button>
          </div>
        )}
      </div>
      <dialog
        ref={dialog}
        className="result-dialog"
        aria-labelledby="result-title"
        onCancel={() => {
          setResultEntry(null);
          restoreFocus();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeResult();
        }}
      >
        {resultEntry?.result && (
          <ResultReveal entry={resultEntry} onClose={closeResult} />
        )}
      </dialog>
      <dialog
        ref={artDialog}
        className="art-dialog"
        aria-labelledby="art-title"
        onCancel={() => {
          setArt(null);
          restoreFocus();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeArt();
        }}
      >
        {art && (
          <>
            <div className="dialog-heading">
              <h2 id="art-title">Round #{art.settledThroughRound}</h2>
              <button
                className="icon-button"
                aria-label="Close artwork"
                onClick={closeArt}
              >
                <X size={20} />
              </button>
            </div>
            <ArtCanvas settlement={art} size={720} />
            <p>
              {outcome(art) === "NAP"
                ? "A quiet little universe."
                : "A little burst of wheel energy."}{" "}
              {art.workAdded} work units · {art.completedBlockCount} blocks.
            </p>
            <p className="hash-text">Seed: {art.transactionHash}</p>
            <button className="primary-button" onClick={() => download(art)}>
              Download artwork <Download size={18} />
            </button>
          </>
        )}
      </dialog>
    </>
  );
}

function ArtCard({
  settlement: s,
  collected,
  onOpen,
  onCollect,
  download = false,
}: {
  settlement: Settlement;
  collected: boolean;
  onOpen: () => void;
  onCollect: () => void;
  download?: boolean;
}) {
  return (
    <article className="art-card">
      <button
        className="art-open"
        onClick={onOpen}
        aria-label={`View artwork for round ${s.settledThroughRound}`}
      >
        <ArtCanvas settlement={s} />
        <span className="art-round">#{s.settledThroughRound}</span>
      </button>
      <div className="art-card-details">
        <div>
          <h3>
            {outcome(s) === "NAP"
              ? "Midnight murmurs"
              : s.completedBlockCount > 60
                ? "Wheel in full bloom"
                : "A little momentum"}
          </h3>
          <span>
            {s.completedBlockCount} blocks ·{" "}
            {outcome(s) === "NAP" ? "Nap" : "Sprint"}
          </span>
        </div>
        <button
          className="icon-button collect-button"
          aria-label={
            download
              ? `Download round ${s.settledThroughRound}`
              : collected
                ? `Round ${s.settledThroughRound} collected`
                : `Collect round ${s.settledThroughRound}`
          }
          disabled={collected && !download}
          onClick={onCollect}
        >
          {download ? (
            <Download size={18} />
          ) : collected ? (
            <Check size={18} />
          ) : (
            <Image size={18} />
          )}
        </button>
      </div>
    </article>
  );
}

const rangeLabel = (first: number, last: number) =>
  first === last ? `Round #${first}` : `Rounds #${first}–${last}`;
const stageLabel = {
  submitted: "Submitted to Ethereum · awaiting confirmation",
  queued: "Closed · queued for submission",
  closed: "Closed by the oracle · not yet submitted",
} as const;
function SettlementLedger({
  status,
  settlements,
}: {
  status: Status | null;
  settlements: Settlement[];
}) {
  const ledger = settlementLedger(status);
  const recent = [...settlements]
    .filter((s) => ledger.through === null || s.settledThroughRound <= ledger.through)
    .reverse()
    .slice(0, 4);
  return (
    <section className="ledger-section" aria-label="Settlement status">
      <div className="activity-heading">
        <div>
          <h2>Confirmed vs pending</h2>
          <p>
            Calls score only after Ethereum confirms the settlement. Submitted
            rounds wait here.
          </p>
        </div>
      </div>
      <div className="ledger-grid">
        <div className="ledger-card ledger-confirmed">
          <h3>
            <Check size={16} /> Confirmed
          </h3>
          <p className="ledger-lead">
            {ledger.through === null
              ? "Waiting for /v1/status."
              : `Settled through round #${ledger.through}${ledger.confirmedAt ? ` · ${utc(ledger.confirmedAt)} UTC` : ""}`}
          </p>
          <ul>
            {recent.map((s) => (
              <li key={`${s.transactionHash}:${s.settledThroughRound}`}>
                <span>
                  {rangeLabel(
                    s.previousSettledThroughRound + 1,
                    s.settledThroughRound,
                  )}
                </span>
                <span>
                  {outcome(s) === "NAP"
                    ? "Nap"
                    : `Sprint · ${s.completedBlockCount} blocks`}
                </span>
              </li>
            ))}
            {!recent.length && <li>No confirmed settlements loaded yet.</li>}
          </ul>
        </div>
        <div className="ledger-card ledger-pending">
          <h3>
            <Radio size={16} /> Pending
          </h3>
          <p className="ledger-lead">
            {ledger.pending.length
              ? "Not settled. Never scored until confirmed."
              : ledger.through === null
                ? "Unknown until the feed answers."
                : "Nothing waiting for confirmation."}
          </p>
          <ul>
            {ledger.pending.map((p) => (
              <li key={`${p.stage}:${p.first}`}>
                <span>{rangeLabel(p.first, p.last)}</span>
                <span>
                  {stageLabel[p.stage]}
                  {p.at ? ` · ${utc(p.at)} UTC` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ActivityStrip({
  buckets,
  offline,
  practice,
}: {
  buckets: import("./types").Bucket[];
  offline: boolean;
  practice: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const matching = buckets.filter((b) => {
      const start = new Date(b.startAt).getUTCHours(),
        duration = (Date.parse(b.endAt) - Date.parse(b.startAt)) / 3_600_000;
      return Array.from(
        { length: Math.min(24, duration) },
        (_, i) => (start + i) % 24,
      ).includes(hour);
    });
    const active = matching.reduce((n, b) => n + Number(b.activeRoundCount), 0),
      count = matching.reduce((n, b) => n + Number(b.settlementCount), 0);
    return {
      hour,
      active,
      count,
      ratio: count ? active : null,
    };
  });
  const mostActive = Math.max(1, ...hours.map((h) => h.active));
  return (
    <section className="activity-section" aria-label="24-hour activity pattern">
      <div className="activity-heading">
        <div>
          <h2>A creature of habit?</h2>
          <p>
            {practice
              ? "Activity history belongs to the live game."
              : "Sprint pattern by UTC hour, from the last 7 days."}
          </p>
        </div>
        <span>
          <span className="legend-square" />
          More active
        </span>
      </div>
      <div className="hour-strip">
        {hours.map((h) => (
          <button
            key={h.hour}
            data-hour={h.hour.toString().padStart(2, "0")}
            aria-label={`${h.hour.toString().padStart(2, "0")}:00 UTC: ${offline || practice || h.ratio === null ? "unknown" : `${h.active} active rounds in this six-hour window across the last 7 days`}`}
            aria-pressed={selected === h.hour}
            className={`${selected === h.hour ? "hour-selected" : ""} ${h.hour === new Date().getUTCHours() ? "current-hour" : ""}`}
            onClick={() => setSelected(h.hour)}
            style={
              {
                "--activity":
                  offline || practice || h.ratio === null
                    ? "#e5e0d8"
                    : `hsl(18 70% ${89 - (h.active / mostActive) * 47}%)`,
              } as React.CSSProperties
            }
          >
            <span />
          </button>
        ))}
      </div>
      <div className="hour-axis">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00 UTC</span>
      </div>
      <p className="bucket-note">
        {selected !== null
          ? `${selected.toString().padStart(2, "0")}:00 UTC · ${offline || practice || hours[selected].ratio === null ? "Unknown" : `${hours[selected].active} active rounds in this six-hour window across 7 days`}. `
          : ""}
        {offline && !practice ? "History offline / unknown. " : ""}7-day buckets
        span six hours; neighbouring hours share a value. Colour is relative to
        the busiest window, not an hourly probability.
      </p>
    </section>
  );
}

function ResultReveal({
  entry: e,
  onClose,
}: {
  entry: Entry;
  onClose: () => void;
}) {
  const r = e.result!;
  return (
    <div className="reveal-content">
      <div className="dialog-heading">
        <span>
          {e.mode === "practice" ? "PRACTICE · " : "LIVE · "}Round #{e.round}{" "}
          settled
        </span>
        <button
          className="icon-button"
          aria-label="Close result"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="reveal-symbol">
        {outcome(r.settlement) === "NAP" ? (
          <Moon size={38} />
        ) : (
          <Zap size={38} />
        )}
      </div>
      <h2 id="result-title">
        {outcome(r.settlement) === "NAP"
          ? "A nap it is."
          : "He chose to sprint."}
      </h2>
      <p>
        {r.settlement.workAdded} work units · {r.settlement.completedBlockCount}{" "}
        completed blocks.
      </p>
      <h3>
        {r.won
          ? "You outguessed the Professor!"
          : r.player.total === r.ai.total
            ? "Great minds, equal points."
            : "The Professor takes this one."}
      </h3>
      <div className="result-score-row">
        <div>
          <span>You</span>
          <strong>+{r.player.total}</strong>
        </div>
        <span>vs</span>
        <div>
          <span>Professor</span>
          <strong>+{r.ai.total}</strong>
        </div>
      </div>
      <div className="point-breakdown">
        <span>
          Correct call <b>+{r.player.base}</b>
        </span>
        <span>
          Exact bracket <b>+{r.player.bracket}</b>
        </span>
        <span>
          Streak bonus <b>+{r.player.bonus}</b>
        </span>
      </div>
      <p>
        Streak: {r.player.streak} correct{" "}
        {r.player.streak === 1 ? "call" : "calls"}. Artwork added to your local
        collection.
      </p>
      {r.friend && (
        <p className="duel-result">
          Friend duel:{" "}
          {(r.duelPlayer?.total ?? 0) > r.friend.total
            ? "You win"
            : (r.duelPlayer?.total ?? 0) < r.friend.total
              ? "Your friend wins"
              : "It’s a tie"}{" "}
          · You {r.duelPlayer?.total ?? 0}, friend {r.friend.total}. Both duel
          streaks start at this duel.
        </p>
      )}
      {r.settlement.settledThroughRound -
        r.settlement.previousSettledThroughRound >
        1 && (
        <p>
          This settlement covers several rounds. The game uses its whole
          settlement outcome and bracket for each covered prediction; individual
          work is not available.
        </p>
      )}
      <button className="primary-button" onClick={onClose}>
        Back to the arena <ArrowRight size={17} />
      </button>
    </div>
  );
}

function About({ onPlay }: { onPlay: () => void }) {
  return (
    <section className="about-view">
      <div className="section-heading">
        <div>
          <h2>A game of tiny instincts.</h2>
          <p>
            Squeek Beat-the-AI Predictor is a community project for the
            Squeekchain Buildooooor badge.
          </p>
        </div>
      </div>
      <div className="about-grid">
        <div>
          <h3>Make a call. Meet your rival.</h3>
          <p>
            Predict Nap (zero work) or Sprint (positive work) for the open
            round. If Sprint, choose 1–10, 11–30, 31–60 or 61+ completed Squeek
            blocks. A positive-work settlement with zero completed blocks earns
            no bracket points.
          </p>
          <p>
            Lock before closure. Your call and the Professor’s call stay saved
            in this browser. Both resolve only when a confirmed settlement
            covers the round. Waiting is part of the live game; Practice gives
            you an instant, separate game with fixed outcomes.
          </p>
          <h3>Fair points, same rules</h3>
          <p>
            A correct call earns 10. An exact sprint bracket earns another 15. A
            correct call starts or extends a streak: +5 on the first, +10 on the
            second, +15 on the third, and so on. A miss resets the streak.
            Skipped rounds do not change it.
          </p>
          <p>
            The weekly scoreboard resets at Monday 00:00 UTC. Beat the Professor
            unlocks after a completed week in which you scored more. Local
            scores are not a global leaderboard.
          </p>
          <h3>Duels without accounts</h3>
          <p>
            After locking a live call, share a duel link. It carries the round
            and your prediction; a friend must make their own call before
            closure. Their browser compares the two when it settles. The sender
            does not receive a result. Links are editable, with no identity or
            proof of when the sender called. Both sides start a new streak for
            this duel; your main score keeps its own streak.
          </p>
          <button className="primary-button" onClick={onPlay}>
            Make a prediction <ArrowRight size={18} />
          </button>
        </div>
        <div>
          <h3>How the Professor thinks</h3>
          <p>
            His sprint probability is 70% of the sprint share in this UTC hour
            over available last-seven-day settlements, plus 30% of the last
            three usable rounds’ sprint share. At 50% or higher he calls Sprint.
            His bracket is the most frequent sprint bracket for this hour, then
            all available hours if there are no hour samples; ties go to the
            smaller bracket.
          </p>
          <p>
            No samples for the hour? Use all available hours. No history? Use a
            disclosed 50% prior and 1–10 bracket. He does not use your choice or
            the live wheel speed. Inputs are shown, and the rule is
            deterministic. There is no accuracy claim.
          </p>
          <h3>Real wheel, honest limits</h3>
          <p>
            One accepted wheel-magnet passage is one work unit. Rounds last 600
            seconds; verified work settles on Ethereum and completes Squeek
            blocks. The next round after the settled frontier may already have
            closed, so calls pause while settlement catches up. Its timer is an
            estimate, not a promise.
          </p>
          <p>
            The API reports daily distance. This game shows only distance
            observed since your first live reading in the round, labelled “since
            visit”; it cannot reconstruct distance before your visit. Unknown
            and stale data never means the hamster is asleep.
          </p>
          <p>
            Recent settlements omit zero-block rounds, so the documented
            protocol event feed supplies nap history. Positive multi-round
            batches cannot identify individual activity and are excluded from AI
            training. The game resolves a covered prediction from the batch’s
            aggregate work and blocks. Missing events stay unknown.
          </p>
          <h3>Community, not an endorsement</h3>
          <p>
            Sepolia testnet only, November 2026. $SQK has not launched on
            mainnet. This game has no wallet, money, payments, gambling, prizes,
            airdrops, badges or whitelist. No price, return or earnings
            forecast. No Genesis approval is claimed.
          </p>
          <p>
            Source facts:{" "}
            <a
              href="https://docs.squeekchain.com/developers/api/"
              target="_blank"
              rel="noreferrer"
            >
              official API reference
            </a>{" "}
            and{" "}
            <a
              href="https://docs.squeekchain.com/system/rounds-and-blocks/"
              target="_blank"
              rel="noreferrer"
            >
              rounds and Squeek blocks
            </a>
            . Built through the{" "}
            <a href="https://imd.fun/" target="_blank" rel="noreferrer">
              IdentityMD contributor network
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
