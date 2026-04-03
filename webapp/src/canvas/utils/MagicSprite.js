import { Sprite } from 'pixi.js';

export default class MagicSprite extends Sprite {
  constructor(texture) {
    super(texture);

    this.camera = undefined;
    this.containsPoint = undefined;
    this.interactive = false;
  }

  updateTransform() {
    this.transform.updateLocalTransform();

    if (this.camera) {
      // Render at screen-space (0,0) so the fog overlay covers the full screen
      this.worldTransform.set(1, 0, 0, 1, 0, 0);
      this._transformID = -1;
    }
  }
}
