// "Which Jingo Candy Are You?" — scoring (pure; no DOM).
// Each chosen option awards 1 point to every product id in its `scores`.
// Highest total wins. Tie-break 1: a tied candy scored by the Q7 answer (the
// last answer). Tie-break 2: earliest in `rarityOrder`.

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
