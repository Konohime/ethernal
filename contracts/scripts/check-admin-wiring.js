// Verify DungeonAdmin._dungeon matches the currently-deployed Dungeon Diamond.
// If they differ, the post-deploy left DungeonAdmin pointing at a stale Diamond
// and combat resolution will silently revert.
//
// Usage: npx hardhat run scripts/check-admin-wiring.js --network base-sepolia

const { ethers, deployments } = require("hardhat");

async function main() {
  const dungeonAddr = (await deployments.get("Dungeon")).address;
  const adminAddr = (await deployments.get("DungeonAdmin")).address;

  const abi = [
    "function getDungeonAndBackendAddress() view returns (address,address)",
  ];
  const admin = new ethers.Contract(adminAddr, abi, ethers.provider);
  const [dungeonOnAdmin, backend] = await admin.getDungeonAndBackendAddress();

  console.log("Deployments:");
  console.log("  Dungeon (Diamond):", dungeonAddr);
  console.log("  DungeonAdmin:     ", adminAddr);
  console.log("DungeonAdmin storage:");
  console.log("  _dungeon:         ", dungeonOnAdmin);
  console.log("  _backend:         ", backend);

  if (dungeonOnAdmin.toLowerCase() === dungeonAddr.toLowerCase()) {
    console.log("\nOK: DungeonAdmin points at the current Diamond.");
  } else {
    console.log("\nMISMATCH: DungeonAdmin points at a stale Diamond.");
    console.log("Fix: call DungeonAdmin.setDungeon(", dungeonAddr, ") from owner.");
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
