const { ethers, deployments } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  const dungeonAddress = "0x5303B0280Cab9E74940256592a43B1cCCECf5C66";
  
  // Vérifie le owner
  const ownerAbi = ["function owner() view returns (address)"];
  const dungeonOwner = new ethers.Contract(dungeonAddress, ownerAbi, deployer);
  const owner = await dungeonOwner.owner();
  console.log("Dungeon owner:", owner);
  console.log("Deployer:", deployer.address);
  console.log("Is owner:", owner.toLowerCase() === deployer.address.toLowerCase());

  // Essaie d'appeler postUpgrade avec staticCall pour voir l'erreur
  const BlockHashRegister = await deployments.get("BlockHashRegister");
  const Player = await deployments.get("Player");
  const DungeonAdmin = await deployments.get("DungeonAdmin");

  const postUpgradeAbi = [
    "function postUpgrade(address blockHashRegister, address playerContract, address owner, address adminContract)"
  ];
  const dungeon = new ethers.Contract(dungeonAddress, postUpgradeAbi, deployer);

  console.log("\nTrying staticCall to postUpgrade...");
  try {
    await dungeon.postUpgrade.staticCall(
      BlockHashRegister.address,
      Player.address,
      deployer.address,
      DungeonAdmin.address
    );
    console.log("staticCall succeeded - transaction should work");
  } catch (e) {
    console.log("staticCall failed with reason:", e.reason || e.message);
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }

  // Vérifie si les facets sont bien installés
  const loupeAbi = [
    "function facetAddresses() view returns (address[])",
    "function facetFunctionSelectors(address facet) view returns (bytes4[])"
  ];
  const loupe = new ethers.Contract(dungeonAddress, loupeAbi, deployer);
  
  console.log("\nFacet addresses:");
  const facets = await loupe.facetAddresses();
  for (const facet of facets) {
    const selectors = await loupe.facetFunctionSelectors(facet);
    console.log(`  ${facet}: ${selectors.length} functions`);
  }
}

main().catch(console.error);