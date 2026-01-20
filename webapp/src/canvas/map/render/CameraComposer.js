import PIXI from 'lib/pixi-compat';

const TMP_Matrix = new PIXI.Matrix();
const TMP_Point = new PIXI.Point();

// PIXI 7 n'a plus systems.ProjectionSystem accessible
// On simplifie le CameraComposer pour fonctionner sans patcher le système de projection

export function patchTreeSearch(interaction) {
  // Dans PIXI 7, le système d'événements est différent
  // Cette fonction devient un no-op pour l'instant
  console.warn('patchTreeSearch: skipped for PIXI 7 compatibility');
}

// real camera, supress transform mutation when move.
export class CameraComposer extends PIXI.Container {
  /**
   *
   * @param {PIXI.Container } stage - container for apply camera transform
   * @param {PIXI.Container} [listen] - container for listening transformation instead itself
   * @param {boolean} [inverse] - inverse transform matrix
   *
   */
  constructor(stage, listen, inverse = false) {
    super();

    this.eventMode = 'static'; // PIXI 7: remplace interactive = true
    this.inverse = inverse;
    this.stage = stage;
    this.listen = listen || this;

    this.isComposer = true;

    this.addChild(stage);

    this.visible = true;
    this.interactiveChildren = true;
  }

  updateTransform() {
    // Mise à jour standard du transform
    this._boundsID++;
    
    this.transform.updateTransform(this.parent.transform);
    this.worldAlpha = this.alpha * this.parent.worldAlpha;

    // Mettre à jour le stage avec le transform de la caméra
    for (let i = 0, j = this.children.length; i < j; ++i) {
      const child = this.children[i];
      if (child.visible) {
        child.updateTransform();
      }
    }
  }

  get matrix() {
    TMP_Matrix.copyFrom(this.listen.worldTransform);

    if (this.inverse) {
      return TMP_Matrix.invert();
    }

    return TMP_Matrix;
  }

  /**
   * @type {PIXI.Matrix}
   */
  get invertedMatrix() {
    TMP_Matrix.copyFrom(this.listen.worldTransform);

    if (this.inverse) {
      return TMP_Matrix;
    }

    return TMP_Matrix.invert();
  }

  /**
   * Transform from camera viewport to screen
   * @param {PIXI.IPoint} point
   * @param {PIXI.IPoint} [output]
   * @param {boolean} [inverse] - inverse matrix
   */
  transformPoint(point, output = new PIXI.Point(), inverse = false) {
    const m = inverse ? this.invertedMatrix : this.matrix;

    m.apply(point, output);
    return output;
  }

  /**
   *
   * @param {PIXI.Rectangle} rect
   * @param {PIXI.Rectangle} [output]
   * @param {boolean} [inverse] - inverse matrix
   */
  transformRect(rect, output = new PIXI.Rectangle(), inverse = false) {
    const m = inverse ? this.invertedMatrix : this.matrix;

    output.copyFrom(rect);

    m.apply(output, output);

    output.width *= m.a;
    output.height *= m.d;

    return output;
  }
}