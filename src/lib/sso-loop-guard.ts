// Client-side defensive guard against OneSuite <-> child-app SSO ping-pong.
// Never stores tokens — only attempt counters keyed by app slug.

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 3;
const KEY = "tpcamp.sso.attempts";

type Attempts = Record<string, number[]>;

function read(): Attempts {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Attempts;
  } catch {
    return {};
  }
}

function write(value: Attempts) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage disabled — guard degrades to no-op */
  }
}

/** Records a handoff attempt and reports whether the loop threshold was hit. */
export function recordHandoffAttempt(app: string): { looping: boolean; count: number } {
  if (typeof window === "undefined") return { looping: false, count: 0 };
  const now = Date.now();
  const all = read();
  const recent = (all[app] ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  all[app] = recent;
  write(all);
  return { looping: recent.length > MAX_ATTEMPTS, count: recent.length };
}

/** Called once a child app has accepted the handoff, or when the user retries. */
export function clearHandoffAttempts(app?: string) {
  if (typeof window === "undefined") return;
  if (!app) {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  const all = read();
  delete all[app];
  write(all);
}

/** Short, non-sensitive reference shown to the user and useful in logs. */
export function loopErrorReference(app: string) {
  return `SSO-LOOP-${app.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}
