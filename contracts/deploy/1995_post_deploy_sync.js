// Runs after every `hardhat deploy` to wire up the freshly-deployed contracts
// and propagate addresses to the backend and webapp.
//
// Five things happen here, all idempotent (safe to re-run):
//
// 1. Update the Diamond's `_adminContract` slot to point at the current
//    DungeonAdmin deployment. Without this, any call routed through the new
//    DungeonAdmin reverts with NOT_AUTHORIZED_ADMIN because the Diamond's
//    `onlyAdmin` modifier still checks the previous admin contract address.
//    `0050_deploy_dungeon.js` deliberately skips postUpgrade ("will be
//    handled in start script") — but if the operator only runs `compile +
//    deploy` and not the full start sequence, the wiring is left dangling.
//
// 2. Update DungeonAdmin's `_dungeon` slot to point at the current Diamond.
//    Symmetric to (1): when the Diamond is redeployed but DungeonAdmin is
//    reused, DungeonAdmin's `_dungeon` either points at the previous Diamond
//    or, on a freshly-deployed DungeonAdmin where setDungeon was never called,
//    is `address(0)`. Either way, every backend-driven call (`monsterDefeated`,
//    `characterDefeated`, `characterEscaped`, `updateCharacter`, `updateQuest`,
//    `updateRoomData`) is silently relayed to the wrong target and reverts —
//    players get stuck mid-combat with no on-chain progress.
//
// 3. Set Characters roles (`_minter = Player`, `_dungeon = Diamond`) via
//    setRoles(). Without this, Characters._minter is address(0) and the
//    very first Player.createAndEnter reverts in mintTo() with NOT_MINTER.
//    The role gate was introduced by the audit-fix commit; only rewire.js
//    used to wire it manually — operators running plain `hardhat deploy`
//    were left with a broken character-creation flow.
//
// 4. Regenerate `webapp/contracts/development.json` from the deployment
//    artifacts via export-contracts.js, then copy that file to both
//    `webapp/contracts/staging.json` and `backend/src/dev_contractsInfo.json`.
//    These two files are what the running webapp and (DEV=1) backend
//    actually read at boot — leaving them stale points everything at the
//    OLD addresses, masking the redeploy entirely.
//
// 5. Print the new addresses so the operator can spot mismatches quickly.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async ({ deployments, ethers, getNamedAccounts, network }) => {
  const { log } = deployments;
  const { deployer } = await getNamedAccounts();

  // --- 1. Repoint Diamond._adminContract ----------------------------------
  try {
    const dungeonDeployment = await deployments.get('Dungeon');
    const dungeonAdminDeployment = await deployments.get('DungeonAdmin');
    const blockHashRegisterDeployment = await deployments.get('BlockHashRegister');
    const playerDeployment = await deployments.get('Player');

    // Slot 4 holds `_adminContract` in the Diamond storage layout.
    const currentAdminRaw = await ethers.provider.getStorage(dungeonDeployment.address, 4);
    const currentAdmin = '0x' + currentAdminRaw.slice(26);

    if (currentAdmin.toLowerCase() === dungeonAdminDeployment.address.toLowerCase()) {
      log('[post-deploy] Diamond._adminContract already up to date');
    } else {
      log(`[post-deploy] Diamond._adminContract is ${currentAdmin}, repointing to ${dungeonAdminDeployment.address}`);
      const signer = await ethers.getSigner(deployer);
      const dungeon = await ethers.getContractAt('DungeonAdminFacet', dungeonDeployment.address, signer);
      const tx = await dungeon.postUpgrade(
        blockHashRegisterDeployment.address,
        playerDeployment.address,
        deployer,
        dungeonAdminDeployment.address,
        { gasLimit: 200000 },
      );
      const receipt = await tx.wait();
      log(`[post-deploy] postUpgrade ${receipt.status === 1 ? 'OK' : 'FAILED'} (tx ${tx.hash})`);
    }
  } catch (e) {
    log('[post-deploy] Diamond admin repoint skipped:', e.message);
  }

  // --- 2. Repoint DungeonAdmin._dungeon -----------------------------------
  try {
    const dungeonDeployment = await deployments.get('Dungeon');
    const dungeonAdminDeployment = await deployments.get('DungeonAdmin');

    const adminAbi = [
      'function owner() view returns (address)',
      'function getDungeonAndBackendAddress() view returns (address,address)',
      'function setDungeon(address)',
    ];
    const signer = await ethers.getSigner(deployer);
    const admin = new ethers.Contract(dungeonAdminDeployment.address, adminAbi, signer);
    const [currentDungeonOnAdmin] = await admin.getDungeonAndBackendAddress();

    if (currentDungeonOnAdmin.toLowerCase() === dungeonDeployment.address.toLowerCase()) {
      log('[post-deploy] DungeonAdmin._dungeon already up to date');
    } else {
      const owner = await admin.owner();
      if (owner.toLowerCase() !== deployer.toLowerCase()) {
        log(`[post-deploy] DungeonAdmin._dungeon stale (${currentDungeonOnAdmin}) but owner ${owner} is not the deployer; manual setDungeon needed`);
      } else {
        log(`[post-deploy] DungeonAdmin._dungeon is ${currentDungeonOnAdmin}, repointing to ${dungeonDeployment.address}`);
        const tx = await admin.setDungeon(dungeonDeployment.address, { gasLimit: 100000 });
        const receipt = await tx.wait();
        log(`[post-deploy] setDungeon ${receipt.status === 1 ? 'OK' : 'FAILED'} (tx ${tx.hash})`);
      }
    }
  } catch (e) {
    log('[post-deploy] DungeonAdmin._dungeon repoint skipped:', e.message);
  }

  // --- 2b. Wire Characters roles (_minter = Player, _dungeon = Diamond) ---
  // setRoles is onlyProxyAdmin and was added in the audit-fix commit. Without
  // it, Characters._minter is address(0) and Player.createAndEnter reverts in
  // mintTo() with NOT_MINTER on the very first character creation. Storage
  // slots: layout = nextId(0), _owners(1), _numPerOwners(2), _subOwner(3),
  // _data(4), _minter(5), _dungeon(6).
  try {
    const charactersDeployment = await deployments.get('Characters');
    const playerDeployment = await deployments.get('Player');
    const dungeonDeployment = await deployments.get('Dungeon');

    const minterRaw = await ethers.provider.getStorage(charactersDeployment.address, 5);
    const dungeonOnCharsRaw = await ethers.provider.getStorage(charactersDeployment.address, 6);
    const currentMinter = '0x' + minterRaw.slice(26);
    const currentDungeonOnChars = '0x' + dungeonOnCharsRaw.slice(26);

    const minterOk = currentMinter.toLowerCase() === playerDeployment.address.toLowerCase();
    const dungeonOk = currentDungeonOnChars.toLowerCase() === dungeonDeployment.address.toLowerCase();

    if (minterOk && dungeonOk) {
      log('[post-deploy] Characters roles already up to date');
    } else {
      log(
        `[post-deploy] Characters roles stale (minter=${currentMinter}, dungeon=${currentDungeonOnChars}), ` +
          `setting to (minter=${playerDeployment.address}, dungeon=${dungeonDeployment.address})`,
      );
      const signer = await ethers.getSigner(deployer);
      const characters = await ethers.getContractAt(
        ['function setRoles(address minter, address dungeon) external'],
        charactersDeployment.address,
        signer,
      );
      const tx = await characters.setRoles(playerDeployment.address, dungeonDeployment.address, {
        gasLimit: 100000,
      });
      const receipt = await tx.wait();
      log(`[post-deploy] Characters.setRoles ${receipt.status === 1 ? 'OK' : 'FAILED'} (tx ${tx.hash})`);
    }
  } catch (e) {
    log('[post-deploy] Characters.setRoles skipped:', e.message);
  }

  // --- 3. Regenerate contracts-info files for backend and webapp ----------
  try {
    const repoRoot = path.resolve(__dirname, '../..');
    const exportScript = path.resolve(__dirname, '../scripts/export-contracts.js');
    execSync(`node "${exportScript}"`, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });

    const generated = path.join(repoRoot, 'webapp/contracts/development.json');
    const staging = path.join(repoRoot, 'webapp/contracts/staging.json');
    const backendDev = path.join(repoRoot, 'backend/src/dev_contractsInfo.json');

    if (fs.existsSync(generated)) {
      fs.copyFileSync(generated, staging);
      fs.copyFileSync(generated, backendDev);
      log('[post-deploy] Synced addresses to:');
      log('              -', path.relative(repoRoot, staging));
      log('              -', path.relative(repoRoot, backendDev));
    } else {
      log('[post-deploy] Warning: development.json not generated — staging/dev not updated');
    }
  } catch (e) {
    log('[post-deploy] contractsInfo sync failed:', e.message);
  }

  log('');
  log('[post-deploy] Done. REMEMBER to restart the backend so it picks up the new addresses.');
};

module.exports.tags = ['PostDeploySync'];
module.exports.runAtTheEnd = true;
