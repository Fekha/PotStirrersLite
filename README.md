# PotStirrers

PotStirrers is a small, fast multiplayer board game in the spirit of **Sorry!**:
four colors race pawns around a shared outer track, then into their home lanes.
Movement is driven by a simple card deck instead of dice, and the game supports
human players, AI opponents, and online play.

---

## Quickstart

- **Requirements:** Node.js 18+ and npm.
- **Install dependencies:**
  - `npm install`
- **Run the dev server (Vite):**
  - `npm run dev`
  - Open the printed local URL in your browser (typically http://localhost:5173).
- **Build for production:**
  - `npm run build`
- **Preview the production build:**
  - `npm run preview`

---

## Objective

- **Goal:** Be the first color to move all four of your pawns from **Start**
  → **Track** → **Home lane**.
- Pawns move around a **40‑cell circular track**, then turn into their
  color’s inner lane and advance to the final home space.

---

## Turn structure

On your turn:

1. **Draw / maintain a 3‑card hand.**
2. **Choose a card** from your hand.
3. **Resolve the card** (move a pawn, perform a special effect, or discard).
4. **Replace the used card** from the deck.
5. **Pass the turn** to the next color (direction can change).

If a chosen card has **no legal moves** for your color that turn, you may
discard it instead (with a confirmation for human players). AI and remote
players discard automatically when needed.

---

## Card types

The deck is made up of a mix of **numeric** and **special** cards:

- **Numeric cards (e.g. 1, 2, …, 11, 12, possibly negative values)**
  - Move one of your pawns by the card’s value.
  - Forward for positive numbers; some cards may move backward if negative.
  - `0` is special: it can **only** be used to leave Start; it does not move
    other pawns already on the track or in the home lane.

- **Sorry**
  - Requires you to have at least one pawn in **Start**.
  - You choose an opponent pawn on the track.
  - Your pawn leaves Start and takes that space; the opponent pawn is bumped
    back to its **Start**.

- **Swap**
  - Choose one of your on‑track pawns and one opponent pawn on the track.
  - Their positions are swapped.
  - If you have no legal swap (no track pawns, or no enemy track pawns), Swap
    can only be discarded.

- **Shuffle**
  - Discards your entire hand and deals **three new cards** for the same
    player.
  - **Does not end your turn.** You keep playing with the new hand.
  - **Reverses the direction of play** (clockwise ↔ counter‑clockwise).

---

## Board mechanics

- Each color has:
  - A **Start zone** just off the main track.
  - A **Home lane** (inner path) that branches off near that color’s
    **home entry** space.
- **Slides:** Certain track spaces are slide starts. Landing on a slide start
  moves your pawn to the end of that slide segment.
- **Bumping:**
  - If you land on a space occupied by an opponent pawn, it is sent back to
    **Start**.
  - Slides can bump any opponent pawns along their path as well.
- The board geometry and slide definitions live in `src/constants.js`.

---

## Game modes

PotStirrers supports several ways to play:

- **Pass‑and‑play (offline):**
  - All players share one device.
  - `aiColors` determines which colors are AI‑controlled.
  - UI shows **"Your color"** for the local human.

- **Online games:**
  - Uses Firebase/Firestore for shared state.
  - Players join by **game code**; each client is assigned a color.
  - Only the **host client** runs AI logic for AI‑controlled colors; other
    clients simply mirror the shared state.

- **AI‑only games:**
  - You can start a game where all four colors are AI.
  - The game will auto‑play to completion using the AI heuristics.

---

## AI behavior (high‑level)

AI logic lives primarily in `src/aiLogic.js` and is driven from
`GameScreen.jsx`.

For its color on a given turn, the AI:

1. Tries to play **Sorry** if it can meaningfully attack an opponent.
2. Tries to play **Swap** if it finds a beneficial swap (closer to home
  without giving away too much).
3. Chooses a **numeric** card using a heuristic that considers:
  - Progress toward home.
  - Use of slides.
  - Advancing in the safety/home lane.
  - Avoiding stacking on its own pawns.
4. If no Sorry/Swap/numeric move is good, it may play **Shuffle** to reroll
  its hand.
5. If nothing else is attractive, it **discards** the least useful card,
  including dead Swaps, to avoid stalling.

AI turns are fully automatic; human input is ignored while an AI color is
active.

---

## UI overview

The main UI pieces:

- **GameScreen (`src/components/GameScreen.jsx`)**
  - Top‑level game state: deck, hand, pawns, turn index/direction, winner.
  - Orchestrates AI turns and applies card effects.
  - Handles online sync (Firestore) and the game log.

- **GameBoard (`src/components/GameBoard.jsx`)**
  - Renders the board: track cells, slides, start zones, home lanes.
  - Shows "Your color", current turn, and turn direction in the center.

- **Pawn (`src/components/Pawn.jsx`)**
  - Renders individual pawns at board coordinates using CSS clip‑paths
    (circle, heart, star, pentagon) inside a bordered container.
  - Animates pawn movement with CSS transitions.

- **Card hand (in `GameScreen.jsx`)**
  - Shows up to 3 cards with a `?` button that opens a brief rules tooltip
    for that card.
  - Disables input when it isn’t the local human’s turn or while animations
    are running.

- **Log panel**
  - Text log of key events (**newest first**), including card plays, turn
    handoffs, and win messages.

---

This README is intentionally descriptive rather than exhaustive. For precise
rule details, see:

- `src/components/GameScreen.jsx` – overall flow and card handling.
- `src/aiLogic.js` – AI evaluation and card choice logic.
- `src/constants.js` – board geometry, track length, slides, and home paths.
