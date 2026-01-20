const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  const dungeonAddress = "0xC04fEaD57c2990929Ab3ac205474dEaC093820C3";
  const charactersAddr = "0xDae9aea73bBd49695cc14ab651C931282f6B0C87";
  const elementsAddr = "0x13E756b0c8bd24D408441eD20Dc7138dcD2b608C";
  const gearsAddr = "0xEfe0573431e55C521CDb1D48fD761a80a7f93cEa";
  const roomsAddr = "0x41e1FBF31fb9C8C4028F006C9b3FDd1B772b8B73";

  const dungeon = await ethers.getContractAt("DungeonAdminFacet", dungeonAddress);
  
  console.log("Calling start...");
  const tx = await dungeon.start(charactersAddr, elementsAddr, gearsAddr, roomsAddr, { gasLimit: 500000 });
  console.log("Transaction:", tx.hash);
  await tx.wait();
  console.log("Dungeon started successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });