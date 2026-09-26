# Noir Poker Design Context

## Design Register

Product UI with an editorial voice. Design serves live gameplay; the app
shell (home, lobby, create, join, login, profile) may carry more personality,
the table stays quiet and legible.

## Scene

A card room at night: one warm lamp over a dark table, bone-coloured cards,
people leaning in. The interface should feel like that room: dark, warm,
tactile, typographic, calm under pressure. Not a SaaS dashboard, not a neon
casino.

## Visual Direction ("Noir card room")

- **Surfaces**: warm ink neutrals (hue 70-85), never violet-tinted greys.
  Tokens in `src/app/globals.css`: `--background`, `ink-950…600`, `bone`,
  `bone-dim`, `line`, `line-strong` (Tailwind: `bg-ink-900`, `text-bone`,
  `border-line`, `bg-bone/[0.03]`).
- **Accent**: muted violet ink (hue 300, `accent-*`). Use it for the current
  state, focus, a single emphasised word, active nav underline. Never as a
  glow, a gradient wash, or a big filled card. JS mirrors in `src/lib/brand.ts`.
- **Primary action**: `.btn-primary` is a bone slab with ink text. Secondary:
  `.btn-quiet` (hairline). Tertiary: `.btn-link` (underlined text).
  `.btn-accent` only for the single most important in-context action on dark
  game surfaces.
- **Structure through type, space and hairlines** instead of boxes. Group with
  `border-line` rules, whitespace and alignment. Use `.sheet` (one flat
  surface step, one hairline) only when something truly floats (menus,
  dialogs, forms that need a boundary). No nested cards, no glowing borders.
- **Background**: static. Warm lamp from above, a faint table rail, vignette,
  film grain (`GlobalBackground`, `body::after`). No animated shaders.
- **Ornament**: suit glyphs (♠ ♥ ♦ ♣, `.suit`, `.suit-red` for hearts and
  diamonds) as small typographic markers; index numerals (`01`, `02`) in mono.
- Warning and success colours are semantic only (`warn-*`, `success-*`).
  Profit/loss keeps green/red financial semantics.

## Typography

- **Display**: Instrument Serif (`.display` / `font-display`) for page titles,
  section titles, big numbers in empty states, winner banners. Sentence case.
  Italic (`<em>`) for one emphasised phrase, optionally in `text-accent-200`.
  Slight negative tracking is built into `.display`.
- **UI**: Geist Sans. Body 14-16px, relaxed line-height, paragraphs capped
  around 45-60ch.
- **Numbers**: `.numeric` (Geist Mono, tabular) for chips, coins, codes,
  timers, blinds, table sizes.
- **Labels**: `.eyebrow` (small caps, light tracking). Do NOT use
  `uppercase tracking-[0.2em]` micro-labels: that is the old look.
- Avoid fluid viewport font sizing inside the app; responsive steps are fine
  (`text-4xl sm:text-5xl`).

## Components

- App shell vocabulary: `.display`, `.eyebrow`, `.numeric`, `.btn-primary`,
  `.btn-quiet`, `.btn-accent`, `.btn-link`, `.field`, `.rule`, `.sheet`,
  `.suit`. Reference implementations: `src/app/page.tsx`,
  `src/components/home/ModeList.tsx`, `src/components/Nav.tsx`,
  `src/app/play/online/page.tsx`.
- In-game vocabulary is unchanged in name (`glass-button`,
  `glass-button-accent`, `glass-button-ghost`, `glass-button-danger`,
  `glass-icon-button`, `glass-panel`, `glass`, `glass-strong`) but now renders
  as warm graphite with crisp hairlines.
- Lists of choices are rows with hairline dividers (index, serif title, one
  line of copy, small-caps facts, arrow CTA), not grids of equal cards.
- Avatars and thumbnails: rounded squares (`rounded-[10px]`), not circles.
- Lucide icons for UI actions, used sparingly; prefer text labels in the shell.
- Buttons need clear disabled, hover, active and focus behaviour (focus ring is
  global via `:focus-visible`).

## Layout

- Shell pages: `max-w-6xl`, `px-5 sm:px-8`, generous vertical rhythm
  (`pt-14 sm:pt-20`, sections `pb-24`). Left-aligned headers; asymmetric
  12-column grids where there is a visual.
- The table view is the primary experience. Floating controls must not cover
  cards, pot, action buttons, timers or critical player status.
- Preserve stable dimensions for seats, boards, action docks, timers and icon
  buttons to prevent layout shifts mid-hand.
- Mobile layouts prioritise touch targets and scan order.

## Motion

- Motion communicates state: dealing, reveal, hover/press, dialog open/close,
  turn changes. Page entry: one short staggered rise (`opacity` + `y`), inside
  `gsap.matchMedia("(prefers-reduced-motion: no-preference)")`.
- Tokens: `--duration-micro`, `--duration-standard`, `--duration-dramatic`,
  `--ease-out`, `--ease-in`, `--ease-standard`. Transforms and opacity only.

## Copy

- In-app copy is Spanish, plain and specific. No marketing clichés, no
  exclamation marks in status messages.
- Keep labels short and operational: `Jugadores`, `Historial`, `Config`,
  `Salir de la sala`.
- Avoid explanatory text on the table surface; help lives in setup, settings
  and empty states.

## Accessibility And Interaction

- Semantic buttons, links, inputs, selects and ranges; icon-only buttons need
  `aria-label`.
- Keyboard: Escape and outside click close overlays and menus.
- Do not rely on colour alone for critical state.

## Patterns To Preserve

- Settings open from `OptionsMenu` and render through `SettingsOverlay`.
- Voice UI lives in `VoicePanel`; device selection in `AudioVideoSettings`.
- Table shell slots (`topLeft`, `bottomLeft`, `bottomRight`, overlays) stay
  predictable across modes.

## Things To Avoid

- Glowing borders (`BorderGlow`), animated gradient backgrounds, glass pills
  as page chrome, three equal feature cards, uppercase wide-tracked labels,
  violet-tinted greys, purple gradient washes.
- New colour systems outside `globals.css` and `src/lib/brand.ts`.
- Copy or controls in English inside the app UI.
- Broad visual refactors mixed with gameplay logic changes.
