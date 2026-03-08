import Phaser from 'phaser';
import { PipelineNode } from '../types';

// ────────────────────────────────────────────────────────────────────────────
// Junction – track-switching entity
// ────────────────────────────────────────────────────────────────────────────

/**
 * A Junction is placed at a PipelineNode that has more than one outgoing edge.
 * The Conductor clicks it to toggle which outgoing lane is active.
 */
export class Junction extends Phaser.GameObjects.Container {
  readonly junctionId: string;
  readonly node: PipelineNode;

  /** Index into node.nextIds that represents the currently active outgoing lane. */
  private _activeBranchIndex: number = 0;

  /** Visual indicator (arrow / light) showing the active branch. */
  private _indicator: Phaser.GameObjects.Graphics;

  /** Whether this junction is showing a red-light signal. */
  private _redLight: boolean = false;

  constructor(scene: Phaser.Scene, node: PipelineNode) {
    super(scene, node.x, node.y);

    this.junctionId = `junction-${node.id}`;
    this.node = node;

    // Draw base circle
    const base = scene.add.graphics();
    base.fillStyle(0x222244, 1);
    base.fillCircle(0, 0, 18);
    base.lineStyle(2, 0x00ff88, 1);
    base.strokeCircle(0, 0, 18);
    this.add(base);

    // Direction indicator arrow
    this._indicator = scene.add.graphics();
    this.add(this._indicator);

    this._drawIndicator();

    scene.add.existing(this);

    // Make interactive so the player can click to toggle
    this.setInteractive(
      new Phaser.Geom.Circle(0, 0, 18),
      Phaser.Geom.Circle.Contains,
    );

    this.on('pointerdown', this._onPointerDown, this);
    this.on('pointerover', () => this.setAlpha(0.8));
    this.on('pointerout', () => this.setAlpha(1));
  }

  // ── Properties ────────────────────────────────────────────────────────────

  get activeBranchIndex(): number {
    return this._activeBranchIndex;
  }

  get activeBranchNodeId(): string {
    return this.node.nextIds[this._activeBranchIndex] ?? '';
  }

  get redLight(): boolean {
    return this._redLight;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Toggle to the next available outgoing branch. */
  switch(): void {
    if (this.node.nextIds.length < 2) return;
    this._activeBranchIndex = (this._activeBranchIndex + 1) % this.node.nextIds.length;
    this._drawIndicator();
    this.scene.events.emit('junction-switched', {
      junctionId: this.junctionId,
      newBranchIndex: this._activeBranchIndex,
    });
  }

  /** Set the red-light state (vehicles not ignoring it will stop before this junction). */
  setRedLight(on: boolean): void {
    this._redLight = on;
    this._drawIndicator();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _onPointerDown(): void {
    this.switch();
  }

  private _drawIndicator(): void {
    this._indicator.clear();

    if (this._redLight) {
      this._indicator.fillStyle(0xff0000, 1);
      this._indicator.fillCircle(0, 0, 8);
      return;
    }

    this._indicator.fillStyle(0x00ff88, 1);

    // Draw a small arrow pointing in the direction of the active branch
    const angle = (this._activeBranchIndex / Math.max(1, this.node.nextIds.length)) * Math.PI * 2;
    const tipX = Math.cos(angle) * 12;
    const tipY = Math.sin(angle) * 12;
    const leftX = Math.cos(angle + 2.4) * 6;
    const leftY = Math.sin(angle + 2.4) * 6;
    const rightX = Math.cos(angle - 2.4) * 6;
    const rightY = Math.sin(angle - 2.4) * 6;

    this._indicator.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
  }
}
