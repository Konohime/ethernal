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

  // Definitive check: read _adminContract directly from diamond storage.
  // _adminContract is the value onlyAdmin compares msg.sender against. In the
  // DungeonDataLayout it sits at slot 4 (mappings _characters/_rooms/_areas
  // occupy slots 0-2, the packed AreaCounter struct slot 3, then _adminContract
  // at slot 4). There is no public getter, so a raw storage read is the only
  // reliable, side-effect-free way to confirm wiring.
  console.log('\n=== Diamond admin wiring (storage slot 4) ===');
  const adminRaw = await ethers.provider.getStorage(diamondDep.address, 4);
  const wiredAdmin = '0x' + adminRaw.slice(26);
  console.log('  _adminContract:', wiredAdmin);
  const adminWiringOK = wiredAdmin.toLowerCase() === adminDep.address.toLowerCase();
  console.log('  _adminContract == DungeonAdmin ?', adminWiringOK);
  if (!adminWiringOK) {
    console.log('  >> FATAL: diamond._adminContract is', wiredAdmin, 'but DungeonAdmin is', adminDep.address);
    console.log('  >> Backend-driven calls (monsterDefeated/characterDefeated/...) will revert with NOT_AUTHORIZED_ADMIN.');
    console.log('  >> Fix: run the post-deploy sync (deploy/1995_post_deploy_sync.js) or call postUpgrade to repoint it.');
  }

  // Behavioural confirmation via a raw eth_call with an arbitrary `from`
  // override (provider.call accepts `from`; a signer-connected contract does
  // not in ethers v6 — it throws "transaction from mismatch"). A call FROM the
  // DungeonAdmin address must NOT revert with NOT_AUTHORIZED_ADMIN.
  console.log('\n=== Behavioural probe (eth_call from DungeonAdmin) ===');
  const iface = new ethers.Interface(['function monsterDefeated(uint256 location) external']);
  const data = iface.encodeFunctionData('monsterDefeated', [0]);
  try {
    await ethers.provider.call({ to: diamondDep.address, data, from: adminDep.address });
    console.log('  call succeeded from DungeonAdmin — admin wiring OK');
  } catch (e) {
    const reason = e.reason || (e.error && e.error.message) || e.shortMessage || e.message || String(e);
    if (String(reason).includes('NOT_AUTHORIZED_ADMIN')) {
      console.log('  >> FATAL: got NOT_AUTHORIZED_ADMIN calling from', adminDep.address, '— admin wiring is broken');
    } else {
      console.log('  reverted (expected, with reason):', reason);
      console.log('  (if the reason is not NOT_AUTHORIZED_ADMIN, admin wiring is OK)');
    }
  }

  // Sanity: a call from a NON-admin address must be blocked.
  console.log('\n=== Sanity: eth_call from non-admin (should fail with NOT_AUTHORIZED_ADMIN) ===');
  try {
    await ethers.provider.call({ to: diamondDep.address, data, from: signer.address });
    console.log('  >> UNEXPECTED: direct call succeeded');
  } catch (e) {
    const reason = e.reason || (e.error && e.error.message) || e.shortMessage || e.message || String(e);
    console.log('  reverted with:', reason);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
