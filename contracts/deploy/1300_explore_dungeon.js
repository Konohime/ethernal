module.exports = async ({getNamedAccounts, deployments}) => {
  const {log} = deployments;
  
  const explore = Number(process.env.EXPLORE);
  if (!explore) {
    return;
  }

  log(`Exploring dungeon for ${explore} steps...`);
  log('NOTE: This script requires the lib/index.js to be migrated');
  log('Skipping for now - manual exploration recommended');
  
  // TODO: Migrate lib/index.js enter() and walk() functions for ethers v6
  // const {enter, walk} = require('../lib');
  // const {deployer} = await getNamedAccounts();
  // const setup = await enter(deployer, price, gasPrice);
  // const rooms = await walk(setup, explore);
  // console.log('Walker finished after ' + Object.keys(rooms).length + ' rooms');
};

module.exports.tags = ['Explore'];
module.exports.skip = async () => !process.env.EXPLORE;
