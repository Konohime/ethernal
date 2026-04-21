import { writable } from 'svelte/store';

let fromLocalStorage;
try {
  fromLocalStorage = localStorage.getItem('characterChoice');
  fromLocalStorage = JSON.parse(fromLocalStorage);
} catch (err) {
  //
}

let $data = fromLocalStorage || { name: '', characterClass: 0, spriteId: null };
window.$characterChoice = $data;

const { subscribe, set } = writable($data);

export default {
  subscribe,
  setData: data => {
    $data = data;
    localStorage.setItem('characterChoice', JSON.stringify($data));
    // eslint-disable-next-line no-console
    console.log('characterChoice', $data);
    set($data);
  },
  clear: () => {
    // Preserve spriteId: it's a visual preference that should survive entering the
    // dungeon, since the map renderer reads it to load the custom character sprite.
    const keptSpriteId = $data && $data.spriteId != null ? $data.spriteId : null;
    $data = { name: '', characterClass: 0, spriteId: keptSpriteId };
    if (keptSpriteId != null) {
      localStorage.setItem('characterChoice', JSON.stringify($data));
    } else {
      localStorage.removeItem('characterChoice');
    }
    set($data);
  },
};
