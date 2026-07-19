/**
 * Subsequence fuzzy matcher in the spirit of fzy/fzf scoring.
 * Returns null when `query` is not a subsequence of `target`, otherwise a
 * score where higher is better.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;
  if (q.length > t.length) return null;

  let score = 0;
  let ti = 0;
  let prevMatch = -2;

  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return null;

    if (idx === 0) {
      score += 15; // match at the very start
    } else if (isWordBoundary(target, idx)) {
      score += 10; // match at a word boundary (camelCase, -, _, ., space)
    }
    if (idx === prevMatch + 1) {
      score += 8; // consecutive matches
    }
    score -= Math.min(idx - ti, 10) * 0.5; // penalize gaps a bit

    prevMatch = idx;
    ti = idx + 1;
  }

  // Prefer shorter targets so exact-ish names outrank long paths.
  score += Math.max(0, 20 - (t.length - q.length) * 0.25);
  return score;
}

function isWordBoundary(target: string, idx: number): boolean {
  const prev = target[idx - 1];
  if (prev === undefined) return true;
  if ('-_./ \\'.includes(prev)) return true;
  const cur = target[idx];
  return prev === prev.toLowerCase() && cur === cur.toUpperCase() && /[a-z]/i.test(cur);
}
