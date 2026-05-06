// Default config values (fallback if webapp config not available)
const DEFAULT_MIN_BALANCE = "100000000000000"; // 0.0001 ETH

module.exports = async ({deployments, network, getChainId, getNamedAccounts}) => {
  const {deploy} = deployments;
  const {deployer, dungeonOwner} = await getNamedAccounts();

  const charactersDeployment = await deployments.get('Characters');
  const ubfDeployment = await deployments.get('UBF');

  // Read Player.sol MIN_BALANCE from the webapp config so the deployed value
  // and the client-side check stay in sync. We use `contractMinBalance` (not
  // `minBalance` — the latter is the food-bar warning threshold, a different
  // concept). On Base, contractMinBalance is 0.0001 ETH; on legacy chains it
  // remains the historical 0.001-0.0015 ETH range.
  let minBalance = DEFAULT_MIN_BALANCE;
  try {
    const webappConfig = require('../../webapp/src/data/config');
    const chainId = await getChainId();
    const config = webappConfig(chainId);
    if (config.contractMinBalance) {
      minBalance = config.contractMinBalance;
    }
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
