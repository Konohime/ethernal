const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  const dungeonAddress = "0x5303B0280Cab9E74940256592a43B1cCCECf5C66";
  const blockHashRegisterAddress = "0x2e3d7e34dDB162432d8f04558DC50EE3bFDbF1ab";
  const LOCATION_ZERO = 2n ** 255n;

  const dungeonAbi = [
    "function actualiseRoom(uint256 location)",
    "function getRoomInfo(uint256 location) view returns (uint64, uint64, uint8, uint8, uint8, uint8, bool, uint256, uint8, uint64, uint64)"
  ];
  const dungeon = new ethers.Contract(dungeonAddress, dungeonAbi, deployer);

  const blockHashAbi = [
    "function request()",
    "function save()",
    "function get(uint256 blockNumber) view returns (bytes32)"
  ];
  const blockHashRegister = new ethers.Contract(blockHashRegisterAddress, blockHashAbi, deployer);

  // Vérifie l'état actuel
  console.log("Current room state:");
  let roomInfo = await dungeon.getRoomInfo(LOCATION_ZERO);
  console.log("  blockNumber:", roomInfo[0].toString());
  console.log("  kind:", roomInfo[2].toString());
  console.log("  exits:", roomInfo[3].toString());

  const roomBlockNumber = roomInfo[0];
  
  // Vérifie si le blockHash est enregistré
  let blockHash = await blockHashRegister.get(roomBlockNumber);
  console.log("  blockHash for room block:", blockHash);

  if (blockHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.log("\nBlockHash not registered. Registering now...");
    
    // Request
    console.log("1. Calling request()...");
    let tx = await blockHashRegister.request({ gasLimit: 100000 });
    await tx.wait();
    console.log("   Done");

    // Wait for next block
    console.log("2. Waiting 5 seconds for next block...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Save
    console.log("3. Calling save()...");
    tx = await blockHashRegister.save({ gasLimit: 100000 });
    await tx.wait();
    console.log("   Done");

    // Check again
    blockHash = await blockHashRegister.get(roomBlockNumber);
    console.log("   blockHash now:", blockHash);
  }

  // Actualise room
  console.log("\n4. Calling actualiseRoom...");
  const tx = await dungeon.actualiseRoom(LOCATION_ZERO, { gasLimit: 500000 });
  console.log("   Transaction:", tx.hash);
  await tx.wait();
  console.log("   Done");

  // Final check
  console.log("\n5. Final room state:");
  roomInfo = await dungeon.getRoomInfo(LOCATION_ZERO);
  console.log("  blockNumber:", roomInfo[0].toString());
  console.log("  kind:", roomInfo[2].toString());
  console.log("  exits:", roomInfo[3].toString());

  if (roomInfo[3] > 0) {
    console.log("\n✅ Room has exits! Dungeon is ready!");
  } else {
    console.log("\n⚠️  Exits still 0. The room may already be actualized with kind != 0");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });