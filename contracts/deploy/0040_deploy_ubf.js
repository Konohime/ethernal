module.exports = async ({deployments, network, getNamedAccounts}) => {
  const {deploy} = deployments;
  const {deployer, dungeonOwner} = await getNamedAccounts();

  const charactersDeployment = await deployments.get('Characters');

  await deploy('UBF', {
    from: network.live ? deployer : dungeonOwner,
    args: [], // UBF n'a pas de constructeur avec arguments
    proxy: {
      proxyContract: 'EIP173Proxy',
      execute: {
        methodName: 'postUpgrade',
        args: [charactersDeployment.address], // postUpgrade prend Characters en argument
      },
    },
    log: true,
    waitConfirmations: 1,
  });
};

module.exports.tags = ['UBF', 'core'];
module.exports.dependencies = ['Characters'];
