/**
 * UI.js - Migrated to PIXI 7
 * 
 * Changes:
 * - Import from pixi-compat
 * - gsap replaces pixi-ease for animations
 */
import PIXI from 'lib/pixi-compat';
import gsap from 'gsap';

import layerGroups from 'canvas/common/layersGroup';
import ActionButton from 'canvas/common/ActionButton';
import NameTag from 'canvas/common/NameTag';
import { ELLIPSIS, actionsText } from 'data/text';

const { UI_GROUP } = layerGroups;

export default class UI {
  constructor(viewport, cache, app) {
    this.cache = cache;
    this.viewport = viewport;
    this.app = app;
  }

  log(message) {
    this.cache.pushHistory(message);
  }

  remove() {
    // safety checks
    if (this.current && this.current.parent) {
      this.current.parent.removeChild(this.current);
    }
    if (this.currentLabel && this.currentLabel.parent) {
      this.currentLabel.parent.removeChild(this.currentLabel);
    }
    this.current = null;
    this.currentLabel = null;
    clearInterval(this._intv);
    this.onCancel = null;
  }

  removeCurrent() {
    if (this.current) {
      const oldOnCancel = this.onCancel;
      this.current.parent.removeChild(this.current);
      this.current = null;
      this.onCancel = null;

      if (oldOnCancel) {
        oldOnCancel();
      }
    }
  }

  removeCurrentLabel() {
    if (this.currentLabel) {
      this.currentLabel.parent.removeChild(this.currentLabel);
      this.currentLabel = null;
      clearInterval(this._intv);
    }
  }

  /**
   * @param id
   * @param parent
   * @param text
   * @returns {null|PIXI.Container}
   */
  roomLabel({ id, parent, text }) {
    const group = new PIXI.Container();
    group.parentGroup = UI_GROUP;
    group.uniqueLocation = id;

    const labelTag = new PIXI.Sprite();
    labelTag.anchor.set(0.5);

    const labelText = new NameTag(text, { fontSize: 13 });
    labelTag.addChild(labelText);

    if (this.currentLabel && this.currentLabel.uniqueLocation !== id) {
      group.alpha = 0;
      gsap.to(group, { alpha: 1, duration: 0.2 });
    }
    this.removeCurrentLabel();

    this._intv = setTimeout(() => {
      gsap.to(this.currentLabel, {
        alpha: 0,
        duration: 0.2,
        onComplete: () => {
          this.removeCurrentLabel();
        }
      });
    }, 3000);

    group.addChild(labelTag);
    this.currentLabel = group;
    return group;
  }

  /**
   * @param id
   * @param parent
   * @param text
   * @param onCancel
   * @param onConfirm
   * @param disabled
   * @param data
   * @param data.text
   * @param data.fontSize
   * @param data.confirmingText
   * @param uniqueLocation if same as last time, window just closes and nothing is opened
   * @param confirmingText
   * @param confirmClose
   * @returns {null|PIXI.Container}
   */
  buttons({ id, parent, buttons, onCancel }) {
    // Ensure fresh buttons
    this.removeCurrent();

    const group = new PIXI.Container();
    group.parentGroup = UI_GROUP;
    group.uniqueLocation = id;

    this.current = group;
    this.onCancel = onCancel;

    const yOffset = 34;
    buttons.filter(Boolean).forEach((button, i) => {
      const { type, text, data, closeable = true, disabled, confirmingText, onClick } = button;

      const btn = new ActionButton(
        'wide',
        type,
        async evt => {
          evt.stopPropagation();

          // Allow confirming text override
          if (confirmingText) {
            // Remove all buttons
            for (let j = group.children.length - 1; j >= 0; j -= 1) {
              group.removeChild(group.children[j]);
            }
            const replacement = new ActionButton('wide', confirmingText);
            replacement.disable();
            group.addChild(replacement);
          }

          // Do action
          if (onClick) {
            await onClick();
          }

          // Remove if cancellable
          if (type === 'cancel' || closeable) {
            this.remove();
          }
        },
        { text, ...data },
      );

      // Disable
      if (disabled) {
        btn.disable();
      }

      // Position
      btn.y = yOffset * i;

      // Add
      group.addChild(btn);
    });

    parent.addChild(group);
    return group;
  }
}
