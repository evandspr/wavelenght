export const TOTAL_ROUNDS = 5;
export const MAX_SCORE_PER_ROUND = 4;

// Dimensions for the dial
export const DIAL_MIN_DEG = -90;
export const DIAL_MAX_DEG = 90;

// Scoring zones (definitions in percentage width relative to center)
// Colors are Tailwind 'fill-' classes for SVG rendering
export const SCORING_ZONES = [
  { threshold: 4, points: 4, color: 'fill-rose-500' },   // +/- 4% (Bullseye) - Red
  { threshold: 12, points: 3, color: 'fill-amber-400' },  // +/- 12% - Yellow
  { threshold: 22, points: 2, color: 'fill-emerald-500' } // +/- 22% - Green
];

export const FALLBACK_CARDS = [
  { left: 'Hot', right: 'Cold' },
  { left: 'Rough', right: 'Smooth' },
  { left: 'Fantasy', right: 'Sci-Fi' },
  { left: 'Useless', right: 'Useful' },
  { left: 'Trash', right: 'Treasure' },
];