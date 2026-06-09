# Noir Poker Design Context

## Design Register

Product UI. Design serves live gameplay. Familiar controls, predictable placement, and clear state beat expressive decoration.

## Scene

Players and hosts use the app around an active poker table, often on phones, laptops, and a shared screen in dim indoor lighting. The interface should feel like a focused casino control surface: dark, quiet, tactile, and readable under pressure.

## Visual Direction

- Base theme: near-black noir surface with violet brand accent.
- Use the existing OKLCH tokens in `src/app/globals.css` as the source of truth.
- Keep the palette restrained. Violet is for primary actions, active selections, current state, and controlled emphasis.
- Warning and success colors are semantic only. Profit/loss may use green/red financial semantics.
- Avoid adding new hue families unless they carry a clear game meaning.

## Typography

- Use the configured Geist Sans and Geist Mono tokens.
- Interface labels are compact, uppercase where already established, and should stay readable.
- Use monospace for codes, chip numbers, room IDs, timers, and technical identifiers.
- Do not use fluid viewport-based font sizing. Keep type sizes stable across responsive layouts.
- Avoid negative letter spacing.

## Components

- Prefer existing component vocabulary: `glass-button`, `glass-button-accent`, `glass-button-ghost`, `glass-button-danger`, `glass-icon-button`, `glass-panel`, `glass`, and `glass-strong`.
- Use Lucide icons for UI actions.
- Buttons need clear disabled, hover, active, and focus behavior.
- Settings surfaces should use tabs and standard form controls. Do not invent custom affordances when a select, range input, toggle, or button is expected.
- Avoid nested cards. Panels can group controls, but do not wrap every section in another decorative container.

## Layout

- The table view is the primary experience. Floating controls should not cover cards, pot, action buttons, timers, or critical player status.
- Preserve stable dimensions for seats, boards, action docks, timers, and icon buttons to prevent layout shifts mid-hand.
- Host and player settings should stay structurally similar when they expose the same capability.
- Mobile layouts must prioritize touch targets and scan order; desktop layouts can be denser.

## Motion

- Motion should communicate state: dealing, reveal, hover/press, modal open/close, turn changes, and feedback.
- Use existing motion tokens: `--duration-micro`, `--duration-standard`, `--duration-dramatic`, `--ease-out`, `--ease-in`, `--ease-standard`.
- Prefer transforms and opacity. Avoid animating layout properties.
- Respect `prefers-reduced-motion` for new animations.

## Copy

- In-app copy is Spanish.
- Keep labels short and operational: `Audio/Video`, `Jugadores`, `Historial`, `Config`, `Tema`, `Salir de la sala`.
- Avoid explanatory text in the main table surface. Put help text inside settings, setup, or empty states.
- Use direct confirmation copy for destructive actions.

## Accessibility And Interaction

- Interactive elements must be semantic buttons, links, inputs, selects, or ranges.
- Icon-only buttons need `aria-label` or `title`.
- Preserve keyboard escape/outside-click behavior in overlays and menus.
- Use `aria-live` for future turn/status announcements where appropriate.
- Do not rely on color alone for critical state.

## Patterns To Preserve

- Settings are opened from `OptionsMenu` and rendered through `SettingsOverlay`.
- Player settings include microphone selection and sound volume.
- Host settings include room/admin controls; when the host is also a player, show player-relevant controls too.
- Voice UI lives in `VoicePanel`; device selection lives in `AudioVideoSettings` through `useMicDevice`.
- Table shell slots (`topLeft`, `bottomLeft`, `bottomRight`, overlays) should remain predictable across modes.

## Things To Avoid

- Marketing-style hero pages for app surfaces.
- Decorative cards, gradients, or motion that do not clarify state.
- New color systems outside `globals.css` and `src/lib/brand.ts`.
- Copy or controls in English inside the app UI.
- Broad visual refactors mixed with gameplay logic changes.
