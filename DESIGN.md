# CustomerZero — Design & Branding Guidelines

Source of truth for the CustomerZero design tokens. Implemented in `src/app/globals.css` as a Tailwind v4 `@theme` block — use the generated utilities (e.g. `bg-obsidian`, `text-heading`, `font-fraktion`, `shadow-sm-2`) instead of hardcoding values.

## Design Tokens

```css
@theme {
  /* Colors */
  --color-pure-black: #000000;
  --color-obsidian: #1a1a1a;
  --color-graphite: #333333;
  --color-iron: #5a5a5a;
  --color-slate: #666666;
  --color-steel: #808080;
  --color-fog: #a0a0a0;
  --color-ash: #bfbfbf;
  --color-mist: #dedfe1;
  --color-cloud: #edeff2;
  --color-paper: #f7f8fa;
  --color-white: #ffffff;
  --color-glacier-tint: #e2e7fc;
  --color-badge-slate: #6f6f6f;

  /* Typography */
  --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-fraktion: 'Fraktion', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 12px;
  --leading-caption: 1.4;
  --text-body-sm: 14px;
  --leading-body-sm: 1.5;
  --text-body: 16px;
  --leading-body: 1.5;
  --text-subheading: 20px;
  --leading-subheading: 1.4;
  --text-heading-sm: 24px;
  --leading-heading-sm: 1.3;
  --text-heading: 32px;
  --leading-heading: 1.2;
  --text-display: 56px;
  --leading-display: 1.2;

  /* Spacing */
  --spacing-8: 8px;
  --spacing-16: 16px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-56: 56px;
  --spacing-72: 72px;
  --spacing-80: 80px;

  /* Border Radius */
  --radius-sm: 2px;

  /* Shadows */
  --shadow-sm: rgba(0, 0, 0, 0.04) 0px 2px 4px 0px;
  --shadow-sm-2: rgba(0, 0, 0, 0.04) 0px 2px 4px 0px, rgba(0, 0, 0, 0.08) 0px 8px 32px 0px;
}
```

## Colors

A grayscale ramp from `pure-black` → `white`, plus two accents:

| Token | Hex | Role |
|---|---|---|
| `pure-black` | `#000000` | Highest-contrast ink |
| `obsidian` | `#1a1a1a` | Primary text |
| `graphite` | `#333333` | Strong text / dark surfaces |
| `iron` | `#5a5a5a` | Secondary text |
| `slate` | `#666666` | Secondary text |
| `steel` | `#808080` | Muted text |
| `fog` | `#a0a0a0` | Placeholder / disabled |
| `ash` | `#bfbfbf` | Strong borders |
| `mist` | `#dedfe1` | Borders |
| `cloud` | `#edeff2` | Subtle fills / dividers |
| `paper` | `#f7f8fa` | Page / card background |
| `white` | `#ffffff` | Base surface |
| `glacier-tint` | `#e2e7fc` | Accent tint (highlights) |
| `badge-slate` | `#6f6f6f` | Badge fill |

Use as Tailwind utilities: `bg-paper`, `text-obsidian`, `border-mist`, etc.

## Typography

- **Inter** — primary UI font. Loaded via `next/font/google` in `src/app/layout.tsx` (variable `--font-inter`) and set as the default `--font-sans`.
- **Fraktion** — display/brand font (`font-fraktion`). Font files are not in the repo yet; it currently falls back to the system stack. Add the files under `src/app/fonts/` and load via `next/font/local` with variable `--font-fraktion` when available.

Type scale (use `text-<name>`; line-height is baked in):

| Utility | Size | Line height |
|---|---|---|
| `text-caption` | 12px | 1.4 |
| `text-body-sm` | 14px | 1.5 |
| `text-body` | 16px | 1.5 |
| `text-subheading` | 20px | 1.4 |
| `text-heading-sm` | 24px | 1.3 |
| `text-heading` | 32px | 1.2 |
| `text-display` | 56px | 1.2 |

Implementation note: in `globals.css` the `--leading-*` values are wired as Tailwind v4 `--text-<name>--line-height` pairs, so each `text-*` utility sets both font-size and line-height.

## Spacing

The scale is 8px-based: 8, 16, 24, 32, 40, 48, 56, 72, 80 — as pixel values.

⚠️ These override Tailwind's default numeric steps of the same name: `p-8` is **8px** (not 32px), `gap-16` is **16px** (not 64px). Numeric steps not in the scale (e.g. `p-1`–`p-4`) still resolve via Tailwind's default `0.25rem` multiplier — prefer the brand steps above for layout.

## Radius & Shadows

- `rounded-sm` → 2px. Corners are sharp; use `rounded-sm` as the default.
- `shadow-sm` → subtle 1-layer shadow for resting elements.
- `shadow-sm-2` → 2-layer shadow for elevated elements (popovers, cards on hover).
