/**
 * Keyrook's design tokens: the one place a colour, a line, a font or a
 * movement is decided for every Keyrook product — this extension, the site,
 * and whatever app comes next. `brand.css` is generated from this file by
 * `node scripts/render-brand.mjs`; edit here, never there.
 *
 * The look is drawn by hand: ink on paper, four crayons, lines that wobble a
 * little. What a person must read exactly — a code, an address, a recovery
 * key — is never hand-drawn and never moves.
 */

/** Ink and paper: the crow and the page it sits on. */
export const INK = '#22201C';
export const PAPER = '#FBF8F2';

/**
 * Warm neutrals between paper and ink, for surfaces, lines and quiet text.
 * Dark mode reads the same list from the other end.
 */
export const NEUTRAL = {
  0: '#FFFFFF',
  50: '#FBF8F2',
  100: '#F3EEE4',
  200: '#E6DFD1',
  300: '#CFC7B7',
  400: '#A69F92',
  500: '#7E786D',
  600: '#5C574F',
  700: '#403C36',
  800: '#2C2925',
  900: '#22201C',
  950: '#1A1916',
} as const;

/**
 * Four crayons. The hues of the first icon, moved off Google's exact values so
 * that nothing about the brand reads as theirs. 500 is the crayon itself;
 * lighter stops are mixed with white, darker ones with night (NEUTRAL 950).
 */
export const CRAYON = {
  blue: {
    50: '#EFF3FC', 100: '#DFE8F9', 200: '#BCCEF3', 300: '#95B1EC', 400: '#6992E4',
    500: '#3A6FDB', 600: '#3561BB', 700: '#30539C', 800: '#2B467C', 900: '#263A61',
  },
  red: {
    50: '#FDF0EF', 100: '#FAE2DF', 200: '#F4C1BC', 300: '#EE9D95', 400: '#E77569',
    500: '#E0493A', 600: '#C04134', 700: '#A13A2E', 800: '#813229', 900: '#652B24',
  },
  yellow: {
    50: '#FEF9ED', 100: '#FDF3DB', 200: '#FBE5B1', 300: '#F8D584', 400: '#F5C452',
    500: '#F2B21B', 600: '#CF9A1A', 700: '#AD8119', 800: '#8A6919', 900: '#6C5318',
  },
  green: {
    50: '#EEF7F2', 100: '#DEF0E5', 200: '#B8DFC7', 300: '#8FCCA6', 400: '#61B782',
    500: '#2FA05A', 600: '#2C8A4F', 700: '#287544', 800: '#255F39', 900: '#224C30',
  },
} as const;

export type CrayonName = keyof typeof CRAYON;
export type Stop = keyof (typeof CRAYON)['blue'];

/**
 * Each crayon has one job, in every product. Text in a role colour uses the
 * stop listed, which holds 4.5:1 against its own page — 500 does not for red,
 * yellow or green on white, so they are fills and marks, never text.
 */
export const ROLES = {
  action: { crayon: 'blue', light: 600, dark: 300 },
  danger: { crayon: 'red', light: 600, dark: 300 },
  warning: { crayon: 'yellow', light: 800, dark: 300 },
  success: { crayon: 'green', light: 700, dark: 300 },
} as const satisfies Record<string, { crayon: CrayonName; light: Stop; dark: Stop }>;

/**
 * Type. Keyrook has no handwriting font: the hand shows in what is drawn —
 * the mark, the wordmark, lines and boxes — and words stay in the system's
 * own faces, so all fifty languages look like the same product and none falls
 * back to a stranger's font halfway through a sentence.
 */
export const FONT = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  mono: "'SF Mono', ui-monospace, 'JetBrains Mono', 'Cascadia Code', Menlo, Consolas, monospace",
} as const;

/** Line weights for drawn things, in px at a 24 px icon. */
export const LINE = {
  hair: 1.5,
  pen: 2,
  marker: 3,
} as const;

/**
 * A box drawn by hand: four corners that are not quite the same. Opposite
 * radii pull against each other, which reads as a wobble without an image.
 */
export const SKETCH_RADIUS = '255px 15px 225px 15px / 15px 225px 15px 255px';
export const SKETCH_RADIUS_SMALL = '14px 4px 12px 4px / 4px 12px 4px 14px';

/**
 * Motion. Two hand-drawn movements and the plain ones under them.
 *
 * - boil: a drawing redrawn three times a second, a hair out of place each
 *   time, the way animated pencil lines shimmer. Brief, on arrival, on
 *   drawings only.
 * - draw: a line drawn in by the pen, once.
 *
 * Everything stops for prefers-reduced-motion.
 */
export const MOTION = {
  fast: 120,
  base: 200,
  slow: 400,
  draw: 700,
  boilStep: 150,
  boilRounds: 4,
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;
