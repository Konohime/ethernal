// Re-authorize the backend on a freshly-deployed DungeonAdmin.
//
// After redeploying DungeonAdmin, its `_backend` storage slot is empty,
// so every `onlyBackend` call (monsterDefeated, characterDefeated, etc.)
// reverts. Symptom: players get stuck in combat.
//
// This script nominates + accepts the deployer as backend. Idempotent.
//
// Usage: npx hardhat run scripts/fix-backend-auth.js --network base-sepolia

const { ethers, deployments, getNamedAccounts } = require("hardhat");

async function main() {
  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);

  const dungeonAdminAddr = (await deployments.get("DungeonAdmin")).address;
  console.log("DungeonAdmin:", dungeonAdminAddr);
  console.log("Deployer/backend:", deployer);

  const abi = [
    "function owner() view returns (address)",
    "function pendingBackend() view returns (address)",
    "function getDungeonAndBackendAddress() view returns (address,address)",
    "function nominateBackend(address)",
    "function acceptBackend()",
  ];
  const admin = new ethers.Contract(dungeonAdminAddr, abi, signer);

  const owner = await admin.owner();
  const [, currentBackend] = await admin.getDungeonAndBackendAddress();
  console.log("Owner:", owner);
  console.log("Current backend:", currentBackend);

  if (currentBackend.toLowerCase() === deployer.toLowerCase()) {
    console.log("Backend already set correctly. Nothing to do.");
    return;
  }

  if (owner.toLowerCase() !== deployer.toLowerCase()) {
    throw new Error(
      `Owner (${owner}) is not the deployer (${deployer}). ` +
      `Run nominateBackend from the owner account, then re-run this script ` +
      `from the backend account to call acceptBackend.`
    );
  }

  const pending = await admin.pendingBackend();
  console.log("Pending backend:", pending);

  if (pending.toLowerCase() !== deployer.toLowerCase()) {
    console.log(`Calling nominateBackend(${deployer})...`);
    const tx1 = await admin.nominateBackend(deployer);
    console.log("  tx:", tx1.hash);
    await tx1.wait();
    console.log("  nominated");
  } else {
    console.log("Already nominated, skipping nominateBackend");
  }

  console.log("Calling acceptBackend()...");
  const tx2 = await admin.acceptBackend();
  console.log("  tx:", tx2.hash);
  await tx2.wait();
  console.log("  accepted");

  const [, newBackend] = await admin.getDungeonAndBackendAddress();
  console.log("New backend:", newBackend);
  console.log("Done.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
