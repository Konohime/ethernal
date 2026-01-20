module.exports = async ({deployments, network, getNamedAccounts}) => {
  const {deploy} = deployments;
  const {deployer, dungeonOwner} = await getNamedAccounts();

  const dungeonDeployment = await deployments.get('Dungeon');

  async function deployTokenContract(name) {
    return await deploy(name, {
      from: network.live ? deployer : dungeonOwner,
      args: [], // Pas d'arguments au constructeur
      proxy: {
        proxyContract: 'EIP173Proxy',
        execute: {
          methodName: 'postUpgrade',
          args: [dungeonDeployment.address],
        },
      },
      log: true,
      waitConfirmations: 1,
    });
  }

  await deployTokenContract('Elements');
  await deployTokenContract('Gears');
  await deployTokenContract('Rooms');
};

module.exports.tags = ['Tokens', 'Elements', 'Gears', 'Rooms', 'core'];
module.exports.dependencies = ['Dungeon'];