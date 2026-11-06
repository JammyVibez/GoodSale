/**
 * Deterministic monogram avatars, rendered as SVG.
 *
 * Used by /api/avatar and by the launch catalog so seeded Nigerian accounts get
 * stable initial avatars derived from their own names — never third-party stock
 * portrait photos that mismatch the person.
 */

/** Brand-aligned gradients (jade, ink, clay, indigo) chosen so white text stays legible. */
const GRADIENTS: [string, string][] = [
  ['#0f766e', '#134e4a'],
  ['#115e59', '#065f46'],
  ['#1e3a8a', '#1e3a8a'],
  ['#9a3412', '#7c2d12'],
  ['#334155', '#0f172a'],
  ['#0369a1', '#0c4a6e'],
  ['#4c1d95', '#2e1065'],
  ['#065f46', '#022c22'],
];

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;'
  );
}

/** Up to two letters, ignoring titles/symbols so "Engr. Chinedu Okafor" → "CO". */
export function initialsFor(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    // Drop dotted abbreviations/titles ("Engr.", "Dr.") so they never become initials.
    .filter((p) => !/\.$/.test(p))
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function renderAvatarSvg(seedKey: string, initials: string): string {
  const [from, to] = GRADIENTS[hash(seedKey) % GRADIENTS.length];
  const safeInitials = escapeXml(initials);

  const label = safeInitials
    ? `<text x="150" y="150" fill="#ffffff" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" font-size="118" font-weight="700" text-anchor="middle" dominant-baseline="central" letter-spacing="2">${safeInitials}</text>`
    : // Neutral silhouette — no features, so it can represent anybody.
      `<g fill="#ffffff" fill-opacity="0.92">
         <circle cx="150" cy="122" r="46" />
         <path d="M150 182c-52 0-94 31-104 74a8 8 0 0 0 8 9h192a8 8 0 0 0 8-9c-10-43-52-74-104-74z" />
       </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300" role="img">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}" />
      <stop offset="100%" stop-color="${to}" />
    </linearGradient>
  </defs>
  <rect width="300" height="300" fill="url(#g)" />
  ${label}
</svg>`;
}
