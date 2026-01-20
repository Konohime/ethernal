module.exports = async ({deployments, getNamedAccounts}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  
  await deploy('BlockHashRegister', {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });
};

module.exports.tags = ['BlockHashRegister', 'core'];
