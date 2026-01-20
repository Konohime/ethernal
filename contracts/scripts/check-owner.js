const { ethers } = require("hardhat");

async function main() {
  const dungeonAddress = "0x5303B0280Cab9E74940256592a43B1cCCECf5C66";
  
  // Utilise l'ABI minimal pour owner()
  const abi = ["function owner() view returns (address)"];
  const [deployer] = await ethers.getSigners();
  const dungeon = new ethers.Contract(dungeonAddress, abi, deployer);
  
  const owner = await dungeon.owner();
  console.log("Dungeon owner:", owner);
  console.log("Deployer:", deployer.address);
  console.log("Match:", owner.toLowerCase() === deployer.address.toLowerCase());
}

main().catch(console.error);