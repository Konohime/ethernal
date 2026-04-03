import 'pixi.js';
import { createBorder } from './UIUtils';

/**
 * TODO: Document.
 *
 * @param path {string} The path to the file or URL or texture of the icon to display.
 * @param fallbackTexture {PIXI.Texture} The path to the file or URL or texture of the icon to display.
 *
 * @constructor
 */
class TextureIcon extends PIXI.Container {
  constructor(dimensions, path, fallbackTexture) {
    super();

    this.position.x = dimensions.x;
    this.position.y = dimensions.y;
    this._width = dimensions.width;
    this._height = dimensions.height;

    this.path = path;
    if (this.path) {
      try {
        this.texture = PIXI.Texture.from(path);
        this.texture.on('load', () => {
          this.sprite.texture = this.texture;
        });
      } catch (e) {
        console.error(`Failed to load texture: '${path}'`);
        console.error(e);
      }
    }

    this.sprite = new PIXI.Sprite(fallbackTexture);

    if (!fallbackTexture.valid) {
      fallbackTexture.on('load', () => {
        this.sprite.texture = fallbackTexture;
      });
    }

    this.setBorderColor(0x464646);
  }

  setBorderColor(color) {
    this.color = color;
    this.border = createBorder(this._width, this._height, 0, this.color);
    this.apply();
  }

  apply() {
    this.removeChildren();
    this.addChild(this.border);
    this.addChild(this.sprite);
  }
}

export default TextureIcon;
