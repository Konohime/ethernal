/**
 * PIXI.js 7+ Compatibility Layer
 * 
 * Ce fichier centralise tous les imports PIXI et fournit une interface
 * compatible avec l'ancien code qui utilisait PIXI 5.x
 */

import * as PIXI from 'pixi.js';
import { Layer, Stage, Group } from '@pixi/layers';
import { CompositeTilemap, settings as tilemapSettings } from '@pixi/tilemap';

// Re-export PIXI avec les extensions
export * from 'pixi.js';
export { Layer, Stage, Group } from '@pixi/layers';
export { CompositeTilemap } from '@pixi/tilemap';

// Créer un objet PIXI modifiable
const PIXICompat = { ...PIXI };

// Ajouter les extensions de layers à PIXI.display pour compatibilité
PIXICompat.display = {
  Stage,
  Layer,
  Group,
};

// Ajouter tilemap à PIXI pour compatibilité
PIXICompat.tilemap = {
  CompositeTilemap,
  CompositeRectTileLayer: CompositeTilemap,
  settings: tilemapSettings,
  Constant: tilemapSettings,
};

// Configuration par défaut
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;

// Classe de compatibilité pour le chargement d'assets
class AssetsLoader {
  constructor() {
    this._progress = 0;
    this._onStart = { add: (fn) => this._startCallbacks.push(fn) };
    this._onProgress = { add: (fn) => this._progressCallbacks.push(fn) };
    this._onLoad = { add: (fn) => this._loadCallbacks.push(fn) };
    this._onComplete = { add: (fn) => this._completeCallbacks.push(fn) };
    this._onError = { add: (fn) => this._errorCallbacks.push(fn) };
    
    this._startCallbacks = [];
    this._progressCallbacks = [];
    this._loadCallbacks = [];
    this._completeCallbacks = [];
    this._errorCallbacks = [];
    
    this._queue = [];
    this._loaded = {};
  }
  
  get progress() {
    return this._progress;
  }
  
  get onStart() { return this._onStart; }
  get onProgress() { return this._onProgress; }
  get onLoad() { return this._onLoad; }
  get onComplete() { return this._onComplete; }
  get onError() { return this._onError; }
  
  add(name, url) {
    if (typeof name === 'object') {
      this._queue.push(name);
    } else {
      this._queue.push({ name, url });
    }
    return this;
  }
  
  async load(callback) {
    try {
      this._startCallbacks.forEach(fn => fn());
      
      const total = this._queue.length;
      let loaded = 0;
      
      for (const item of this._queue) {
        const { name, url } = item;
        try {
          PIXI.Assets.add({ alias: name, src: url });
          const resource = await PIXI.Assets.load(name);
          this._loaded[name] = resource;
          
          loaded++;
          this._progress = (loaded / total) * 100;
          
          this._progressCallbacks.forEach(fn => fn({ progress: this._progress }));
          this._loadCallbacks.forEach(fn => fn(null, { name, texture: resource }));
        } catch (err) {
          console.error(`Failed to load ${name}:`, err);
          this._errorCallbacks.forEach(fn => fn(err, null, { name }));
        }
      }
      
      this._progress = 100;
      this._completeCallbacks.forEach(fn => fn());
      
      if (callback) {
        callback();
      }
    } catch (err) {
      console.error('Loader error:', err);
      this._errorCallbacks.forEach(fn => fn(err));
    }
  }
  
  reset() {
    this._queue = [];
    this._progress = 0;
  }
}

// Singleton loader
const sharedLoader = new AssetsLoader();

// Ajouter le loader de compatibilité
PIXICompat.Loader = {
  shared: sharedLoader,
};

// Helper pour TextureCache - créer un nouvel objet utils
PIXICompat.utils = {
  ...PIXI.utils,
  get TextureCache() {
    return new Proxy({}, {
      get(target, prop) {
        const cached = PIXI.Assets.cache.get(prop);
        if (cached) return cached;
        return PIXI.Assets.get(prop);
      }
    });
  }
};

// Compatibilité pour PIXI.settings
PIXICompat.settings = {
  get SCALE_MODE() {
    return PIXI.BaseTexture.defaultOptions.scaleMode;
  },
  set SCALE_MODE(value) {
    PIXI.BaseTexture.defaultOptions.scaleMode = value;
  }
};

// Patch Container pour supporter buttonMode (deprecated)
const originalContainerProto = PIXI.Container.prototype;
if (!Object.getOwnPropertyDescriptor(originalContainerProto, 'buttonMode')) {
  Object.defineProperty(originalContainerProto, 'buttonMode', {
    get() {
      return this.cursor === 'pointer';
    },
    set(value) {
      this.cursor = value ? 'pointer' : null;
      this.eventMode = value ? 'static' : 'auto';
    }
  });
}

// Patch pour interactive
if (!Object.getOwnPropertyDescriptor(originalContainerProto, 'interactive')) {
  Object.defineProperty(originalContainerProto, 'interactive', {
    get() {
      return this.eventMode === 'static' || this.eventMode === 'dynamic';
    },
    set(value) {
      this.eventMode = value ? 'static' : 'auto';
    }
  });
}

// Export global pour compatibilité avec window.PIXI
if (typeof window !== 'undefined') {
  window.PIXI = PIXICompat;
}

export default PIXICompat;