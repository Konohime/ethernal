import { soliditySha3 } from 'web3-utils';
import * as BN from 'bn.js';

import { roomsText } from 'data/text';
import { formatCoordinates } from 'utils/utils';

import IconBossRoom from 'assets/room_boss.png';
import IconCarrierRoom from 'assets/room_carrier.png';
import IconLoreRoom from 'assets/room_lore.png';
import IconRegularRoom from 'assets/room_regular.png';
import IconTeleportRoom from 'assets/room_teleport.png';
import IconTempleRoom from 'assets/room_temple.png';

const roomImages = Object.freeze({
  1: IconRegularRoom,
  2: IconTeleportRoom,
  3: IconTempleRoom,
  4: IconLoreRoom,
  5: IconCarrierRoom,
  6: IconBossRoom,
});

const getRandomValue = (location, hash, index, mod) => {
  // Valider les inputs avant d'appeler soliditySha3
  if (location === undefined || location === null || location === '' || 
      hash === undefined || hash === null || hash === '' ||
      isNaN(Number(index)) || isNaN(Number(mod)) || mod === 0) {
    // Retourner une valeur par défaut si les inputs sont invalides
    return new BN(0);
  }
  
  try {
    const random = soliditySha3(
      { type: 'uint256', value: location },
      { type: 'bytes32', value: hash },
      { type: 'uint8', value: index },
    );
    return new BN(random.slice(2), 'hex').mod(new BN(mod));
  } catch (e) {
    console.warn('roomGenerator: getRandomValue failed', { location, hash, index, mod }, e);
    return new BN(0);
  }
};

class RNG {
  constructor(roomLocation, roomHash, roomKind) {
    this.roomLocation = roomLocation;
    this.roomHash = roomHash;
    this.kind = roomKind;
    this.counter = 0; // Initialiser le counter !
  }

  randomInteger(from = 0, to = Number.MAX_SAFE_INTEGER) {
    const mod = to - from;
    if (mod <= 0) return from;
    
    const bn = getRandomValue(this.roomLocation, this.roomHash, (this.counter += 1), mod);
    return bn.toNumber() + from;
  }

  randomItem(array) {
    if (!array || array.length === 0) {
      return undefined;
    }
    const index = this.randomInteger(0, array.length);
    return array[index];
  }

  randomName() {
    const names = roomsText.names[this.kind];
    if (!names || names.length === 0) {
      return 'Unknown Room';
    }
    return this.randomItem(names);
  }

  randomEntry() {
    const entries = roomsText.sentences?.entry?.[this.kind];
    if (!entries || entries.length === 0) {
      return null;
    }
    return this.randomItem(entries);
  }
}

const roomGenerator = room => {
  if (!room) {
    return null;
  }

  const formattedCoordinates = formatCoordinates(room.coordinates);
  
  // Si la room n'a pas de kind, ou pas de hash/location valide, retourner un objet minimal
  if (!room.kind) {
    return { ...room, name: 'Room', image: '', formattedCoordinates };
  }

  // Vérifier que location et hash sont valides avant de créer le RNG
  if (!room.location || !room.hash) {
    console.warn('roomGenerator: room missing location or hash', room.coordinates, { location: room.location, hash: room.hash });
    return { 
      ...room, 
      name: room.coordinates === '0,0' ? 'Entrance' : 'Undiscovered Room', 
      formattedCoordinates,
      image: roomImages[room.kind] || IconRegularRoom,
      entry: null,
    };
  }

  const rng = new RNG(room.location, room.hash, room.kind);
  return {
    ...room,
    name: room.location === '0' ? 'Entrance' : rng.randomName(),
    formattedCoordinates,
    image: roomImages[room.kind],
    entry: room.kind !== '1' ? rng.randomEntry() : null,
  };
};

export default roomGenerator;
