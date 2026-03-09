# ConductGame – Mainline Maestro

A real-time traffic management simulation that metaphors the software CI/CD pipeline. You act as a "Conductor" managing the flow of **Work Packages** (Vehicles) through automated lanes (Pipelines).

## Tech Stack

- **Engine:** Phaser 3
- **Language:** TypeScript (strict mode)
- **Bundler:** Vite

## Getting Started

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Compile TypeScript and build the production bundle |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint on all TypeScript source files |

## Directory Structure

```
/src
  /scenes
    Boot.ts          – Asset preloading
    Game.ts          – Main traffic loop (delegates to systems)
    HUD.ts           – UI / Metrics overlay
  /entities
    Vehicle.ts       – Base vehicle class + all vehicle types
    Junction.ts      – Track switching logic
  /systems
    PipelineManager.ts – Level layout & directed-graph tracks
    ScoreEngine.ts     – Uptime / Velocity calculation
  /types
    index.ts           – Shared TypeScript interfaces
/public
  /assets              – Sprites / SFX
```

## Vehicle Types

| Vehicle | Speed | Special Behaviour |
|---------|-------|-------------------|
| **FeatureCoupe** | Normal | Requires 1 QA Pass checkpoint |
| **BugfixAmbulance** | Fast | Ignores red lights; increases Uptime on arrival |
| **RefactorTanker** | Slow | 3× size; repairs Technical Debt on lane |
| **HotfixMotorcycle** | Extreme | High risk – collision causes Site Outage |

## Key Mechanics

- **Merge Conflict** – When two vehicles overlap for > 1 second in a single lane they enter a **Locked** state. The player must click them to **Rebase** and resolve the conflict.
- **Junctions** – Click to toggle track switches and redirect vehicles.
- **Checkpoints** – Testing lanes that apply a delay; vehicles exiting early accumulate `bugProbability`.
- **Tempo (BPM)** – Game speed increases with successful merges.

## Controls

| Action | Input |
|--------|-------|
| Pause / Resume | `Space` |
| Boost / Switch (Baton) | `Left Click` on vehicle or junction |
| Lane Switch (1-5) | Number keys |

## See Also

- [AGENT.md](./AGENT.md) – Machine-readable instruction manual for AI coding agents
