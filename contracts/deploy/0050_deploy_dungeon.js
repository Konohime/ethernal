module.exports = async ({deployments, network, getNamedAccounts}) => {
  const {diamond, read, execute, log, getArtifact} = deployments;
  const {deployer, backendAddress} = await getNamedAccounts();

  const playerDeployment = await deployments.get('Player');
  const dungeonAdminDeployment = await deployments.get('DungeonAdmin');
  const blockHashRegisterDeployment = await deployments.get('BlockHashRegister');

  // Deploy Diamond
  const dungeon = await diamond.deploy('Dungeon', {
    from: deployer,
    owner: deployer,
    linkedData: {
      readOnlyDungeon: (await getArtifact('ReadOnlyDungeon')).bytecode,
    },
    facets: [
      'DungeonActionsFacet',
      'DungeonAdminFacet',
      'DungeonCharacterFacet',
      'DungeonInfoFacet',
      'DungeonMovementFacet',
    ],
    log: true,
    waitConfirmations: 1,
  });

  log('Diamond deployed at:', dungeon.address);
  log('Skipping postUpgrade - will be handled in start script');

  // Set backend address
  try {
    const result = await read('DungeonAdmin', 'getDungeonAndBackendAddress');
    if (result.dungeon !== dungeon.address || result.backendAddress !== backendAddress) {
      log('Setting backend address...');
      await execute(
        'DungeonAdmin',
        {from: deployer},
        'setDungeonAndBackend',
        dungeon.address,
        backendAddress
      );
    }
  } catch (e) {
    log('Backend address will be set later');
  }
};

module.exports.tags = ['Dungeon', 'core'];
module.exports.dependencies = ['Player', 'DungeonAdmin', 'BlockHashRegister', 'PureDungeon'];