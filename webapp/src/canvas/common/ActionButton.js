/**
 * ActionButton - Migrated to PIXI 7
 * 
 * Changes from PIXI 5:
 * - Uses ES6 class syntax instead of prototype
 * - buttonMode → cursor = 'pointer' + eventMode = 'static'
 * - PIXI.utils.TextureCache → Assets.get() via pixi-compat
 */
import PIXI from 'lib/pixi-compat';

export default class ActionButton extends PIXI.Container {
  constructor(type, content, action, data = {}) {
    super();

    const tCache = PIXI.utils.TextureCache;
    const { text, fontSize = 10 } = data;

    if (type === 'textBtn' || type === 'wideTextBtn') {
      // add square
      this.sqrSprite = new PIXI.Sprite(
        tCache[type === 'wideTextBtn' ? 'ui_map_teleportBtn.png' : 'ui_combat_selectBtn.png'],
      );
      this.sqrSprite.anchor.set(0.5);
      if (type === 'wideTextBtn') {
        this.sqrSprite.scale.set(2.2, 1.4);
      }
      this.addChild(this.sqrSprite);
      this.textSprite = new PIXI.Text(content, {
        fontFamily: 'Space Mono',
        fontSize,
        fill: 0xffffff,
        align: 'center',
      });
    } else if (type === 'actionSelectBtn') {
      // add square
      this.sqrSprite = new PIXI.Sprite(tCache['ui_combat_selectBtn.png']);
      this.sqrSprite.anchor.set(0.5);
      this.sqrSprite.scale.set(1.4, 0.7);
      this.addChild(this.sqrSprite);

      if (content === 'attack') {
        this.textSprite = new PIXI.Sprite(tCache['ui_combat_label_selectAtk.png']);
      } else {
        this.textSprite = new PIXI.Sprite(tCache['ui_combat_label_selectDef.png']);
      }
      this.textSprite.scale.set(0.25);
    } else if (type === 'wide') {
      this.rectSprite = new PIXI.Sprite(tCache['ui_map_teleportBtn.png']);
      this.rectSprite.anchor.set(0.5);
      this.rectSprite.scale.set(2, 1.2);
      this.addChild(this.rectSprite);

      if (content === 'confirm') {
        this.textSprite = new PIXI.Text(text, {
          fontFamily: 'Space Mono',
          fontSize,
          fill: 0xffffff,
          align: 'center',
        });
      } else if (content === 'teleporting') {
        this.textSprite = new PIXI.Sprite(tCache['ui_map_label_teleporting.png']);
        this.textSprite.scale.set(0.25);
      } else if (content === 'attack') {
        this.textSprite = new PIXI.Sprite(tCache['ui_combat_label_attack.png']);
        this.textSprite.scale.set(0.25);
      } else {
        this.textSprite = new PIXI.Text(text || '', {
          fontFamily: 'Space Mono',
          fontSize,
          fill: 0xffffff,
          align: 'center',
        });
      }
    }

    if (this.textSprite) {
      this.textSprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      this.textSprite.anchor.set(0.5);
      this.addChild(this.textSprite);
    }
    
    this.enable();

    this.action = action || (() => {});
    this.on('pointerdown', (...args) => this.action(...args));
  }

  enable() {
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.enabled = true;
    this.alpha = 1;
  }

  disable() {
    this.eventMode = 'none';
    this.cursor = null;
    this.enabled = false;
    this.alpha = 0.5;
  }
}
