/**
 * ISO-3166-1 alpha-2 → regional-indicator-letter flag emoji.
 *
 * Small pure helper. Kept in `src/lib/frontend/` so the leaderboard table,
 * the live-activity feed, and any future country-aware surface all render
 * flags identically.
 *
 * Returns the 🌍 globe for:
 *   - falsy input
 *   - the synthetic "XX" sentinel used when Vercel's edge geolocation
 *     couldn't resolve the visitor's country
 *   - anything that isn't exactly two letters
 *
 * Note: the code-point math assumes the input is uppercase ASCII letters.
 * The normalization layer (`normalizeCountryCode` in the submit route)
 * uppercases before write, so callers can safely pass the raw column value.
 */
export function getFlagEmoji(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode === 'XX') return '🌍';
  if (!/^[A-Za-z]{2}$/.test(countryCode)) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
