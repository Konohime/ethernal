/**
 * Fix: update _adminContract in the Diamond to point to the current DungeonAdmin deployment.
 * Run with: npx hardhat run scripts/fix-admin-contract.js --network base-sepolia
 */
const hre = require('hardhat');

async function main() {
  const { deployments, ethers } = hre;

  const dungeonDeployment = await deployments.get('Dungeon');
  const dungeonAdminDeployment = await deployments.get('DungeonAdmin');
  const blockHashRegisterDeployment = await deployments.get('BlockHashRegister');
  const playerDeployment = await deployments.get('Player');

  console.log('Diamond (Dungeon):', dungeonDeployment.address);
  console.log('Current DungeonAdmin:', dungeonAdminDeployment.address);
  console.log('BlockHashRegister:', blockHashRegisterDeployment.address);
  console.log('Player:', playerDeployment.address);

  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const dungeon = await ethers.getContractAt('DungeonAdminFacet', dungeonDeployment.address, deployer);

  // Read current _adminContract from slot 4
  const currentAdmin = await ethers.provider.getStorage(dungeonDeployment.address, 4);
  console.log('Current _adminContract in Diamond (slot 4):', '0x' + currentAdmin.slice(26));

  if (('0x' + currentAdmin.slice(26)).toLowerCase() === dungeonAdminDeployment.address.toLowerCase()) {
    console.log('_adminContract is already up to date, nothing to do.');
    return;
  }

  console.log('Calling postUpgrade to update _adminContract...');
  const tx = await dungeon.postUpgrade(
    blockHashRegisterDeployment.address,
    playerDeployment.address,
    deployer.address,
    dungeonAdminDeployment.address,
    { gasLimit: 200000 }
  );
  console.log('TX hash:', tx.hash);
  const receipt = await tx.wait();
  console.log('TX status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');

  // Verify
  const newAdmin = await ethers.provider.getStorage(dungeonDeployment.address, 4);
  console.log('New _adminContract in Diamond (slot 4):', '0x' + newAdmin.slice(26));
}

main().catch(e => { console.error(e); process.exit(1); });
