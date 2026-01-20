/**
 * Layer Groups for z-ordering in PIXI 7
 * Uses @pixi/layers package
 */
import PIXI, { Group } from 'lib/pixi-compat';

const corridorGroup = new Group(0, false);
const roomGroup = new Group(1, true);
const roomExitsGroup = new Group(2, false);
const monstersGroup = new Group(3, false);
const charGroup = new Group(4, false);
const myCharGroup = new Group(5, false);
const uiGroup = new Group(6, false);

roomGroup.on('sort', sprite => {
  sprite.zOrder = sprite.y;
});

export default {
  CORRIDORS: corridorGroup,
  ROOMS: roomGroup,
  ROOM_EXITS: roomExitsGroup,
  CHARACTERS: charGroup,
  MY_CHARACTER: myCharGroup,
  UI_GROUP: uiGroup,
  MONSTERS: monstersGroup,
};
