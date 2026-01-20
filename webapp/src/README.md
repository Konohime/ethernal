# Ethernal Webapp - Migration Guide

## Vue d'ensemble

Ce dossier contient les fichiers modernisés pour migrer Ethernal vers :
- **PIXI.js 7.4** (au lieu de 5.3)
- **Svelte 4** (au lieu de 3)
- **Webpack 5** (au lieu de 4)
- **ethers 6** (au lieu de 5)
- **Node.js 20+** (au lieu de 12)

## Fichiers à copier

### Fichiers de configuration (racine de webapp/)
- `package.json` → Remplace l'existant
- `webpack.config.js` → Remplace l'existant

### Fichiers source (webapp/src/)
- `main.js` → Remplace l'existant
- `app.js` → Remplace l'existant
- `index.ejs` → Remplace l'existant

### Nouveau fichier de compatibilité PIXI
- `src/lib/pixi-compat.js` → **NOUVEAU** - Crée ce fichier

### Fichiers canvas migrés
- `src/canvas/common/Utils.js` → Remplace l'existant
- `src/canvas/common/layersGroup.js` → Remplace l'existant
- `src/canvas/common/ActionButton.js` → Remplace l'existant
- `src/canvas/common/NameTag.js` → Remplace l'existant
- `src/canvas/map/UI.js` → Remplace l'existant

### Fichiers components migrés
- `src/components/map/MapArea.svelte` → Remplace l'existant

### Fichiers stores migrés
- `src/stores/wallet.js` → Remplace l'existant

### Styles
- `src/styles/_variables.scss` → Garde l'existant ou copie celui-ci

## Installation

```bash
cd webapp

# Supprimer les anciens fichiers
rm -rf node_modules
rm package-lock.json

# Copier les nouveaux fichiers (depuis ce dossier)
# ... copier les fichiers listés ci-dessus ...

# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev:base-sepolia
```

## Changements principaux PIXI 5 → 7

### 1. Imports
```javascript
// Ancien (PIXI 5)
import 'pixi.js';
window.PIXI = PIXI;
require('pixi-layers');

// Nouveau (PIXI 7)
import PIXI, { Stage, Group, Layer } from 'lib/pixi-compat';
```

### 2. Chargement d'assets
```javascript
// Ancien (PIXI 5)
const loader = PIXI.Loader.shared;
loader.add('name', '/path/to/image.png');
loader.load(() => {
  const texture = PIXI.utils.TextureCache['name'];
});

// Nouveau (PIXI 7)
PIXI.Assets.add({ alias: 'name', src: '/path/to/image.png' });
await PIXI.Assets.load('name');
const texture = PIXI.Assets.get('name');
```

### 3. Interactivité
```javascript
// Ancien (PIXI 5)
sprite.interactive = true;
sprite.buttonMode = true;

// Nouveau (PIXI 7)
sprite.eventMode = 'static';
sprite.cursor = 'pointer';
```

### 4. Viewport
```javascript
// Ancien (PIXI 5)
new Viewport({
  interaction: app.renderer.plugins.interaction,
});

// Nouveau (PIXI 7)
new Viewport({
  events: app.renderer.events,
});
```

### 5. Stage avec layers
```javascript
// Ancien (PIXI 5)
app.stage = new PIXI.display.Stage();

// Nouveau (PIXI 7)
import { Stage } from '@pixi/layers';
app.stage = new Stage();
```

### 6. Canvas element
```javascript
// Ancien (PIXI 5)
container.appendChild(app.view);

// Nouveau (PIXI 7)
container.appendChild(app.canvas);
```

## Migration progressive

Si des erreurs apparaissent, migrez les fichiers un par un :

1. Cherchez l'import `import 'pixi.js'` et remplacez par `import PIXI from 'lib/pixi-compat'`
2. Remplacez `PIXI.Loader.shared` par `PIXI.Assets`
3. Remplacez `buttonMode` par `cursor = 'pointer'`
4. Remplacez `interactive` par `eventMode = 'static'`
5. Remplacez les classes prototype par des classes ES6

## Fichiers restants à migrer

Les fichiers suivants utilisent PIXI et devront être migrés si des erreurs apparaissent :

### canvas/map/render/
- MapRenderer.js (le plus gros - ~1900 lignes)
- Camera.js
- CameraComposer.js
- Character.js
- MapChunk.js
- MapUtils.js
- Path.js
- room/Room.js
- room/RoomExit.js
- room/RoomSprite.js
- room/RoomSpriteSheet.js
- util/Light.js
- util/RadialButtonMenu.js
- util/ReplacementMaterial.js

### canvas/combat/
- Combat.js
- render/CombatRenderer.js
- render/Monster.js
- Et tous les fichiers UI de combat...

## Support

En cas de problème, les changements les plus courants sont :
1. Import PIXI incorrect → utiliser `lib/pixi-compat`
2. `TextureCache` non défini → les assets ne sont pas encore chargés
3. `interaction` plugin manquant → utiliser `events` à la place
