# Dueline: design

Tokens live in `src/styles/app.css`. OKLCH throughout.

## Colour

| Token | Value | Hex | Meaning |
|---|---|---|---|
| `--bg` | oklch(0.135 0.003 70) | #090807 | Matte AMOLED page, warm by a hair |
| `--bg-1..3` | 0.172 / 0.205 / 0.25 | | Sheets, fields, pressed |
| `--ink..ink-4` | 0.965 → 0.47 | #f5f3ef | Text ladder |
| `--accent` | oklch(0.84 0.148 78) | #ffbd4a | Marigold. Only "needs you" and primary actions |
| `--auto` | oklch(0.8 0.072 222) | #89c9df | Handled by AutoPay. Quieter, cooler |
| `--late` | oklch(0.74 0.15 32) | #fb836d | Overdue. Soft coral, never alarm red |
| `--paid` | oklch(0.8 0.13 156) | #70d79a | Settled |

Accent goes on content (numbers, buttons, links), never on a box edge.

## Type

Inter (variable, opsz + wght), self-hosted: latin subset plus a 1.5 KB subset holding only ₹. Tabular numerals on every amount. The hero total uses opsz 32 and tight tracking.

## Layout and components

- Rows sit on the page separated by inset hairlines, not boxed cards. Glyph (category icon in a tinted 42px tile), title, meta line (date · route), amount right, action under it.
- Bottom sheets for every task, one stack, Android back closes the top one. Focus goes to the sheet, never its first input (except Search).
- Dock: WearWise's pattern. A liquid-glass pill of icon-only tabs where the active one opens into icon + label, plus one marigold + beside it. Real refraction (canvas bevel map into `feDisplacementMap`) on Chromium, frosted fallback elsewhere.
- Motion is always on: screen rise, staggered rows, spring sheets, the total counting down when something is paid. No `prefers-reduced-motion` override.

## Never

Em dashes or en dashes in copy. Eyebrow/kicker labels above headings. Uppercase tracked section labels. Accent-coloured top borders on cards. Plain `backdrop-filter` glass on the dock as the only treatment. "PAY NOW" energy anywhere.

## Brand

The mark is a lowercase "d" built from a marigold coin (what's due) and an ink line (the timeline). `scripts/make-icons.py` renders every size, the maskable icon, the monochrome Android badge and the OG card.
