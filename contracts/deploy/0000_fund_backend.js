module.exports = async ({network, getNamedAccounts, ethers}) => {
  // Skip on live networks
  if (network.live) {
    return;
  }

  const {deployer, backendAddress} = await getNamedAccounts();
  
  // Get signer
  const signer = await ethers.getSigner(deployer);
  
  // Fund backend with 20 ETH for local testing
  const tx = await signer.sendTransaction({
    to: backendAddress,
    value: ethers.parseEther('20'),
  });
  
  await tx.wait();
  console.log(`Funded backend ${backendAddress} with 20 ETH`);
};

module.exports.tags = ['fund', 'local'];
module.exports.skip = async ({network}) => network.live; // Skip on live networks
