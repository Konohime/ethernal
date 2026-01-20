const fs = require('fs');
const path = require('path');

async function main() {
  const deploymentsPath = path.join(__dirname, '../deployments/base-sepolia');
  const outputPath = path.join(__dirname, '../../webapp/contracts/development.json');
  
  const contractNames = [
    'Dungeon',
    'Player',
    'Characters',
    'Elements',
    'Gears',
    'Rooms',
    'UBF',
    'DungeonAdmin',
    'DungeonTokenTransferer',
    'BlockHashRegister',
    'PureDungeon',
    'ReadOnlyDungeon'
  ];
  
  const result = {
    chainId: 84532,
    contracts: {}
  };
  
  for (const name of contractNames) {
    const filePath = path.join(deploymentsPath, `${name}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      result.contracts[name] = {
        address: data.address,
        abi: data.abi
      };
      console.log(`Added ${name}: ${data.address}`);
    } else {
      console.log(`Warning: ${name}.json not found`);
    }
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\nExported to ${outputPath}`);
}

main().catch(console.error);