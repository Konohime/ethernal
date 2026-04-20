// Rewires token proxies + Characters roles to the current Diamond address.
// Idempotent: safe to re-run. Use after any Diamond redeploy.
//
// Usage: npx hardhat run scripts/rewire.js --network base-sepolia

const {ethers, deployments, getNamedAccounts} = require('hardhat');

async function main() {
  const {deployer} = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);

  const dungeon = (await deployments.get('Dungeon')).address;
  const player = (await deployments.get('Player')).address;
  const gears = (await deployments.get('Gears')).address;
  const elements = (await deployments.get('Elements')).address;
  const rooms = (await deployments.get('Rooms')).address;
  const characters = (await deployments.get('Characters')).address;
  const dtt = (await deployments.get('DungeonTokenTransferer')).address;

  console.log('New Diamond:', dungeon);
  console.log('Deployer (proxyAdmin):', deployer);

  // ERC1155 token proxies — re-run postUpgrade(dungeon)
  const erc1155Abi = ['function postUpgrade(address tokenOwner) external'];
  for (const [name, addr] of [['Elements', elements], ['Gears', gears], ['Rooms', rooms]]) {
    const c = new ethers.Contract(addr, erc1155Abi, signer);
    console.log(`- ${name}.postUpgrade(dungeon)`);
    const tx = await c.postUpgrade(dungeon);
    await tx.wait();
  }

  // DungeonTokenTransferer — re-run postUpgrade(dungeon, player, gears, elements, characters)
  const dttAbi = [
    'function postUpgrade(address dungeon, address player, address gears, address elements, address characters) external',
  ];
  const dttC = new ethers.Contract(dtt, dttAbi, signer);
  console.log('- DungeonTokenTransferer.postUpgrade(...)');
  await (await dttC.postUpgrade(dungeon, player, gears, elements, characters)).wait();

  // Characters — new role setter (minter = Player, dungeon = Diamond)
  const charAbi = ['function setRoles(address minter, address dungeon) external'];
  const charC = new ethers.Contract(characters, charAbi, signer);
  console.log('- Characters.setRoles(player, dungeon)');
  await (await charC.setRoles(player, dungeon)).wait();

  console.log('Done. Re-run `npx hardhat deploy` so 0100_start_dungeon can execute start().');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
