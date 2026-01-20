const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  const dungeonAddress = "0xC04fEaD57c2990929Ab3ac205474dEaC093820C3";
  const blockHashRegisterAddress = "0x3E4B9A01BD2429f66ecBf271f6B312812a6d4603";
  
  // LOCATION_ZERO = 2^255
  const LOCATION_ZERO = 2n ** 255n;
  
  // Connecte au BlockHashRegister
  const BlockHashRegister = await ethers.getContractAt("BlockHashRegister", blockHashRegisterAddress);
  
  // Enregistre le hash du bloc actuel pour pouvoir actualiser
  console.log("Requesting block hash registration...");
  const tx1 = await BlockHashRegister.request({ gasLimit: 100000 });
  await tx1.wait();
  console.log("Block hash requested");
  
  // Attend quelques blocs
  console.log("Waiting for next block...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Sauvegarde le hash
  const tx2 = await BlockHashRegister.save({ gasLimit: 100000 });
  await tx2.wait();
  console.log("Block hash saved");

  // Maintenant connecte au Dungeon et actualise la room
  const dungeon = await ethers.getContractAt("DungeonMovementFacet", dungeonAddress);
  
  console.log("Actualising room at LOCATION_ZERO...");
  const tx3 = await dungeon.actualiseRoom(LOCATION_ZERO, { gasLimit: 500000 });
  await tx3.wait();
  console.log("Room actualized!");

  // Vérifie le résultat
  const dungeonInfo = await ethers.getContractAt("DungeonInfoFacet", dungeonAddress);
  const roomInfo = await dungeonInfo.getRoomInfo(LOCATION_ZERO);
  console.log("Room info after actualisation:");
  console.log("  blockNumber:", roomInfo[0].toString());
  console.log("  monsterBlockNumber:", roomInfo[1].toString());
  console.log("  kind:", roomInfo[2].toString());
  console.log("  exits:", roomInfo[3].toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });