/* eslint-disable no-console */
// Read-only diagnostic: verifies the wiring used by DungeonAdmin.monsterDefeated().
// No transactions are sent. Run with:
//   npx hardhat run scripts/diagnose-admin.js --network base-sepolia

const { ethers, deployments, getNamedAccounts } = require('hardhat');

async function main() {
  const { deployer } = await getNamedAccounts();
  const adminDep = await deployments.get('DungeonAdmin');
  const diamondDep = await deployments.get('Dungeon_DiamondProxy');

  console.log('=== Addresses ===');
  console.log('DungeonAdmin:       ', adminDep.address);
  console.log('Dungeon_DiamondProxy:', diamondDep.address);
  console.log('Deployer / backend: ', deployer);

  const [signer] = await ethers.getSigners();
  console.log('Script signer:      ', signer.address);

  const adminAbi = [
    'function getDungeonAndBackendAddress() view returns (address dungeon, address backendAddress)',
  ];
  const admin = new ethers.Contract(adminDep.address, adminAbi, signer);

  let wiredDungeon;
  let wiredBackend;
  try {
    const res = await admin.getDungeonAndBackendAddress();
    wiredDungeon = res.dungeon ?? res[0];
    wiredBackend = res.backendAddress ?? res[1];
  } catch (e) {
    console.error('FAILED to call getDungeonAndBackendAddress:', e.message || e);
    return;
  }

  console.log('\n=== DungeonAdmin wiring ===');
  console.log('_dungeon:         ', wiredDungeon);
  console.log('_backendAddress:  ', wiredBackend);

  const dungeonOK = wiredDungeon.toLowerCase() === diamondDep.address.toLowerCase();
  const backendOK = wiredBackend.toLowerCase() === deployer.toLowerCase();
  console.log('  _dungeon == Dungeon_DiamondProxy ?', dungeonOK);
  console.log('  _backendAddress == deployer      ?', backendOK);

  if (wiredDungeon === ethers.ZeroAddress) {
    console.log('  >> FATAL: _dungeon is zero — setDungeonAndBackend was never called on this deployment');
  }

  // Also sanity-check _adminContract on the diamond (the value onlyAdmin checks).
  // _adminContract is a storage var (DungeonDataLayout slot 56). There is no public getter,
  // but any onlyAdmin call from a non-admin address will revert with "NOT_AUTHORIZED_ADMIN".
  // We probe by simulating a call *from the DungeonAdmin contract* using eth_call override — if it
  // succeeds (revert reason != NOT_AUTHORIZED_ADMIN) we know wiring is at least consistent.
  console.log('\n=== Diamond admin probe ===');
  const diamondAbi = [
    'function monsterDefeated(uint256 location) external',
  ];
  const diamond = new ethers.Contract(diamondDep.address, diamondAbi, signer);
  try {
    // Use a known valid location (0 = entry). This will revert, but the REASON tells us why.
    await diamond.monsterDefeated.staticCall(0, { from: adminDep.address });
    console.log('  staticCall succeeded from DungeonAdmin — admin wiring OK');
  } catch (e) {
    const reason = e.reason || (e.error && e.error.message) || e.message || String(e);
    if (reason.includes('NOT_AUTHORIZED_ADMIN')) {
      console.log('  >> FATAL: diamond._adminContract is NOT DungeonAdmin. Got NOT_AUTHORIZED_ADMIN when calling from', adminDep.address);
    } else {
      console.log('  reverted (expected, with reason):', reason);
      console.log('  (if the reason is not NOT_AUTHORIZED_ADMIN, admin wiring is OK)');
    }
  }

  // Also probe from the signer (NOT the admin) to confirm it blocks us
  console.log('\n=== Sanity: calling directly (should fail with NOT_AUTHORIZED_ADMIN) ===');
  try {
    await diamond.monsterDefeated.staticCall(0);
    console.log('  >> UNEXPECTED: direct call succeeded');
  } catch (e) {
    const reason = e.reason || (e.error && e.error.message) || e.message || String(e);
    console.log('  reverted with:', reason);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
