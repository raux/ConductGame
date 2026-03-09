import Phaser from 'phaser';
import { PipelineManager } from '../systems/PipelineManager';
import { ScoreEngine } from '../systems/ScoreEngine';
import { LevelData, MergeConflictEvent, VehicleType } from '../types';

// ────────────────────────────────────────────────────────────────────────────
// Level 1 data – a simple linear pipeline with one junction and one checkpoint
// ────────────────────────────────────────────────────────────────────────────
const LEVEL_1: LevelData = {
  id: 1,
  name: 'Sprint Zero',
  nodes: [
    { id: 'spawn',      x: 80,   y: 300, nextIds: ['dev'],         isCheckpoint: false, checkpointDuration: 0 },
    { id: 'dev',        x: 240,  y: 300, nextIds: ['qa'],          isCheckpoint: false, checkpointDuration: 0 },
    { id: 'qa',         x: 400,  y: 300, nextIds: ['staging'],     isCheckpoint: true,  checkpointDuration: 3000 },
    { id: 'staging',    x: 560,  y: 300, nextIds: ['prod', 'hotfix-lane'], isCheckpoint: false, checkpointDuration: 0 },
    { id: 'hotfix-lane',x: 560,  y: 450, nextIds: ['prod'],        isCheckpoint: false, checkpointDuration: 0 },
    { id: 'prod',       x: 720,  y: 300, nextIds: [],              isCheckpoint: false, checkpointDuration: 0 },
  ],
  spawnNodeId: 'spawn',
  destinationNodeId: 'prod',
};

// How often (ms) a new vehicle is spawned
const SPAWN_INTERVAL_BASE_MS = 4000;
// Vehicle types in round-robin spawn order
const SPAWN_SEQUENCE: VehicleType[] = [
  'FeatureCoupe',
  'BugfixAmbulance',
  'FeatureCoupe',
  'RefactorTanker',
  'HotfixMotorcycle',
];

// ────────────────────────────────────────────────────────────────────────────
// Game – main traffic-loop scene
// ────────────────────────────────────────────────────────────────────────────

/**
 * The Game scene is intentionally thin: it wires up systems, listens for
 * scene events, and delegates all game logic to PipelineManager and
 * ScoreEngine.  No game logic lives directly in update().
 */
export class Game extends Phaser.Scene {
  private _pipeline!: PipelineManager;
  private _score!: ScoreEngine;

  private _spawnIndex: number = 0;

  /** Key objects for keyboard shortcuts. */
  private _pauseKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'Game' });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  create(): void {
    this._drawTrack();

    this._pipeline = new PipelineManager(this, LEVEL_1);
    this._score = new ScoreEngine();

    this._wireEvents();
    this._setupInput();
    this._startSpawnTimer();

    // Launch HUD as an overlay scene (no init data needed – it subscribes to events)
    this.scene.launch('HUD');
  }

  update(_time: number, delta: number): void {
    if (this._score.state.paused) return;

    this._pipeline.update(delta);
    this._score.update(delta / 1000, performance.now());

    // Broadcast updated state to HUD scene
    this.events.emit('state-update', this._score.state);
  }

  // ── Track rendering ───────────────────────────────────────────────────────

  private _drawTrack(): void {
    const gfx = this.add.graphics();

    // Draw pipeline lane connections
    const nodes = LEVEL_1.nodes;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    gfx.lineStyle(6, 0x334466, 1);
    for (const node of nodes) {
      for (const nextId of node.nextIds) {
        const next = nodeMap.get(nextId);
        if (!next) continue;
        gfx.strokeLineShape(new Phaser.Geom.Line(node.x, node.y, next.x, next.y));
      }
    }

    // Draw node circles
    for (const node of nodes) {
      const isCheckpoint = node.isCheckpoint;
      const isDest = node.id === LEVEL_1.destinationNodeId;
      const isSpawn = node.id === LEVEL_1.spawnNodeId;

      gfx.fillStyle(
        isDest ? 0x00ff88 : isCheckpoint ? 0xf5a623 : isSpawn ? 0x4a90d9 : 0x334466,
        1,
      );
      gfx.fillCircle(node.x, node.y, 14);

      this.add
        .text(node.x, node.y + 22, node.id.toUpperCase(), {
          fontFamily: 'Courier New',
          fontSize: '9px',
          color: '#aabbcc',
        })
        .setOrigin(0.5, 0);
    }
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  private _wireEvents(): void {
    // Merge conflict
    this.events.on('merge-conflict', (e: MergeConflictEvent) => {
      this._score.onMergeConflict();
      this.events.emit('state-update', this._score.state);
      this._showConflictAlert(e);
    });

    // Rebase (conflict resolved)
    this.events.on('rebase', () => {
      this._score.onRebase();
      this.events.emit('state-update', this._score.state);
    });

    // Vehicle arrived
    this.events.on(
      'vehicle-arrived',
      (e: { vehicleId: string; type: VehicleType }) => {
        this._score.onVehicleArrived(e.type, performance.now());
        this._pipeline.removeVehicle(e.vehicleId);
        this.events.emit('state-update', this._score.state);
      },
    );

    // Vehicle destroyed (e.g. HotfixMotorcycle collision)
    this.events.on(
      'vehicle-destroyed',
      (e: { vehicleId: string; type: VehicleType }) => {
        if (e.type === 'HotfixMotorcycle') {
          this._score.onSiteOutage();
          this.time.delayedCall(10_000, () => this._score.clearSiteOutage());
          this._showOutageAlert();
        }
        this._pipeline.removeVehicle(e.vehicleId);
        this.events.emit('state-update', this._score.state);
      },
    );
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private _setupInput(): void {
    if (!this.input.keyboard) return;
    this._pauseKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this._pauseKey.on('down', () => this._togglePause());

    // Number keys 1–5 toggle junctions in order
    const junctionKeys = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
    ];

    junctionKeys.forEach((keyCode, i) => {
      const key = this.input.keyboard!.addKey(keyCode);
      key.on('down', () => {
        const junctionList = Array.from(this._pipeline.junctions.values());
        const junction = junctionList[i];
        junction?.switch();
      });
    });
  }

  private _togglePause(): void {
    const paused = !this._score.state.paused;
    this._score.setPaused(paused);

    if (paused) {
      this.physics.pause();
    } else {
      this.physics.resume();
    }

    this.events.emit('state-update', this._score.state);
  }

  // ── Spawning ──────────────────────────────────────────────────────────────

  private _startSpawnTimer(): void {
    this._scheduleNextSpawn(0);
  }

  private _scheduleNextSpawn(delayMs: number): void {
    this.time.delayedCall(delayMs, () => {
      this._spawnNextVehicle();
    });
  }

  private _spawnNextVehicle(): void {
    if (!this._score.state.paused) {
      const type = SPAWN_SEQUENCE[this._spawnIndex % SPAWN_SEQUENCE.length];
      this._spawnIndex++;
      this._pipeline.spawnVehicle(type);
    }

    // Schedule next spawn; interval shrinks as BPM increases
    const bpmFactor = this._score.state.bpm / 60;
    const nextDelay = Math.max(1000, SPAWN_INTERVAL_BASE_MS / bpmFactor);
    this._scheduleNextSpawn(nextDelay);
  }

  // ── UI feedback ───────────────────────────────────────────────────────────

  private _showConflictAlert(e: MergeConflictEvent): void {
    const camera = this.cameras.main;
    const text = this.add
      .text(camera.width / 2, camera.height / 2 - 60, '⚠ MERGE CONFLICT – REBASE REQUIRED', {
        fontFamily: 'Courier New',
        fontSize: '16px',
        color: '#ff4444',
        backgroundColor: '#1a0000',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(100);

    // Show lane name
    this.add
      .text(camera.width / 2, camera.height / 2 - 36, `Lane: ${e.laneNodeId}`, {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#ffaa44',
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 3000,
      duration: 500,
      onComplete: () => text.destroy(),
    });
  }

  private _showOutageAlert(): void {
    const camera = this.cameras.main;
    const text = this.add
      .text(camera.width / 2, camera.height / 2, '🔥 SITE OUTAGE', {
        fontFamily: 'Courier New',
        fontSize: '24px',
        color: '#ff0000',
        backgroundColor: '#1a0000',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(200);

    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 5000,
      duration: 1000,
      onComplete: () => text.destroy(),
    });
  }
}
