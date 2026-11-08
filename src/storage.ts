import { EMPTY_STATE } from "./game";
import type { GameState } from "./types";

export const STORAGE_KEY = "squeek.predictor.v1";
export function loadState(): { state: GameState; available: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: structuredClone(EMPTY_STATE), available: true };
    const s = JSON.parse(raw);
    if (
      s.version !== 1 ||
      !Array.isArray(s.entries) ||
      !Array.isArray(s.collection) ||
      typeof s.achievements !== "object" ||
      s.achievements === null ||
      s.entries.some(
        (e: any) =>
          !Number.isSafeInteger(e.round) ||
          !e.pick ||
          !e.ai ||
          !["NAP", "SPRINT"].includes(e.pick.call) ||
          !["live", "practice"].includes(e.mode),
      )
    )
      throw new Error("Unsupported local save");
    return { state: s as GameState, available: true };
  } catch {
    return { state: structuredClone(EMPTY_STATE), available: false };
  }
}
export function saveState(state: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
