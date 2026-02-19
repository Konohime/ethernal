import PIXI from 'lib/pixi-compat';

const TMP_Matrix = new PIXI.Matrix();
const TMP_Point = new PIXI.Point();

export function patchTreeSearch(interaction) {
  console.warn('patchTreeSearch: skipped for PIXI 7 compatibility');
}

export class CameraComposer extends PIXI.Container {
  constructor(stage, listen, inverse = false) {
    super();

    this.eventMode = 'static';
    this.inverse = inverse;
    this.stage = stage;
    this.listen = listen || this;

    this.isComposer = true;

    this.addChild(stage);

    this.visible = true;
    this.interactiveChildren = true;
  }

  updateTransform() {
    this._boundsID++;

    this.transform.updateTransform(this.parent.transform);
    this.worldAlpha = this.alpha * this.parent.worldAlpha;

    // Apply the camera (listen) worldTransform to stage.
    // Core of the camera system: stage gets the camera matrix
    // so all scene content moves with the camera.
    if (this.stage && this.listen) {
      const listenWT = this.listen.worldTransform;
      const stageWT = this.stage.worldTransform;

      if (this.inverse) {
        TMP_Matrix.copyFrom(listenWT);
        TMP_Matrix.invert();
        stageWT.copyFrom(TMP_Matrix);
      } else {
        stageWT.copyFrom(listenWT);
      }

      this.stage.worldAlpha = this.worldAlpha;
      for (let i = 0, j = this.stage.children.length; i < j; ++i) {
        const child = this.stage.children[i];
        if (child.visible) {
          child.updateTransform();
        }
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

  get invertedMatrix() {
    TMP_Matrix.copyFrom(this.listen.worldTransform);
    if (this.inverse) {
      return TMP_Matrix;
    }
    return TMP_Matrix.invert();
  }

  transformPoint(point, output = new PIXI.Point(), inverse = false) {
    const m = inverse ? this.invertedMatrix : this.matrix;
    m.apply(point, output);
    return output;
  }

  transformRect(rect, output = new PIXI.Rectangle(), inverse = false) {
    const m = inverse ? this.invertedMatrix : this.matrix;
    output.copyFrom(rect);
    m.apply(output, output);
    output.width *= m.a;
    output.height *= m.d;
    return output;
  }
}
