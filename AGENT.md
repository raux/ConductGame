# AGENT.md: Mainline Maestro Lead Architect

> This file is a machine-readable instruction manual for any AI coding agent (Cursor, Claude Code, GitHub Copilot, etc.) working on the **Mainline Maestro** codebase.

---

## 1. Project Context & Persona

- **Role:** Expert Game Developer (Phaser 3, TypeScript) & CI/CD Specialist.
- **Mission:** Build a game where the player acts as a "Conductor" managing the flow of Work Packages (Vehicles) through automated lanes (Pipelines).
- **Tone:** Professional, logic-driven, and focused on clean, modular game state management.

---

## 2. Technical Stack

| Concern | Technology |
|---------|-----------|
| Engine | Phaser 3 (HTML5 Game Framework) |
| Language | TypeScript (strict mode) |
| Bundler | Vite |
| State | Custom Event Emitter / Proxy-based store for global Uptime & Velocity metrics |
| UI | Hybrid – Phaser Canvas for game world, DOM overlays for complex HUD menus |

---

## 3. Core Game Logic Rules

### A. The "Work Package" (Vehicle) Entity

Every vehicle must have a `type` that dictates its behaviour:

| Type | Speed | Rule |
|------|-------|------|
| `FeatureCoupe` | Standard | Requires 1 "QA Pass" |
| `BugfixAmbulance` | High | Ignores "Red Lights"; must reach destination to increase Uptime |
| `RefactorTanker` | Slow | 3× size; repairs "Technical Debt" on the lane it travels |
| `HotfixMotorcycle` | Extreme | High risk; causes "Site Outage" on collision |

### B. The "Pipeline" (Track) System

- Tracks are **directed graphs**.
- **Junctions:** Points where the Conductor (Player) can toggle switches to redirect vehicles.
- **Checkpoints:** Areas (e.g. `TestingLane`) that apply a duration delay. Vehicles exiting early have high `bugProbability`.

### C. Conductor Mechanics (Player Input)

- **The Baton:** Primary selection tool. Clicking a vehicle "boosts" it; clicking a junction "switches" it.
- **Tempo (BPM):** The game speed. Successfully merging code increases the tempo and difficulty.

---

## 4. Coding Standards

- **Component-Based:** Use a Scene-based architecture in Phaser. Separate Logic from Rendering.
- **Asset Management:** Use a centralised Preloader scene (`Boot.ts`).
- **Physics:** Use Arcade Physics for simple collision detection (Merge Conflicts).
- **Type Safety:** Define interfaces for all `GameState`, `VehicleConfig`, and `LevelData`.

---

## 5. Directory Structure

```
/src
  /scenes
    Boot.ts          (Loading assets)
    Game.ts          (Main Traffic Loop)
    HUD.ts           (UI/Metrics)
  /entities
    Vehicle.ts       (Base class)
    Junction.ts      (Switching logic)
  /systems
    PipelineManager.ts (Level layout)
    ScoreEngine.ts     (Uptime/Velocity calculation)
  /types
    index.ts           (Shared interfaces)
/public
  /assets              (Sprites/SFX)
```

---

## 6. Executable Commands

```bash
npm run dev     # Start the development server
npm run build   # Build the production-ready bundle
npm run lint    # Check for code style violations
```

---

## 7. Boundaries & Constraints

- **No Spaghetti Code:** Never put game logic inside the `update()` loop of a Scene directly; delegate to a System or Manager class.
- **Performance:** Maintain 60 FPS. Limit the number of active vehicle particles.
- **Accessibility:** Ensure all "Conductor" actions have keyboard shortcuts (e.g. `Space` for Pause, Number keys for Lane Switching).

---

## 8. Current Objective

> **Implement the Merge Conflict mechanic:**
> When two `Vehicle` entities overlap for more than **1 second** in a single lane, they must enter a `'Locked'` state, requiring player intervention to `'Rebase'`.

### Implementation Checklist

- [x] `VehicleState` enum includes `Locked` value
- [x] `Vehicle` class tracks `overlapTimer` (accumulated seconds of overlap)
- [x] `Game` scene uses Arcade Physics `overlap` callback, delegating to `PipelineManager.checkMergeConflicts()`
- [x] `PipelineManager.checkMergeConflicts()` increments `overlapTimer` on colliding pairs and calls `vehicle.lock()` after 1 second
- [x] `vehicle.lock()` sets state to `Locked`, pauses movement, and emits `merge-conflict` event
- [x] Player can click a `Locked` vehicle to trigger `rebase()`, resolving the conflict
- [x] `ScoreEngine` penalises Uptime for each active Merge Conflict
- [x] HUD displays active conflict count and a "REBASE REQUIRED" alert

When you start working, please reference this AGENT.md to ensure the **Mainline Maestro** vision is maintained.
