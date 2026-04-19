/**
 * Player README badge helper.
 *
 * Renders a shields.io achievement badge that links back to the player's
 * Kolk Arena public profile (`/leaderboard/<playerId>`). Designed to be
 * dropped into a GitHub README, project landing page, or social bio so the
 * player's friends-of-friends compound back into Kolk Arena traffic.
 *
 * shields.io URL format reminder (see docs/Kolk_Arena_Launch_Plan_Optimization.md
 * §C2 for in-repo examples like
 * `https://img.shields.io/badge/status-beta-orange`):
 *
 *   /badge/<left>-<right>-<color>
 *
 * Where `<left>` and `<right>` use:
 *   - literal dash `-`  → encode as `--`
 *   - literal underscore `_` → encode as `__`
 *   - space → `_` (or `%20`)
 *
 * The visible label is humanized with a real em-dash for the eye, but the
 * URL itself uses a plain hyphen-pair so shields.io's segment parser does
 * not eat our separator.
 *
 * Returns `null` when the player has no demonstrable achievement to show
 * (e.g., `highestLevel < 0`, `NaN`, or non-finite). Callers MUST guard:
 * a `null` return means "render nothing", not "render a default badge".
 */
import { APP_CONFIG } from '@/lib/frontend/app-config';

export type BadgeColor = 'purple' | 'emerald' | 'green' | 'blue' | 'gray';

export type BadgeInput = {
  playerId: string;
  /** Highest level the player has cleared. -1 / -Infinity / NaN → no badge. */
  highestLevel: number;
  pioneer: boolean;
  displayName?: string | null;
};

export type BadgeOutput = {
  shieldsUrl: string;
  profileUrl: string;
  markdown: string;
  html: string;
  displayLabel: string;
  color: BadgeColor;
};

/**
 * shields.io segment encoder. Per shields docs:
 *   `-` → `--`,  `_` → `__`,  space → `_` (or `%20`).
 * We then `encodeURIComponent` the result so any non-ASCII (em-dash, accent,
 * etc.) survives transit. encodeURIComponent leaves `-` and `_` alone, so the
 * dash/underscore doubling above is what shields actually consumes.
 */
function encodeShieldsSegment(raw: string): string {
  const escaped = raw.replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_');
  return encodeURIComponent(escaped);
}

export function buildPlayerBadge(input: BadgeInput): BadgeOutput | null {
  const { playerId, highestLevel, pioneer } = input;

  // Guard: -Infinity, -1, NaN, undefined-coerced — anything not a real
  // non-negative cleared level → no badge to show.
  if (typeof highestLevel !== 'number' || !Number.isFinite(highestLevel) || highestLevel < 0) {
    return null;
  }

  let label: string;
  let color: BadgeColor;

  if (pioneer) {
    label = 'Kolk Arena — Beta Pioneer';
    color = 'purple';
  } else if (highestLevel === 8) {
    // Edge-case carve-out so a non-pioneer L8 still gets the brightest tier.
    label = 'Kolk Arena — L8 Clear';
    color = 'emerald';
  } else if (highestLevel >= 6) {
    label = `Kolk Arena — L${highestLevel} Clear`;
    color = 'emerald';
  } else if (highestLevel >= 3) {
    label = `Kolk Arena — L${highestLevel} Clear`;
    color = 'green';
  } else if (highestLevel >= 1) {
    label = `Kolk Arena — L${highestLevel} Clear`;
    color = 'blue';
  } else {
    // highestLevel === 0 → only the L0 smoke test was passed.
    label = 'Kolk Arena — L0 Smoke';
    color = 'gray';
  }

  // Visible label keeps the em-dash; URL form swaps it for a plain ASCII
  // hyphen and splits on " - " so shields.io's `<left>-<right>-<color>`
  // parser sees exactly two segments.
  const flat = label.replace(/—/g, '-');
  const splitIdx = flat.indexOf(' - ');
  const lhs = splitIdx >= 0 ? flat.slice(0, splitIdx) : flat;
  const rhs = splitIdx >= 0 ? flat.slice(splitIdx + 3) : '';

  const encodedLhs = encodeShieldsSegment(lhs);
  const encodedRhs = encodeShieldsSegment(rhs);
  const shieldsUrl = `https://img.shields.io/badge/${encodedLhs}-${encodedRhs}-${color}`;
  const profileUrl = `${APP_CONFIG.canonicalOrigin}/leaderboard/${playerId}`;
  const markdown = `[![${label}](${shieldsUrl})](${profileUrl})`;
  const html = `<a href="${profileUrl}"><img alt="${label}" src="${shieldsUrl}" /></a>`;

  return { shieldsUrl, profileUrl, markdown, html, displayLabel: label, color };
}
