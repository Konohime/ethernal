module.exports = async ({deployments, getNamedAccounts}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  
  await deploy('Characters', {
    from: deployer,
    proxy: {
      proxyContract: 'EIP173Proxy',
      execute: {
        methodName: 'postUpgrade',
        args: [],
      },
    },
    log: true,
    waitConfirmations: 1,
  });
};

module.exports.tags = ['Characters', 'core'];
