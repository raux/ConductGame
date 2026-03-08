// ────────────────────────────────────────────────────────────────────────────
// Shared TypeScript interfaces for Mainline Maestro
// ────────────────────────────────────────────────────────────────────────────

/** All possible states a Vehicle can be in during the simulation. */
export enum VehicleState {
  Moving = 'Moving',
  Boosted = 'Boosted',
  Stopped = 'Stopped',
  /** Vehicle is in a Checkpoint lane undergoing QA / testing. */
  InCheckpoint = 'InCheckpoint',
  /** Two vehicles have overlapped for > 1 second – player must Rebase. */
  Locked = 'Locked',
  Arrived = 'Arrived',
  Destroyed = 'Destroyed',
}

/** Discriminated union of all vehicle types. */
export type VehicleType =
  | 'FeatureCoupe'
  | 'BugfixAmbulance'
  | 'RefactorTanker'
  | 'HotfixMotorcycle';

/** Static configuration for a vehicle type. */
export interface VehicleConfig {
  type: VehicleType;
  /** Base speed in pixels per second. */
  speed: number;
  /** Visual scale relative to base sprite size. */
  scale: number;
  /** Whether this vehicle ignores junction red-light signals. */
  ignoresRedLights: boolean;
  /** Whether a collision with another vehicle causes a Site Outage. */
  causesOutageOnCollision: boolean;
  /** Number of QA Pass checkpoints required before the vehicle can arrive. */
  requiredQAPasses: number;
  /** Tint colour used for the placeholder graphic. */
  tint: number;
}

/** Per-lane node in the directed pipeline graph. */
export interface PipelineNode {
  id: string;
  x: number;
  y: number;
  /** IDs of nodes this node connects to (directed edges). */
  nextIds: string[];
  /** If true, vehicles entering here are delayed for `checkpointDuration` ms. */
  isCheckpoint: boolean;
  /** Duration in milliseconds for the checkpoint delay. */
  checkpointDuration: number;
}

/** A single level's complete layout data. */
export interface LevelData {
  id: number;
  name: string;
  nodes: PipelineNode[];
  /** Node ID where new vehicles spawn. */
  spawnNodeId: string;
  /** Node ID that is the final destination. */
  destinationNodeId: string;
}

/** Snapshot of all mutable game metrics at a point in time. */
export interface GameState {
  /** 0-100: decreases on merge conflicts, site outages, or missed deliveries. */
  uptime: number;
  /** Throughput – vehicles successfully delivered per minute. */
  velocity: number;
  /** Tempo multiplier; increases with successful merges. */
  bpm: number;
  /** Number of currently active Merge Conflicts (Locked vehicle pairs). */
  activeMergeConflicts: number;
  /** Total vehicles successfully delivered this session. */
  deliveredCount: number;
  /** Whether a Site Outage is currently in effect. */
  siteOutageActive: boolean;
  /** Whether the game is paused. */
  paused: boolean;
}

/** Event payload emitted when a Merge Conflict is detected. */
export interface MergeConflictEvent {
  vehicleAId: string;
  vehicleBId: string;
  laneNodeId: string;
}

/** Event payload emitted when a Merge Conflict is resolved (Rebase). */
export interface RebaseEvent {
  vehicleId: string;
}
