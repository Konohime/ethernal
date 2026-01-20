const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const dungeonAddress = "0x5303B0280Cab9E74940256592a43B1cCCECf5C66";

  // Diamond storage position: keccak256("diamond.standard.diamond.storage")
  const DIAMOND_STORAGE_POSITION = "0xc8fcad8db84d3cc18b4c41d551ea0ee66dd599cde068d998e57d5e09332c131c";
  
  // Le contractOwner est le premier élément du struct, donc il est à la position DIAMOND_STORAGE_POSITION
  const ownerSlot = DIAMOND_STORAGE_POSITION;
  
  const ownerData = await ethers.provider.getStorage(dungeonAddress, ownerSlot);
  console.log("Raw owner data from storage:", ownerData);
  
  // Decode address (last 20 bytes)
  const ownerAddress = "0x" + ownerData.slice(-40);
  console.log("Decoded owner address:", ownerAddress);
  console.log("Deployer address:", deployer.address);
  console.log("Match:", ownerAddress.toLowerCase() === deployer.address.toLowerCase());

  // Aussi vérifier via la fonction owner() du OwnershipFacet
  const ownerAbi = ["function owner() view returns (address)"];
  const dungeon = new ethers.Contract(dungeonAddress, ownerAbi, deployer);
  const ownerFromFunction = await dungeon.owner();
  console.log("\nOwner from function:", ownerFromFunction);
}

main().catch(console.error);