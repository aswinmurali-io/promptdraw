// Which lines of a recompiled prompt are new, so the Prompt panel can bring them into view and
// flash them: ticking an intention or changing a setting adds a section far down the prompt.

/**
 * The lines of `next` (as a [start, end) range of line indexes) that differ from `prev`, found
 * from the lines the two share at the start and at the end. Null when nothing was added or
 * changed (a pure removal) or when most of the prompt changed (a tab switch, a reset), where a
 * flash would say nothing.
 */
export function changedLines(prev: string, next: string, maxShare = 0.6): [number, number] | null {
  if (prev === next) return null;
  const a = prev.split("\n");
  const b = next.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const range: [number, number] = [start, b.length - end];
  // Trim blank lines at the edges: a section's spacing is not news.
  while (range[0] < range[1] && !b[range[0]]!.trim()) range[0]++;
  while (range[1] > range[0] && !b[range[1] - 1]!.trim()) range[1]--;
  if (range[1] <= range[0]) return null;
  if (range[1] - range[0] > Math.max(3, b.length * maxShare)) return null;
  return range;
}
