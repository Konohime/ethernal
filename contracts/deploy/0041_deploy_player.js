// Default config values (fallback if webapp config not available)
const DEFAULT_MIN_BALANCE = "1000000000000000"; // 0.001 ETH

module.exports = async ({deployments, network, getNamedAccounts}) => {
  const {deploy} = deployments;
  const {deployer, dungeonOwner} = await getNamedAccounts();

  const charactersDeployment = await deployments.get('Characters');
  const ubfDeployment = await deployments.get('UBF');

  // Try to load webapp config, fallback to defaults
  let minBalance = DEFAULT_MIN_BALANCE;
  try {
    const webappConfig = require('../../webapp/src/data/config');
    const chainId = await getChainId();
    const config = webappConfig(chainId);
    minBalance = config.minBalance;
  } catch (e) {
    console.log('Using default minBalance:', minBalance);
  }

  await deploy('Player', {
    from: network.live ? deployer : dungeonOwner,
    args: [], // Player n'a pas de constructeur avec arguments
    proxy: {
      proxyContract: 'EIP173Proxy',
      execute: {
        methodName: 'postUpgrade',
        args: [
          charactersDeployment.address,
          dungeonOwner,
          minBalance,
          ubfDeployment.address,
        ],
      },
    },
    log: true,
    waitConfirmations: 1,
  });
};

module.exports.tags = ['Player', 'core'];
module.exports.dependencies = ['Characters', 'UBF'];
