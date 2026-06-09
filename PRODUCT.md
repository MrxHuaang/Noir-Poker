# Noir Poker Product Context

## Register

product

## Purpose

Noir Poker is a task-focused poker app for running Texas Hold'em sessions across a shared table screen and player devices. It supports in-person tables, online cash games, tournaments, voice chat, hand history, progression, and an ongoing migration toward a server-authoritative Go backend.

The product is not a marketing site. Most screens are operational surfaces used while a hand is live, often with people waiting on the next action. Favor clarity, fast scanning, and reliable controls over decorative novelty.

## Users

- Hosts running a physical table on a large screen.
- Players joining from phones or laptops to see private cards, act, chat, talk, and track stacks.
- Tournament admins managing blinds, pauses, knockouts, and final rankings.
- The project owner improving a portfolio-grade poker system without losing playable flows.

## Core Workflows

- Create or join a room by code, link, or QR.
- Seat players, configure stack/blinds/tournament settings, and start a hand.
- Play through betting streets with private hole cards, timers, side pots, all-in run-it-N, and showdown.
- Use voice, chat, reactions, themes, settings, and history without interrupting the game.
- Move server-backed online mode toward parity with the legacy Firestore normal/tournament flow.

## Product Principles

- Gameplay state must be legible at a glance: turn, pot, street, player status, stack, bet, timer, and winner.
- Privacy is part of the product: never leak hole cards, owner-only state, host-only equity, or hidden deck information.
- Host and player experiences should have feature parity when they share a role. If the host joins as a player, player controls such as microphone settings should appear.
- Controls should match the user's current role. Host-only admin controls do not belong in player views; player-only private information does not belong on shared table views.
- Keep the table playable before adding polish. A good-looking change that slows decisions or hides state is a regression.
- Copy visible in the app is Spanish. Developer docs may be English or Spanish, but in-app labels should remain Spanish.

## Non-Negotiable Invariants

- Do not store hole cards in public room documents.
- Do not show equity, outs, or private hand strength to players unless the flow explicitly reveals cards.
- A player receives only their own private cards.
- New state fields must be classified as public, host-only, owner-only, or no-display before wiring UI.
- In server-backed mode, game authority lives in `server/internal/game`; the client renders public state and sends actions.
- Components must not call `getFirestore()` directly. Use helpers in `src/lib`.
- Hooks must run before any conditional return.

## Current Architecture

- Next.js 16 App Router, React 19, TypeScript strict.
- Tailwind CSS v4 tokens in `src/app/globals.css`; no `tailwind.config.js`.
- Firestore powers legacy rooms, lobby, private card docs, history, economy, and presence.
- Supabase Realtime + WebRTC powers voice signaling.
- Go WebSocket server powers the newer server-authoritative online mode.
- Rust/WASM + Web Worker powers equity computation.

## Known Product Gaps

- Server-backed online mode still lacks full parity with legacy normal/tournament flows.
- `/play/online/[code]` has voice and chat, but does not yet expose the same settings surface for microphone and volume as `/play/normal/[code]`.
- Some lint warnings reflect React 19 rule tightening and should be fixed incrementally without broad rewrites.
- Keep README, CONTRIBUTING, and migration docs synchronized when behavior changes.
