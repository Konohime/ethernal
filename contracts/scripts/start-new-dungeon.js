const { ethers, deployments } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  // Récupérer les adresses depuis les déploiements
  const dungeonDeployment = await deployments.get("Dungeon");
  const blockHashRegisterDeployment = await deployments.get("BlockHashRegister");
  const playerDeployment = await deployments.get("Player");
  const dungeonAdminDeployment = await deployments.get("DungeonAdmin");
  const charactersDeployment = await deployments.get("Characters");
  const elementsDeployment = await deployments.get("Elements");
  const gearsDeployment = await deployments.get("Gears");
  const roomsDeployment = await deployments.get("Rooms");

  console.log("Dungeon:", dungeonDeployment.address);
  console.log("BlockHashRegister:", blockHashRegisterDeployment.address);
  console.log("Player:", playerDeployment.address);
  console.log("DungeonAdmin:", dungeonAdminDeployment.address);
  console.log("Characters:", charactersDeployment.address);
  console.log("Elements:", elementsDeployment.address);
  console.log("Gears:", gearsDeployment.address);
  console.log("Rooms:", roomsDeployment.address);

  // ABI pour les fonctions nécessaires
  const dungeonAbi = [
    "function postUpgrade(address _blockHashRegister, address _player, address _creator, address _dungeonAdmin) external",
    "function start(address _characters, address _elements, address _gears, address _rooms) external",
    "function actualiseRoom(uint256 location) external"
  ];

  const dungeon = new ethers.Contract(dungeonDeployment.address, dungeonAbi, deployer);

  // 1. postUpgrade
  console.log("\n1. Calling postUpgrade...");
  try {
    const tx1 = await dungeon.postUpgrade(
      blockHashRegisterDeployment.address,
      playerDeployment.address,
      deployer.address,
      dungeonAdminDeployment.address,
      { gasLimit: 500000 }
    );
    console.log("   TX:", tx1.hash);
    await tx1.wait();
    console.log("   postUpgrade SUCCESS!");
  } catch (e) {
    console.log("   postUpgrade failed:", e.reason || e.message);
  }

  // 2. start
  console.log("\n2. Calling start...");
  try {
    const tx2 = await dungeon.start(
      charactersDeployment.address,
      elementsDeployment.address,
      gearsDeployment.address,
      roomsDeployment.address,
      { gasLimit: 500000 }
    );
    console.log("   TX:", tx2.hash);
    await tx2.wait();
    console.log("   start SUCCESS!");
  } catch (e) {
    console.log("   start failed:", e.reason || e.message);
  }

  // 3. actualiseRoom pour la room 0,0 (LOCATION_ZERO = 2^255)
  console.log("\n3. Calling actualiseRoom for 0,0...");
  const LOCATION_ZERO = BigInt(2) ** BigInt(255);
  try {
    const tx3 = await dungeon.actualiseRoom(LOCATION_ZERO, { gasLimit: 500000 });
    console.log("   TX:", tx3.hash);
    await tx3.wait();
    console.log("   actualiseRoom SUCCESS!");
  } catch (e) {
    console.log("   actualiseRoom failed:", e.reason || e.message);
  }

  console.log("\nDone!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });