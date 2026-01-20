module.exports = async ({deployments, getNamedAccounts}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  
  const PureDungeon = await deploy('PureDungeon', {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });
  
  await deploy('ReadOnlyDungeon', {
    from: deployer,
    libraries: {
      PureDungeon: PureDungeon.address,
    },
    log: true,
    waitConfirmations: 1,
  });
};

module.exports.tags = ['PureDungeon', 'ReadOnlyDungeon', 'core'];
