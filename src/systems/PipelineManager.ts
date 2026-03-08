import Phaser from 'phaser';
import { Vehicle } from '../entities/Vehicle';
import { Junction } from '../entities/Junction';
import {
  LevelData,
  PipelineNode,
  MergeConflictEvent,
  VehicleState,
  VehicleType,
} from '../types';

// Overlap threshold in seconds before a Merge Conflict is declared.
const MERGE_CONFLICT_THRESHOLD_SEC = 1.0;

// ────────────────────────────────────────────────────────────────────────────
// PipelineManager – level layout & Merge Conflict detection
// ────────────────────────────────────────────────────────────────────────────

/**
 * PipelineManager owns the directed-graph track layout for a level and
 * orchestrates vehicle movement along it.
 *
 * It is a plain TypeScript class (not a Scene) so that logic remains
 * decoupled from rendering. The Game scene drives it via `update()`.
 */
export class PipelineManager {
  private _scene: Phaser.Scene;
  private _levelData: LevelData;
  private _nodes: Map<string, PipelineNode>;
  private _junctions: Map<string, Junction>;
  private _vehicles: Vehicle[] = [];

  /**
   * Tracks how long (seconds) each ordered pair of vehicle IDs has been
   * overlapping.  Key format: `${idA}__${idB}` where idA < idB lexicographically.
   */
  private _overlapTimers: Map<string, number> = new Map();

  /** Set of pair keys that have already been locked to avoid duplicate events. */
  private _lockedPairs: Set<string> = new Set();

  constructor(scene: Phaser.Scene, levelData: LevelData) {
    this._scene = scene;
    this._levelData = levelData;
    this._nodes = new Map(levelData.nodes.map((n) => [n.id, n]));
    this._junctions = new Map();

    this._buildJunctions();
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get vehicles(): Vehicle[] {
    return this._vehicles;
  }

  get junctions(): Map<string, Junction> {
    return this._junctions;
  }

  getNode(id: string): PipelineNode | undefined {
    return this._nodes.get(id);
  }

  // ── Vehicle management ────────────────────────────────────────────────────

  /** Register a newly spawned vehicle and direct it towards its first waypoint. */
  addVehicle(vehicle: Vehicle): void {
    this._vehicles.push(vehicle);
    const spawnNode = this._nodes.get(this._levelData.spawnNodeId);
    if (spawnNode) {
      this._advanceVehicle(vehicle, spawnNode);
    }
  }

  /** Remove a vehicle from the manager (e.g. after arrival or destruction). */
  removeVehicle(vehicleId: string): void {
    this._vehicles = this._vehicles.filter((v) => v.vehicleId !== vehicleId);
    // Clean up any overlap timers that referenced this vehicle
    for (const key of this._overlapTimers.keys()) {
      if (key.includes(vehicleId)) {
        this._overlapTimers.delete(key);
        this._lockedPairs.delete(key);
      }
    }
  }

  // ── Main update loop ──────────────────────────────────────────────────────

  /**
   * Called every frame by the Game scene.
   * @param delta Frame delta in milliseconds.
   */
  update(delta: number): void {
    const deltaSec = delta / 1000;

    for (const vehicle of this._vehicles) {
      vehicle.tickVehicle(delta);
      this._tickVehicleMovement(vehicle);
    }

    this.checkMergeConflicts(deltaSec);
    this._decayResolvedOverlaps(deltaSec);
  }

  // ── Merge Conflict detection ──────────────────────────────────────────────

  /**
   * Scan all vehicle pairs that are physically overlapping.
   * If a pair has been overlapping for > MERGE_CONFLICT_THRESHOLD_SEC, both
   * vehicles are locked and a `merge-conflict` event is emitted.
   *
   * @param deltaSec Elapsed time in seconds since the last frame.
   */
  checkMergeConflicts(deltaSec: number): void {
    const active = this._vehicles.filter(
      (v) =>
        v.vehicleState !== VehicleState.Arrived &&
        v.vehicleState !== VehicleState.Destroyed &&
        v.active,
    );

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];

        if (this._areOverlapping(a, b)) {
          const key = this._pairKey(a.vehicleId, b.vehicleId);

          // Accumulate overlap time
          const prev = this._overlapTimers.get(key) ?? 0;
          const next = prev + deltaSec;
          this._overlapTimers.set(key, next);

          if (next >= MERGE_CONFLICT_THRESHOLD_SEC && !this._lockedPairs.has(key)) {
            this._lockedPairs.add(key);
            this._triggerMergeConflict(a, b);
          }
        }
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _buildJunctions(): void {
    for (const node of this._levelData.nodes) {
      if (node.nextIds.length > 1) {
        const junction = new Junction(this._scene, node);
        this._junctions.set(node.id, junction);
      }
    }
  }

  private _tickVehicleMovement(vehicle: Vehicle): void {
    const vs = vehicle.vehicleState;
    if (
      vs === VehicleState.Locked ||
      vs === VehicleState.Arrived ||
      vs === VehicleState.InCheckpoint ||
      vs === VehicleState.Stopped ||
      vs === VehicleState.Destroyed
    ) {
      return;
    }

    const target = vehicle.currentTargetNode;
    if (!target) return;

    const dist = Phaser.Math.Distance.Between(vehicle.x, vehicle.y, target.x, target.y);

    if (dist < 8) {
      // Reached the target node
      if (target.id === this._levelData.destinationNodeId) {
        // Check QA requirements
        const config = vehicle.config;
        if (config.requiredQAPasses > 0 && vehicle.qaPasses < config.requiredQAPasses) {
          // Bounce back to the last checkpoint if requirements not met
          const checkpointNode = this._findNearestCheckpoint(vehicle);
          if (checkpointNode) {
            this._advanceVehicle(vehicle, checkpointNode);
            return;
          }
        }
        vehicle.arrive();
        return;
      }

      if (target.isCheckpoint) {
        vehicle.enterCheckpoint(target.checkpointDuration);
        return;
      }

      // Determine next node via junction or default
      const nextNodeId = this._resolveNextNode(target);
      if (!nextNodeId) {
        vehicle.halt();
        return;
      }

      const nextNode = this._nodes.get(nextNodeId);
      if (!nextNode) {
        vehicle.halt();
        return;
      }

      this._advanceVehicle(vehicle, nextNode);
    } else {
      // Check red-light junction before this node
      const junction = this._junctions.get(target.id);
      if (junction?.redLight && !vehicle.config.ignoresRedLights) {
        vehicle.halt();
        return;
      }
      vehicle.moveTowards(target.x, target.y);
    }
  }

  private _advanceVehicle(vehicle: Vehicle, node: PipelineNode): void {
    vehicle.currentTargetNode = node;
    vehicle.moveTowards(node.x, node.y);
  }

  private _resolveNextNode(node: PipelineNode): string | null {
    if (node.nextIds.length === 0) return null;

    const junction = this._junctions.get(node.id);
    if (junction) {
      return junction.activeBranchNodeId;
    }

    return node.nextIds[0];
  }

  private _findNearestCheckpoint(vehicle: Vehicle): PipelineNode | null {
    let nearest: PipelineNode | null = null;
    let minDist = Infinity;

    for (const node of this._nodes.values()) {
      if (node.isCheckpoint) {
        const d = Phaser.Math.Distance.Between(vehicle.x, vehicle.y, node.x, node.y);
        if (d < minDist) {
          minDist = d;
          nearest = node;
        }
      }
    }

    return nearest;
  }

  /**
   * Returns true when two vehicle physics bodies are spatially overlapping.
   * Uses simple distance check between sprite centres as an approximation.
   */
  private _areOverlapping(a: Vehicle, b: Vehicle): boolean {
    const bodyA = a.body as Phaser.Physics.Arcade.Body | null;
    const bodyB = b.body as Phaser.Physics.Arcade.Body | null;
    if (!bodyA || !bodyB) return false;

    // Use centre-to-centre distance vs. sum of half-widths for a quick AABB check
    const halfW = (bodyA.width + bodyB.width) / 2;
    const halfH = (bodyA.height + bodyB.height) / 2;
    const dx = Math.abs(bodyA.center.x - bodyB.center.x);
    const dy = Math.abs(bodyA.center.y - bodyB.center.y);

    return dx < halfW && dy < halfH;
  }

  private _triggerMergeConflict(a: Vehicle, b: Vehicle): void {
    // Lock both vehicles
    a.lock();
    b.lock();

    // Find the lane node closest to the midpoint of the two vehicles
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    let closestNodeId = '';
    let minDist = Infinity;
    for (const node of this._nodes.values()) {
      const d = Phaser.Math.Distance.Between(midX, midY, node.x, node.y);
      if (d < minDist) {
        minDist = d;
        closestNodeId = node.id;
      }
    }

    const event: MergeConflictEvent = {
      vehicleAId: a.vehicleId,
      vehicleBId: b.vehicleId,
      laneNodeId: closestNodeId,
    };

    this._scene.events.emit('merge-conflict', event);
  }

  /**
   * Decay overlap timers for pairs that are no longer overlapping.
   * Once a conflict has been locked, we keep the pair key in _lockedPairs
   * until one of the vehicles rebases, so we do not re-trigger immediately.
   */
  private _decayResolvedOverlaps(deltaSec: number): void {
    for (const [key, time] of this._overlapTimers.entries()) {
      const [idA, idB] = key.split('__');
      const vehicleA = this._vehicles.find((v) => v.vehicleId === idA);
      const vehicleB = this._vehicles.find((v) => v.vehicleId === idB);

      // If either vehicle is gone or they are no longer overlapping, decay
      if (!vehicleA || !vehicleB || !this._areOverlapping(vehicleA, vehicleB)) {
        const decayed = time - deltaSec * 2; // decay twice as fast as accumulation
        if (decayed <= 0) {
          this._overlapTimers.delete(key);
          this._lockedPairs.delete(key);
        } else {
          this._overlapTimers.set(key, decayed);
        }
      }
    }
  }

  /**
   * Generate a deterministic key for an unordered vehicle pair.
   */
  private _pairKey(idA: string, idB: string): string {
    return idA < idB ? `${idA}__${idB}` : `${idB}__${idA}`;
  }

  // ── Spawn helper ──────────────────────────────────────────────────────────

  /**
   * Convenience factory: create a vehicle of the given type at the spawn node
   * and register it with the manager.
   */
  spawnVehicle(type: VehicleType): Vehicle {
    const spawnNode = this._nodes.get(this._levelData.spawnNodeId);
    if (!spawnNode) {
      throw new Error(`Spawn node '${this._levelData.spawnNodeId}' not found in level data.`);
    }

    const vehicle = new Vehicle(this._scene, spawnNode.x, spawnNode.y, type);

    // Allow player to click the vehicle to boost or rebase
    vehicle.setInteractive();
    vehicle.on('pointerdown', () => {
      if (vehicle.vehicleState === VehicleState.Locked) {
        vehicle.rebase();
      } else {
        vehicle.boost();
      }
    });

    this.addVehicle(vehicle);
    return vehicle;
  }

  // ── Clean-up ──────────────────────────────────────────────────────────────

  destroy(): void {
    for (const vehicle of this._vehicles) {
      if (vehicle.active) vehicle.destroy();
    }
    this._vehicles = [];

    for (const junction of this._junctions.values()) {
      junction.destroy();
    }
    this._junctions.clear();
  }
}
