import Phaser from 'phaser';
import {
  VehicleState,
  VehicleType,
  VehicleConfig,
  PipelineNode,
  RebaseEvent,
} from '../types';

// Phaser.Physics.Arcade.Sprite already has `state`, `setState`, and `stop`
// defined on its prototype, so we use private-prefixed alternatives to avoid
// collisions while keeping all vehicle-state logic encapsulated here.

// Monotonically increasing counter for deterministic vehicle IDs.
let _vehicleCounter = 0;

// ────────────────────────────────────────────────────────────────────────────
// Static configuration table for every vehicle type
// ────────────────────────────────────────────────────────────────────────────
export const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
  FeatureCoupe: {
    type: 'FeatureCoupe',
    speed: 120,
    scale: 1.0,
    ignoresRedLights: false,
    causesOutageOnCollision: false,
    requiredQAPasses: 1,
    tint: 0x4a90d9,
  },
  BugfixAmbulance: {
    type: 'BugfixAmbulance',
    speed: 200,
    scale: 1.2,
    ignoresRedLights: true,
    causesOutageOnCollision: false,
    requiredQAPasses: 0,
    tint: 0xff4444,
  },
  RefactorTanker: {
    type: 'RefactorTanker',
    speed: 60,
    scale: 3.0,
    ignoresRedLights: false,
    causesOutageOnCollision: false,
    requiredQAPasses: 0,
    tint: 0xf5a623,
  },
  HotfixMotorcycle: {
    type: 'HotfixMotorcycle',
    speed: 320,
    scale: 0.7,
    ignoresRedLights: false,
    causesOutageOnCollision: true,
    requiredQAPasses: 0,
    tint: 0xff00ff,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Vehicle – base entity class
// ────────────────────────────────────────────────────────────────────────────

/**
 * A Work Package vehicle that travels along a Pipeline.
 *
 * Responsibilities:
 *  - Follows waypoints supplied by PipelineManager.
 *  - Tracks its own VehicleState, including the Locked (Merge Conflict) state.
 *  - Emits Phaser scene events for state transitions.
 */
export class Vehicle extends Phaser.Physics.Arcade.Sprite {
  readonly vehicleId: string;
  readonly vehicleType: VehicleType;
  readonly config: VehicleConfig;

  /** Internal vehicle state (prefixed to avoid collision with Phaser's `state`). */
  private _vehicleState: VehicleState = VehicleState.Moving;

  /** Accumulated time (seconds) that this vehicle has overlapped with another. */
  overlapTimer: number = 0;

  /** Node this vehicle is currently travelling towards. */
  currentTargetNode: PipelineNode | null = null;

  /** Number of QA checkpoints this vehicle has passed. */
  qaPasses: number = 0;

  /** Probability (0-1) that this vehicle carries a bug, set when leaving a checkpoint early. */
  bugProbability: number = 0;

  /** Whether this vehicle is currently inside a checkpoint zone. */
  private _inCheckpoint: boolean = false;
  private _checkpointTimer: number = 0;
  private _checkpointDuration: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    vehicleType: VehicleType,
  ) {
    super(scene, x, y, 'vehicle');

    this.vehicleId = `${vehicleType}-${++_vehicleCounter}`;
    this.vehicleType = vehicleType;
    this.config = VEHICLE_CONFIGS[vehicleType];

    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
    scene.physics.add.existing(this as unknown as Phaser.GameObjects.GameObject);

    this.setScale(this.config.scale);
    this.setTint(this.config.tint);

    // Set a circular body sized to the tinted graphic
    const body = this.body as Phaser.Physics.Arcade.Body;
    const radius = 16 * this.config.scale;
    body.setCircle(radius, -radius, -radius);
    body.setCollideWorldBounds(false);
  }

  // ── State ─────────────────────────────────────────────────────────────────

  /** The current simulation state of this vehicle (distinct from Phaser's `state`). */
  get vehicleState(): VehicleState {
    return this._vehicleState;
  }

  private _setVehicleState(next: VehicleState): void {
    if (this._vehicleState === next) return;
    this._vehicleState = next;
    this.scene.events.emit('vehicle-state-change', { vehicleId: this.vehicleId, vehicleState: next });
  }

  // ── Movement ──────────────────────────────────────────────────────────────

  /** Move towards the given world position at configured speed. */
  moveTowards(targetX: number, targetY: number): void {
    if (this._vehicleState === VehicleState.Locked || this._vehicleState === VehicleState.Arrived) return;

    const effectiveSpeed =
      this._vehicleState === VehicleState.Boosted
        ? this.config.speed * 1.5
        : this.config.speed;

    this.scene.physics.moveTo(
      this as unknown as Phaser.GameObjects.GameObject,
      targetX,
      targetY,
      effectiveSpeed,
    );
  }

  /** Halt all physics velocity (named `halt` to avoid collision with Phaser Sprite's `stop`). */
  halt(): void {
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (
      this._vehicleState !== VehicleState.Locked &&
      this._vehicleState !== VehicleState.Arrived
    ) {
      this._setVehicleState(VehicleState.Stopped);
    }
  }

  // ── Boost (Baton action) ──────────────────────────────────────────────────

  /** Conductor baton boost – temporarily increases speed. */
  boost(): void {
    if (this._vehicleState === VehicleState.Locked || this._vehicleState === VehicleState.Arrived) return;
    this._setVehicleState(VehicleState.Boosted);
    this.scene.time.delayedCall(2000, () => {
      if (this._vehicleState === VehicleState.Boosted) {
        this._setVehicleState(VehicleState.Moving);
      }
    });
  }

  // ── Checkpoint ────────────────────────────────────────────────────────────

  /**
   * Enter a checkpoint zone.
   * @param durationMs How long the vehicle should remain in the checkpoint (ms).
   */
  enterCheckpoint(durationMs: number): void {
    if (this._inCheckpoint) return;
    this._inCheckpoint = true;
    this._checkpointTimer = 0;
    this._checkpointDuration = durationMs;
    this.halt();
    this._setVehicleState(VehicleState.InCheckpoint);
  }

  /** Called every update tick while in a checkpoint. Returns true when done. */
  tickCheckpoint(deltaMs: number): boolean {
    if (!this._inCheckpoint) return true;
    this._checkpointTimer += deltaMs;
    if (this._checkpointTimer >= this._checkpointDuration) {
      this._inCheckpoint = false;
      this.qaPasses += 1;
      this._setVehicleState(VehicleState.Moving);
      return true;
    }
    return false;
  }

  /** Exit a checkpoint early – raises bug probability. */
  exitCheckpointEarly(): void {
    if (!this._inCheckpoint) return;
    const remaining = this._checkpointDuration - this._checkpointTimer;
    this.bugProbability = Math.min(1, remaining / this._checkpointDuration);
    this._inCheckpoint = false;
    this._setVehicleState(VehicleState.Moving);
  }

  // ── Merge Conflict ────────────────────────────────────────────────────────

  /**
   * Lock this vehicle due to a Merge Conflict.
   * Called by PipelineManager after the overlap timer exceeds 1 second.
   */
  lock(): void {
    if (this._vehicleState === VehicleState.Locked) return;
    this.halt();
    this._setVehicleState(VehicleState.Locked);
    // Visual feedback: flash red
    this.scene.tweens.add({
      targets: this,
      alpha: 0.4,
      duration: 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * Rebase – resolve a Merge Conflict. Called when the player clicks this
   * vehicle while it is in the Locked state.
   */
  rebase(): void {
    if (this._vehicleState !== VehicleState.Locked) return;

    this.overlapTimer = 0;
    // Stop all tweens (the flashing animation)
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1);
    this._setVehicleState(VehicleState.Moving);

    const event: RebaseEvent = { vehicleId: this.vehicleId };
    this.scene.events.emit('rebase', event);
  }

  // ── Arrival ───────────────────────────────────────────────────────────────

  /** Mark vehicle as having arrived at its destination. */
  arrive(): void {
    this.halt();
    this._setVehicleState(VehicleState.Arrived);
    this.scene.events.emit('vehicle-arrived', { vehicleId: this.vehicleId, type: this.vehicleType });
  }

  // ── Destruction ───────────────────────────────────────────────────────────

  /** Destroy the vehicle (e.g. after a Site Outage collision). */
  destroyVehicle(): void {
    this.halt();
    this._setVehicleState(VehicleState.Destroyed);
    this.scene.events.emit('vehicle-destroyed', { vehicleId: this.vehicleId, type: this.vehicleType });
    this.destroy();
  }

  // ── Update ────────────────────────────────────────────────────────────────

  /**
   * Called each frame by the Game scene via PipelineManager.
   * @param delta Frame delta in milliseconds.
   */
  tickVehicle(delta: number): void {
    if (this._inCheckpoint) {
      this.tickCheckpoint(delta);
    }
  }
}
