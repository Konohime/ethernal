// Nominate a new backend wallet on DungeonAdmin.
//
// Run once from your local machine, signed by the contract OWNER
// (the deployer). After this transaction, restart the backend on
// Railway — it will detect that it is the pending backend and call
// acceptBackend() automatically.
//
// Usage:
//   NEW_BACKEND=0xYourNewBackendAddress \
//     npx hardhat run scripts/nominate-backend.js --network base-sepolia

const { ethers, deployments, getNamedAccounts } = require("hardhat");

async function main() {
  const newBackend = process.env.NEW_BACKEND;
  if (!newBackend || !ethers.isAddress(newBackend)) {
    throw new Error("Set NEW_BACKEND=0x... to the new backend address before running this script.");
  }

  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);

  const dungeonAdminAddr = (await deployments.get("DungeonAdmin")).address;
  console.log("DungeonAdmin:", dungeonAdminAddr);
  console.log("Signer (must be owner):", deployer);
  console.log("New backend to nominate:", newBackend);

  const abi = [
    "function owner() view returns (address)",
    "function pendingBackend() view returns (address)",
    "function getDungeonAndBackendAddress() view returns (address,address)",
    "function nominateBackend(address)",
  ];
  const admin = new ethers.Contract(dungeonAdminAddr, abi, signer);

  const owner = await admin.owner();
  if (owner.toLowerCase() !== deployer.toLowerCase()) {
    throw new Error(`Owner (${owner}) is not the deployer signer (${deployer}). Use the owner key.`);
  }

  const [, currentBackend] = await admin.getDungeonAndBackendAddress();
  console.log("Current backend:", currentBackend);
  if (currentBackend.toLowerCase() === newBackend.toLowerCase()) {
    console.log("Already the active backend. Nothing to do.");
    return;
  }

  const pending = await admin.pendingBackend();
  if (pending.toLowerCase() === newBackend.toLowerCase()) {
    console.log("Already nominated. Restart the backend on Railway so it calls acceptBackend().");
    return;
  }

  console.log(`Calling nominateBackend(${newBackend})...`);
  const tx = await admin.nominateBackend(newBackend);
  console.log("  tx:", tx.hash);
  await tx.wait();
  console.log("  nominated.");
  console.log("Next step: restart the backend on Railway. It will accept itself on startup.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
