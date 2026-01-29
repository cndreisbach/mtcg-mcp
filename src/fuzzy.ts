/**
 * Compute the Levenshtein edit distance between two strings.
 * Case-insensitive comparison.
 */
export function computeLevenshteinDistance(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();

  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  // Use two-row approach to save memory
  let prev = new Array<number>(right.length + 1);
  let curr = new Array<number>(right.length + 1);

  for (let j = 0; j <= right.length; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= left.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1,       // deletion
        curr[j - 1]! + 1,   // insertion
        prev[j - 1]! + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[right.length]!;
}

/**
 * Find the closest matches to a query string from a list of candidates.
 * Returns candidates sorted by Levenshtein distance (ascending), limited to maxResults.
 */
export function findClosestMatches(
  query: string,
  candidates: string[],
  maxResults = 5
): string[] {
  const scored = candidates.map((candidate) => ({
    value: candidate,
    distance: computeLevenshteinDistance(query, candidate),
  }));

  scored.sort((a, b) => a.distance - b.distance);

  return scored.slice(0, maxResults).map((s) => s.value);
}
