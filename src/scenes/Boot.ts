import Phaser from 'phaser';

// ────────────────────────────────────────────────────────────────────────────
// Boot – preloader scene
// ────────────────────────────────────────────────────────────────────────────

/**
 * The Boot scene loads all assets before the Game scene starts.
 * It also generates placeholder graphics for vehicles if sprite sheets are
 * not yet available.
 */
export class Boot extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    // Progress bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBox = this.add.graphics();
    const progressBar = this.add.graphics();

    progressBox.fillStyle(0x222244, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

    const loadingText = this.add
      .text(width / 2, height / 2 - 50, 'Loading Mainline Maestro...', {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#00ff88',
      })
      .setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x00ff88, 1);
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // ── Generate placeholder vehicle texture ──────────────────────────────
    // If a real sprite sheet is supplied in /public/assets, replace the key
    // 'vehicle' with the actual file reference via this.load.spritesheet().
    this._createVehicleTexture();
  }

  create(): void {
    this.scene.start('Game');
  }

  // ── Texture generation ────────────────────────────────────────────────────

  /**
   * Programmatically generates a simple 32×32 white circle texture used as
   * the base sprite for all vehicle types.  The Vehicle class applies a tint
   * per type so no separate asset is needed during development.
   */
  private _createVehicleTexture(): void {
    if (this.textures.exists('vehicle')) return;

    const size = 32;
    const rt = this.add.renderTexture(0, 0, size, size);
    const gfx = this.add.graphics();
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(size / 2, size / 2, size / 2 - 2);
    rt.draw(gfx, 0, 0);
    rt.saveTexture('vehicle');
    rt.destroy();
    gfx.destroy();
  }
}
