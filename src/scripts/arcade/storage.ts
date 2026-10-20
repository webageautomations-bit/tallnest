// Jingo Arcade — tiny best-score / preference store over localStorage.
// Every read and write is wrapped in try/catch: private mode, blocked site
// data or a full quota must never break a game. When storage is unavailable
// values are kept in memory instead, so bests still work for the session.

const PREFIX = "jingo-arcade:";
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(PREFIX + key);
    if (v !== null) return v;
  } catch {
    /* storage blocked — fall through to memory */
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage blocked or full — memory copy is enough */
  }
}

/** Stored value for `key`, or null (missing, unreadable or corrupt). */
export function load<T>(key: string): T | null {
  const raw = read(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    write(key, JSON.stringify(value));
  } catch {
    /* unserialisable — ignore */
  }
}

export const getBest = <T>(game: string): T | null => load<T>(`best:${game}`);

/**
 * Offer a new result for `game`; it is stored when there is no best yet or
 * `isBetter(value, best)` says so. Returns the (possibly updated) best and
 * whether this result set it.
 */
export function recordBest<T>(
  game: string,
  value: T,
  isBetter: (value: T, best: T) => boolean,
): { best: T; isNew: boolean } {
  const best = getBest<T>(game);
  if (best === null || isBetter(value, best)) {
    save(`best:${game}`, value);
    return { best: value, isNew: true };
  }
  return { best, isNew: false };
}

export const higherIsBetter = (a: number, b: number): boolean => a > b;
