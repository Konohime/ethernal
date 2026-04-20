// Manually start the dungeon + actualise room 0.
// Bypasses hardhat-deploy's execute caching and stale pending tx issues.
// Idempotent: checks on-chain state first.
//
// Usage: npx hardhat run scripts/start-dungeon.js --network base-sepolia

const {ethers, deployments, getNamedAccounts} = require("hardhat");

const LOCATION_ZERO = "0x8000000000000000000000000000000000000000000000000000000000000000";

async function main() {
  const {deployer} = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);

  const dungeonAddr = (await deployments.get("Dungeon")).address;
  const characters = (await deployments.get("Characters")).address;
  const elements = (await deployments.get("Elements")).address;
  const gears = (await deployments.get("Gears")).address;
  const rooms = (await deployments.get("Rooms")).address;

  console.log("Dungeon:", dungeonAddr);
  console.log("Deployer:", deployer);

  const abi = [
    "function start(address,address,address,address) external",
    "function actualiseRoom(uint256) external",
    "function getRoomInfo(uint256) view returns (uint64 blockNumber, uint64 monsterBlockNumber, uint8 direction, uint8 areaAtDiscovery, uint64 index, uint64 lastRoomIndex, uint256 discoverer, uint256 monsterData, uint8 kind, uint8 exits, uint8 special)",
  ];
  const d = new ethers.Contract(dungeonAddr, abi, signer);

  const info = await d.getRoomInfo(LOCATION_ZERO);
  const roomBlockNumber = info.blockNumber ?? info[0];
  const roomKind = info.kind ?? info[8];
  console.log("Room0 blockNumber:", roomBlockNumber.toString(), "kind:", roomKind.toString());

  // Force fresh nonce from chain (ignores local pending), + fee bump
  const nonce = await ethers.provider.getTransactionCount(deployer, "latest");
  const feeData = await ethers.provider.getFeeData();
  const mk = (n) => ({
    nonce: n,
    gasLimit: 2_000_000,
    maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 2n : undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * 2n : undefined,
  });

  let n = nonce;
  console.log("Starting nonce:", n);

  if (roomBlockNumber.toString() === "0") {
    console.log("Calling start(...)");
    const tx = await d.start(characters, elements, gears, rooms, mk(n++));
    console.log("tx:", tx.hash);
    await tx.wait();
    console.log("start() mined");
  } else {
    console.log("start() already done");
  }

  // Wait ~3 blocks so the target block hash is committed and readable
  console.log("Waiting ~3 blocks...");
  const current = await ethers.provider.getBlockNumber();
  while ((await ethers.provider.getBlockNumber()) < current + 3) {
    await new Promise((r) => setTimeout(r, 2000));
  }

  const info2 = await d.getRoomInfo(LOCATION_ZERO);
  const kind2 = info2.kind ?? info2[8];
  if (kind2.toString() === "0") {
    console.log("Calling actualiseRoom(LOCATION_ZERO)");
    const tx2 = await d.actualiseRoom(LOCATION_ZERO, mk(n++));
    console.log("tx:", tx2.hash);
    await tx2.wait();
    console.log("actualiseRoom mined");
  } else {
    console.log("Room already actualised (kind =", kind2.toString(), ")");
  }

  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
