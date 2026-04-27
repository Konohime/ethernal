// Wire DungeonAdmin._dungeon to the current Diamond.
// Without this, every onlyBackend call (monsterDefeated, characterDefeated,
// characterEscaped, updateCharacter, updateRoomData, updateQuest, ...) is
// relayed to address(0) and reverts -- players get stuck in combat.
//
// Idempotent: no-op if already correctly wired.
//
// Usage: npx hardhat run scripts/fix-admin-dungeon.js --network base-sepolia

const { ethers, deployments, getNamedAccounts } = require("hardhat");

async function main() {
  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);

  const dungeonAddr = (await deployments.get("Dungeon")).address;
  const adminAddr = (await deployments.get("DungeonAdmin")).address;

  const abi = [
    "function owner() view returns (address)",
    "function getDungeonAndBackendAddress() view returns (address,address)",
    "function setDungeon(address)",
  ];
  const admin = new ethers.Contract(adminAddr, abi, signer);

  const owner = await admin.owner();
  const [currentDungeon] = await admin.getDungeonAndBackendAddress();

  console.log("DungeonAdmin:     ", adminAddr);
  console.log("Owner:            ", owner);
  console.log("Deployer:         ", deployer);
  console.log("Target Dungeon:   ", dungeonAddr);
  console.log("Current _dungeon: ", currentDungeon);

  if (currentDungeon.toLowerCase() === dungeonAddr.toLowerCase()) {
    console.log("Already wired correctly. Nothing to do.");
    return;
  }

  if (owner.toLowerCase() !== deployer.toLowerCase()) {
    throw new Error(`Owner (${owner}) != deployer (${deployer}); cannot call setDungeon.`);
  }

  console.log("Calling setDungeon(...)");
  const tx = await admin.setDungeon(dungeonAddr);
  console.log("  tx:", tx.hash);
  await tx.wait();
  console.log("  mined");

  const [newDungeon] = await admin.getDungeonAndBackendAddress();
  console.log("New _dungeon:     ", newDungeon);
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
