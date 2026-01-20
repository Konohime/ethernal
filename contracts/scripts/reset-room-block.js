const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  const dungeonAddress = "0xC04fEaD57c2990929Ab3ac205474dEaC093820C3";
  const blockHashRegisterAddress = "0x3E4B9A01BD2429f66ecBf271f6B312812a6d4603";
  
  const LOCATION_ZERO = 2n ** 255n;
  
  const BlockHashRegister = await ethers.getContractAt("BlockHashRegister", blockHashRegisterAddress);
  const dungeonMovement = await ethers.getContractAt("DungeonMovementFacet", dungeonAddress);
  const dungeonInfo = await ethers.getContractAt("DungeonInfoFacet", dungeonAddress);
  
  let roomInfo = await dungeonInfo.getRoomInfo(LOCATION_ZERO);
  console.log("Current room state:");
  console.log("  blockNumber:", roomInfo[0].toString());
  console.log("  kind:", roomInfo[2].toString());
  console.log("  exits:", roomInfo[3].toString());
  
  const roomBlockNumber = roomInfo[0];
  const savedHash = await BlockHashRegister.get(roomBlockNumber);
  console.log("  savedHash for block", roomBlockNumber.toString(), ":", savedHash);
  
  const computedHash = await BlockHashRegister.getOrCompute(roomBlockNumber);
  console.log("  computedHash:", computedHash);
  
  console.log("\nTrying to actualise room...");
  const tx = await dungeonMovement.actualiseRoom(LOCATION_ZERO, { gasLimit: 500000 });
  await tx.wait();
  
  roomInfo = await dungeonInfo.getRoomInfo(LOCATION_ZERO);
  console.log("\nRoom state after actualise:");
  console.log("  blockNumber:", roomInfo[0].toString());
  console.log("  kind:", roomInfo[2].toString());
  console.log("  exits:", roomInfo[3].toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });