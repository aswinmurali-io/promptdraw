// Small subsequence fuzzy matcher: every query character must appear in order. Higher is
// better; consecutive runs and word starts score more. Null means no match.
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct + (direct === 0 || /\W/.test(t[direct - 1] ?? "") ? 200 : 0);
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const at = t.indexOf(ch, ti);
    if (at < 0) return null;
    run = at === ti ? run + 1 : 0;
    score += 10 + run * 5 + (at === 0 || /\W/.test(t[at - 1] ?? "") ? 15 : 0) - Math.min(at - ti, 10);
    ti = at + 1;
  }
  return score;
}
