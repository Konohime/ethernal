const { ethers } = require("hardhat");

async function main() {
  const dungeonAddress = "0x5303B0280Cab9E74940256592a43B1cCCECf5C66";
  const LOCATION_ZERO = 2n ** 255n;

  const abi = [
    "function getRoomInfo(uint256 location) view returns (uint64 blockNumber, uint64 monsterBlockNumber, uint8 kind, uint8 exits, uint8 areaAtDiscovery, uint8 lastRoomIndex, bool hasMonster, uint256 discoverer, uint8 numActiveCharacters, uint64 eventBlockNumber, uint64 index)"
  ];
  
  const [deployer] = await ethers.getSigners();
  const dungeon = new ethers.Contract(dungeonAddress, abi, deployer);

  const room = await dungeon.getRoomInfo(LOCATION_ZERO);
  console.log("Room LOCATION_ZERO details:");
  console.log("  blockNumber:", room.blockNumber.toString());
  console.log("  monsterBlockNumber:", room.monsterBlockNumber.toString());
  console.log("  kind:", room.kind.toString(), room.kind === 1 ? "(NORMAL)" : room.kind === 2 ? "(TELEPORT)" : room.kind === 3 ? "(TEMPLE)" : room.kind === 4 ? "(LORE)" : room.kind === 5 ? "(CARRIER)" : "(UNKNOWN)");
  console.log("  exits:", room.exits.toString(), "binary:", room.exits.toString(2).padStart(8, '0'));
  console.log("  areaAtDiscovery:", room.areaAtDiscovery.toString());
  console.log("  lastRoomIndex:", room.lastRoomIndex.toString());
  console.log("  hasMonster:", room.hasMonster);
  console.log("  discoverer:", room.discoverer.toString());
  console.log("  numActiveCharacters:", room.numActiveCharacters.toString());
  console.log("  eventBlockNumber:", room.eventBlockNumber.toString());
  console.log("  index:", room.index.toString());

  // Vérifie aussi les coordonnées
  const coordsAbi = ["function coordinates(uint256 location) pure returns (int64 x, int64 y, int64 z, uint64 a)"];
  const pureDungeonAddress = "0x114c0eA66F4B1FB2d2Fc10D521DAA50aed528331";
  const pureDungeon = new ethers.Contract(pureDungeonAddress, coordsAbi, deployer);
  
  try {
    const coords = await pureDungeon.coordinates(LOCATION_ZERO);
    console.log("\nCoordinates of LOCATION_ZERO:");
    console.log("  x:", coords.x.toString());
    console.log("  y:", coords.y.toString());
    console.log("  z:", coords.z.toString());
  } catch (e) {
    console.log("Could not get coordinates:", e.message);
  }
}

main().catch(console.error);