import { GameState, VehicleType } from '../types';

// ────────────────────────────────────────────────────────────────────────────
// ScoreEngine – Uptime & Velocity calculation
// ────────────────────────────────────────────────────────────────────────────

const UPTIME_PENALTY_MERGE_CONFLICT = 5; // % per active merge conflict per second
const UPTIME_PENALTY_SITE_OUTAGE = 20;   // % immediate penalty on outage
const UPTIME_RECOVERY_RATE = 2;          // % per second when all clear
const BPM_INCREASE_PER_DELIVERY = 2;     // BPM added per successful delivery
const BPM_MIN = 60;
const BPM_MAX = 240;

/**
 * ScoreEngine is a plain class (no Phaser dependency) that maintains and
 * mutates the canonical GameState.
 *
 * The Game scene calls its methods in response to events emitted by the
 * PipelineManager and Vehicle entities.
 */
export class ScoreEngine {
  private _state: GameState;

  /** Timestamps (ms) of deliveries in the last 60 seconds – used for velocity. */
  private _deliveryTimestamps: number[] = [];

  constructor() {
    this._state = {
      uptime: 100,
      velocity: 0,
      bpm: BPM_MIN,
      activeMergeConflicts: 0,
      deliveredCount: 0,
      siteOutageActive: false,
      paused: false,
    };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get state(): Readonly<GameState> {
    return this._state;
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  /** Called when a new Merge Conflict is detected. */
  onMergeConflict(): void {
    this._state.activeMergeConflicts += 1;
  }

  /** Called when a Merge Conflict is resolved (one vehicle rebases). */
  onRebase(): void {
    if (this._state.activeMergeConflicts > 0) {
      this._state.activeMergeConflicts -= 1;
    }
  }

  /** Called when a vehicle successfully arrives at the destination. */
  onVehicleArrived(type: VehicleType, nowMs: number): void {
    this._state.deliveredCount += 1;
    this._deliveryTimestamps.push(nowMs);

    // BugfixAmbulance specifically boosts Uptime
    if (type === 'BugfixAmbulance') {
      this._state.uptime = Math.min(100, this._state.uptime + 5);
    }

    // Increase tempo
    this._state.bpm = Math.min(BPM_MAX, this._state.bpm + BPM_INCREASE_PER_DELIVERY);
  }

  /** Called when a HotfixMotorcycle collides and causes a Site Outage. */
  onSiteOutage(): void {
    if (this._state.siteOutageActive) return;
    this._state.siteOutageActive = true;
    this._state.uptime = Math.max(0, this._state.uptime - UPTIME_PENALTY_SITE_OUTAGE);
    // Outage clears after 10 seconds (Game scene resets via clearSiteOutage)
  }

  /** Called when the Site Outage has been resolved. */
  clearSiteOutage(): void {
    this._state.siteOutageActive = false;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  /**
   * Tick the score engine.
   * @param deltaSec Elapsed seconds since the last frame.
   * @param nowMs    Absolute timestamp in milliseconds.
   */
  update(deltaSec: number, nowMs: number): void {
    if (this._state.paused) return;

    // Uptime penalty for active merge conflicts
    if (this._state.activeMergeConflicts > 0) {
      const penalty = UPTIME_PENALTY_MERGE_CONFLICT * this._state.activeMergeConflicts * deltaSec;
      this._state.uptime = Math.max(0, this._state.uptime - penalty);
    } else if (!this._state.siteOutageActive && this._state.uptime < 100) {
      // Gradual recovery when no conflicts / outages
      this._state.uptime = Math.min(100, this._state.uptime + UPTIME_RECOVERY_RATE * deltaSec);
    }

    // Velocity = deliveries in the last 60 seconds
    const windowStart = nowMs - 60_000;
    this._deliveryTimestamps = this._deliveryTimestamps.filter((t) => t > windowStart);
    this._state.velocity = this._deliveryTimestamps.length;
  }

  // ── Pause ─────────────────────────────────────────────────────────────────

  setPaused(paused: boolean): void {
    this._state.paused = paused;
  }
}
