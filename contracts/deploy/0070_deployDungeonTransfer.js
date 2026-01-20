module.exports = async ({network, getNamedAccounts, deployments, ethers}) => {
  const {deploy, log} = deployments;
  const {deployer, dungeonOwner} = await getNamedAccounts();

  const dungeon = await deployments.get('Dungeon');
  const player = await deployments.get('Player');
  const gears = await deployments.get('Gears');
  const elements = await deployments.get('Elements');
  const characters = await deployments.get('Characters');

  log('Deploying DungeonTokenTransferer...');
  const dungeonTokenTransferer = await deploy('DungeonTokenTransferer', {
    from: network.live ? deployer : dungeonOwner,
    args: [],
    proxy: {
      proxyContract: 'EIP173Proxy',
      execute: {
        methodName: 'postUpgrade',
        args: [dungeon.address, player.address, gears.address, elements.address, characters.address],
      },
    },
    log: true,
    waitConfirmations: 1,
  });

  log('DungeonTokenTransferer deployed at:', dungeonTokenTransferer.address);
  log('NOTE: Token approvals need to be done manually by backendAddress');
};

module.exports.tags = ['DungeonTokenTransferer', 'core'];
module.exports.dependencies = ['Dungeon', 'Player', 'Tokens', 'Characters'];