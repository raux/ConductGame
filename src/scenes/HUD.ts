import Phaser from 'phaser';
import { GameState } from '../types';

// ────────────────────────────────────────────────────────────────────────────
// HUD – metrics overlay scene
// ────────────────────────────────────────────────────────────────────────────

/**
 * The HUD scene runs in parallel with the Game scene and renders the
 * live metrics dashboard.  It listens for `state-update` events from
 * the Game scene's EventEmitter and refreshes the display each time
 * the state changes.
 *
 * The HUD deliberately uses Phaser Text objects (canvas rendering) so that
 * it works without any DOM framework dependency.  For complex menu systems
 * a React/Vue overlay mounted to #hud-overlay can be layered on top.
 */
export class HUD extends Phaser.Scene {

  // Text display objects
  private _uptimeText!: Phaser.GameObjects.Text;
  private _velocityText!: Phaser.GameObjects.Text;
  private _bpmText!: Phaser.GameObjects.Text;
  private _conflictsText!: Phaser.GameObjects.Text;
  private _deliveredText!: Phaser.GameObjects.Text;
  private _pauseText!: Phaser.GameObjects.Text;
  private _outageText!: Phaser.GameObjects.Text;

  // Uptime bar fill
  private _uptimeBar!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'HUD' });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  // init is intentionally minimal; state is retrieved via scene events
  // from the Game scene rather than passed as init data.

  create(): void {
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x00000000); // transparent

    const pad = 12;
    const lineH = 22;

    // Background panel
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.6);
    panel.fillRect(pad - 4, pad - 4, 230, 160);
    panel.lineStyle(1, 0x00ff88, 0.4);
    panel.strokeRect(pad - 4, pad - 4, 230, 160);

    // Uptime bar background
    const barBg = this.add.graphics();
    barBg.fillStyle(0x333333, 1);
    barBg.fillRect(pad, pad + lineH * 1 + 18, 200, 10);

    this._uptimeBar = this.add.graphics();

    // Text labels
    this._uptimeText = this._makeText(pad, pad, '');
    this._velocityText = this._makeText(pad, pad + lineH * 2 + 20, '');
    this._bpmText = this._makeText(pad, pad + lineH * 3 + 20, '');
    this._conflictsText = this._makeText(pad, pad + lineH * 4 + 20, '');
    this._deliveredText = this._makeText(pad, pad + lineH * 5 + 20, '');

    // Pause indicator (centred)
    this._pauseText = this.add
      .text(this.cameras.main.width / 2, this.cameras.main.height / 2, '⏸ PAUSED', {
        fontFamily: 'Courier New',
        fontSize: '28px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(500)
      .setVisible(false);

    // Site outage banner
    this._outageText = this.add
      .text(this.cameras.main.width / 2, 60, '🔥 SITE OUTAGE ACTIVE', {
        fontFamily: 'Courier New',
        fontSize: '14px',
        color: '#ff0000',
        backgroundColor: '#1a0000',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(400)
      .setVisible(false);

    // Subscribe to state updates from Game scene
    const gameScene = this.scene.get('Game');
    gameScene.events.on('state-update', this._onStateUpdate, this);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private _onStateUpdate(state: GameState): void {
    this._uptimeText.setText(`Uptime:    ${state.uptime.toFixed(1)}%`);
    this._velocityText.setText(`Velocity:  ${state.velocity} pkgs/min`);
    this._bpmText.setText(`Tempo:     ${state.bpm.toFixed(0)} BPM`);

    const conflictLabel = state.activeMergeConflicts > 0
      ? `⚠ Conflicts: ${state.activeMergeConflicts} – REBASE!`
      : `Conflicts:  ${state.activeMergeConflicts}`;
    this._conflictsText.setText(conflictLabel);
    this._conflictsText.setColor(state.activeMergeConflicts > 0 ? '#ff4444' : '#00ff88');

    this._deliveredText.setText(`Delivered: ${state.deliveredCount}`);

    // Uptime progress bar
    const pad = 12;
    const lineH = 22;
    this._uptimeBar.clear();
    const barColour = state.uptime > 60 ? 0x00ff88 : state.uptime > 30 ? 0xf5a623 : 0xff4444;
    this._uptimeBar.fillStyle(barColour, 1);
    this._uptimeBar.fillRect(pad, pad + lineH * 1 + 18, (state.uptime / 100) * 200, 10);

    // Pause overlay
    this._pauseText.setVisible(state.paused);

    // Outage banner
    this._outageText.setVisible(state.siteOutageActive);
  }

  private _makeText(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, {
      fontFamily: 'Courier New',
      fontSize: '12px',
      color: '#00ff88',
    });
  }
}
