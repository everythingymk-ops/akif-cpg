import { repository } from "./index";
import type { WorkspaceSnapshot } from "./types";

/**
 * Keeping two screens on the same data.
 *
 * Three providers each load the workspace on mount; re-reading it on every
 * focus event from each of them would triple an already chatty query. This
 * module owns a single refresh and fans the result out to whoever subscribed,
 * so a refresh is one round trip no matter how many providers are listening.
 *
 * Deliberately not realtime (locked decision): the app refreshes when a tab
 * regains focus, and on a slow poll while it is visible. A colleague's save
 * shows up within a minute, or immediately on tab switch — enough for two
 * people, without a subscription to keep alive and debug.
 */

type Listener = (snapshot: WorkspaceSnapshot) => void;

const listeners = new Set<Listener>();

/** Concurrent callers share one request instead of each issuing their own. */
let inFlight: Promise<WorkspaceSnapshot | null> | null = null;
let lastLoadedAt = 0;

/** Don't re-read on every focus flicker (alt-tabbing, devtools, dialogs). */
const MIN_INTERVAL_MS = 5_000;
/** Slow poll so two people who never switch tabs still converge. */
export const POLL_INTERVAL_MS = 60_000;

export function subscribeToWorkspace(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Re-read the workspace and hand it to every subscriber. `force` skips the
 * rate limit — used after an action that must reflect the server immediately.
 */
export async function refreshWorkspace(force = false): Promise<void> {
  if (listeners.size === 0) return;
  const now = Date.now();
  if (!force && now - lastLoadedAt < MIN_INTERVAL_MS) return;

  inFlight ??= repository.loadWorkspace().finally(() => {
    inFlight = null;
    lastLoadedAt = Date.now();
  });

  try {
    const snapshot = await inFlight;
    if (snapshot) for (const listener of listeners) listener(snapshot);
  } catch (error) {
    // A failed refresh must never blank the screen: the last good snapshot
    // stays on display and the next attempt tries again.
    console.error("Workspace refresh failed", error);
  }
}

/** Marks the moment a provider loaded on its own, so we don't immediately re-read. */
export function markWorkspaceLoaded(): void {
  lastLoadedAt = Date.now();
}

/**
 * Starts the refresh triggers. Idempotent per call site; returns a teardown.
 * Mounted once, by the outermost provider.
 */
export function startWorkspaceAutoRefresh(): () => void {
  if (typeof window === "undefined") return () => {};

  const onFocus = () => void refreshWorkspace();
  const onVisible = () => {
    if (document.visibilityState === "visible") void refreshWorkspace();
  };
  const poll = window.setInterval(() => {
    if (document.visibilityState === "visible") void refreshWorkspace();
  }, POLL_INTERVAL_MS);

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(poll);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
