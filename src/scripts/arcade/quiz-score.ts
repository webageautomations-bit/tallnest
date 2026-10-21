// "Which Jingo Candy Are You?" — scoring + question draw (pure; no DOM).
// Each chosen option awards 1 point to every product id in its `scores`.
// Highest total wins. Tie-break 1: a tied candy scored by the FINAL question
// answered. Tie-break 2: earliest in `rarityOrder`.

/**
 * Shuffle the whole pool and take `count`. When the pool is bigger than
 * `count`, retries (a few times) so the set differs from `previous` —
 * a replay gets different questions, not just a different order.
 */
export function drawQuestions<T extends { id: string }>(
  pool: T[],
  count: number,
  previous: string[] = [],
  rng: () => number = Math.random,
): T[] {
  const n = Math.min(count, pool.length);
  const key = (ids: string[]) => ids.slice().sort().join("|");
  const prevKey = key(previous);
  let pick: T[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    pick = a.slice(0, n);
    if (pool.length <= n || key(pick.map((q) => q.id)) !== prevKey) break;
  }
  return pick;
}

export function pickResult(chosen: { scores: string[] }[], rarityOrder: string[]): string {
  const tally = new Map<string, number>();
  for (const opt of chosen) {
    for (const id of opt.scores) tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  const max = Math.max(...tally.values());
  let tied = [...tally].filter(([, n]) => n === max).map(([id]) => id);

  if (tied.length > 1) {
    const last = chosen.at(-1)?.scores ?? [];
    const fromLast = tied.filter((id) => last.includes(id));
    if (fromLast.length) tied = fromLast;
  }
  if (tied.length > 1) {
    const rank = (id: string) => {
      const i = rarityOrder.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    tied.sort((a, b) => rank(a) - rank(b));
  }
  return tied[0];
}
