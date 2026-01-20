module.exports = async ({deployments, network, getNamedAccounts}) => {
  const {read, execute, log} = deployments;
  const {deployer} = await getNamedAccounts();

  // Location zero constant
  const LOCATION_ZERO = '0x8000000000000000000000000000000000000000000000000000000000000000';

  // First, ensure postUpgrade was called
  const playerDeployment = await deployments.get('Player');
  const dungeonAdminDeployment = await deployments.get('DungeonAdmin');
  const blockHashRegisterDeployment = await deployments.get('BlockHashRegister');

  // Try to call postUpgrade (will fail silently if already called)
  try {
    log('Ensuring postUpgrade is called...');
    await execute(
      'Dungeon',
      {from: deployer},
      'postUpgrade',
      blockHashRegisterDeployment.address,
      playerDeployment.address,
      deployer,
      dungeonAdminDeployment.address
    );
    log('postUpgrade called successfully');
  } catch (e) {
    log('postUpgrade already called or failed:', e.message);
  }

  // Now check if dungeon is started
  let started = false;
  try {
    const room0Data = await read('Dungeon', 'getRoomInfo', LOCATION_ZERO);
    started = room0Data.blockNumber > 0n;
  } catch (e) {
    log('Could not read room info:', e.message);
  }
  
  if (!started) {
    log('Starting dungeon...');
    
    const characters = await deployments.get('Characters');
    const elements = await deployments.get('Elements');
    const gears = await deployments.get('Gears');
    const rooms = await deployments.get('Rooms');

    try {
      await execute(
        'Dungeon',
        {from: deployer},
        'start',
        characters.address,
        elements.address,
        gears.address,
        rooms.address
      );

      log('Actualising first room...');
      await execute(
        'Dungeon',
        {from: deployer},
        'actualiseRoom',
        LOCATION_ZERO
      );

      log('Dungeon started successfully!');
    } catch (e) {
      log('Could not start dungeon:', e.message);
      log('This may need to be done manually by the owner');
    }
  } else {
    log('Dungeon already started');
  }
};

module.exports.tags = ['StartDungeon', 'core'];
module.exports.dependencies = ['Dungeon', 'Tokens', 'DungeonTokenTransferer'];