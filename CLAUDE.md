# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + Vite production build (outputs to docs/)
npm run preview      # Preview the production build locally
npm test             # Run all Vitest tests once
npm run test:watch   # Run Vitest in watch mode
```

## Architecture

This is a **personal portfolio + Connect Four game** SPA deployed on GitHub Pages. It has no router — the URL hash controls which "page" renders.

### Two-page structure (hash-based)

- **`#` (no hash)** → Resume/CV page with dark/light theme toggle and en/zh i18n. Data is sourced from `src/data/en.ts` and `src/data/zh.ts`, both typed to `ResumeData` (`src/data/types.ts`).
- **`#game` or `#play`** → Connect Four game. The two hashes are functionally identical; `#play` is a short link variant.

`App.tsx` reads the hash on mount and on `hashchange`, and conditionally renders either `<Resume>` or the `<GameApp>` wrapper. Transitions between modes use CSS class toggles (`page-enter`/`page-exit`) with a 300ms delay.

### Connect Four game — state flow

```
Game.tsx (mode router: single | host | join | manual-join)
  └─ GameContainer.tsx (game state owner, P2P message handler)
       └─ GameView.tsx (rendering: crown/winner panel, board, controls)
            └─ Board.tsx (7×6 grid of memo'd <Square> components)
```

- **`GameContainer`** owns the `GameState` via `useState<GameState>` and all game logic (moves, win detection, reset, undo). It accepts an optional `transport` prop for P2P mode.
- **`GameView`** is a pure render component — no game logic, only UI + display state (winner panel visibility, win-point reveal animation, notice toast).
- **`Board`** renders a 7×6 grid from bottom-to-top. Each `<Square>` is `React.memo`'d. Audio is hoisted out of individual squares — `useSound` creates one `Audio` instance per sound effect and reuses it.
- **`gameLogic.ts`** contains pure functions: `createEmptyBoard`, `dropInColumn`, `findWinLines`, `linePoints`, `applyMove`, `applyReset`, `applyUndo`. All state transitions are immutable (new arrays per move).

### P2P — two signaling paths

`Game.tsx` decides the P2P mode:

1. **Broker mode** (PeerJS): `useHostPeer()` / `useJoinPeer()` in `src/p2p/usePeerConnection.ts`. Uses PeerJS cloud server for signaling. The host gets a PeerJS ID, builds an invite URL with `?peer=...&role=...`, the joiner connects via `peer.connect(remotePeerId)`.

2. **Manual mode** (copy-paste WebRTC): `useManualHostPeer()` / `useManualJoinPeer()` in `src/p2p/useManualHostPeer.ts` and `src/p2p/useManualJoinPeer.ts`. No signaling server — the SDP offer/answer is gzip-compressed (via `CompressionStream`) and base64-encoded into a URL parameter `?manual-offer=...&role=...`. The joiner decodes it, generates an answer, and the user copies the answer text back to the host. ICE gathering has a 5s fallback timer to avoid waiting indefinitely for slow TURN candidates.

Both paths share the same `PeerMessage` protocol (`src/p2p/protocol.ts`): `{ type: "move", col, seq }` and `{ type: "reset-request", seq }`. Both expose a uniform `{ send, onMessage, status, error }` interface consumed by `GameContainer` via its `transport` prop.

### Win animation pipeline

The win-line highlight reveal is a multi-phase timed sequence in `GameContainer`:

1. Piece drops (`droppingCell` set → CSS drop animation ~1s)
2. After 1050ms start delay, win-line cells are revealed one-by-one (288ms step delay, 560ms between lines) into `revealedWinPoints`
3. 320ms after last cell, `winnerPanelVisible` flips true
4. Winner panel appears → victory sound plays → after 600ms, avatar level upgrade check runs

The avatar leveling system does NOT persist — it probes for image files (`/tanson_N.jpg`, `/sherly_N.jpg`) via `Image()` preload to check if the next level exists. Sound effects are plain `new Audio(url)` played on-demand (no Web Audio API).

### Particle effect

`src/effect.ts` creates a burst of particles by sampling pixel colors from the winner's avatar image (drawn offscreen to a canvas, then `getImageData`). Particles animate via a single shared `requestAnimationFrame` loop on a single reused `<canvas>` element appended to `document.body`. The canvas is only created once (`ensureParticleCanvas()`) to prevent "frozen frame" artifacts from old canvas instances.

### Testing

Tests use Vitest with `happy-dom` as the DOM environment. Setup file: `src/test-setup.ts` (imports `@testing-library/jest-dom/vitest`). Tests exist for:

- `src/game/gameLogic.test.ts` — pure game logic (board creation, win detection, applying moves/reset)
- `src/p2p/protocol.test.ts` — invite URL building/parsing round-trips
- `src/p2p/manualSignaling.test.ts` — SDP encode/decode, manual invite URL parsing
- `src/p2p/usePeerConnection.test.tsx` — PeerJS hook behavior
- `src/p2p/useManualHostPeer.test.tsx` — manual host hook behavior
- `src/p2p/useManualJoinPeer.test.tsx` — manual join hook behavior

### Deployment

GitHub Actions (`.github/workflows/build.yml`) builds on push to `main`, runs `npm ci && npm run build`, and force-pushes the `docs/` directory to a `build` branch. No test step in CI currently. Build output goes to `docs/` (configured in `vite.config.ts` as `build.outDir`).

### Key design constraints

- CSS variables (`--playerA-img`, `--playerB-img`) inject avatar URLs into the board
- CSS custom property `--drop-rows` controls drop animation height per cell
- `React.StrictMode` double-mounts in dev — P2P hooks clean up event handlers before destroying connections to avoid stale state in the second mount
- TypeScript config is strict (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`)
