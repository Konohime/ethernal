const fs = require('fs');

module.exports = async ({network, getNamedAccounts, deployments, ethers}) => {
  const {execute, deploy, log} = deployments;

  // Skip on live networks unless explicitly requested
  if (network.live && !process.env.GENERATE_KEYS) {
    log('Skipping claim key generation on live network (set GENERATE_KEYS=true to enable)');
    return;
  }

  const {deployer} = await getNamedAccounts();

  // Configuration
  let offset = 0;
  let mnemonic = 'poet state twin chunk pottery boss final sudden matter express nasty control';
  let numClaimKey = 5;
  
  if (network.live) {
    offset = 3200;
    mnemonic = 'wild cement you coffee payment answer kitten garden imitate label critic company';
    numClaimKey = 200;
  }

  // Default values
  const claimKeyValue = ethers.parseEther('0.05'); // ~5 refills worth

  // Deploy Batch contract if needed
  const batch = await deploy('Batch', {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  log(`Generating ${numClaimKey} claim keys...`);
  
  const claimKeys = [];
  const addresses = [];
  let totalValue = 0n;

  for (let i = offset; i < numClaimKey + offset; i++) {
    const path = `m/44'/60'/${i}'/0/0`;
    const wallet = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      path
    );
    claimKeys.push(wallet.privateKey);
    addresses.push(wallet.address);
    totalValue += claimKeyValue;
  }

  log(`Sending ${ethers.formatEther(claimKeyValue)} ETH to each of ${numClaimKey} claim keys...`);
  
  await execute(
    'Batch',
    {from: deployer, value: totalValue.toString(), gasLimit: 6000000},
    'transfer',
    addresses
  );

  // Save claim keys to files
  fs.writeFileSync('.claimKeys.json', JSON.stringify(claimKeys, null, 2));
  
  let csv = 'key,url,used\n';
  for (const claimKey of claimKeys) {
    const url = `https://alpha.ethernal.world/#dungeonKey=${claimKey}`;
    csv += `${claimKey},${url},false\n`;
  }
  fs.writeFileSync('.claimKeys.csv', csv);

  log(`${numClaimKey} claim keys generated in .claimKeys.json and .claimKeys.csv`);
};

module.exports.tags = ['ClaimKeys'];
module.exports.skip = async ({network}) => network.live && !process.env.GENERATE_KEYS;
