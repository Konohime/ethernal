const { ethers, deployments } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  // Récupérer les adresses
  const dungeonDeployment = await deployments.get("Dungeon");
  const dungeonAddress = dungeonDeployment.address;
  console.log("Dungeon Diamond:", dungeonAddress);

  // Récupérer les facets à ajouter
  const facetNames = [
    "DungeonInfoFacet",
    "DungeonMovementFacet", 
    "DungeonActionsFacet",
    "DungeonCharacterFacet",
    "DungeonAdminFacet"
  ];

  const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };
  const cuts = [];

  for (const facetName of facetNames) {
    const facetDeployment = await deployments.get(facetName);
    const facetAddress = facetDeployment.address;
    
    // Extraire les selectors de l'ABI
    const selectors = [];
    for (const item of facetDeployment.abi) {
      if (item.type === "function") {
        const iface = new ethers.Interface([item]);
        const selector = iface.getFunction(item.name).selector;
        selectors.push(selector);
      }
    }
    
    console.log(`${facetName}: ${facetAddress} (${selectors.length} functions)`);
    
    cuts.push({
      facetAddress: facetAddress,
      action: FacetCutAction.Add,
      functionSelectors: selectors
    });
  }

  // ABI pour diamondCut
  const diamondCutAbi = [
    "function diamondCut(tuple(address facetAddress, uint8 action, bytes4[] functionSelectors)[] _diamondCut, address _init, bytes _calldata)"
  ];

  const diamond = new ethers.Contract(dungeonAddress, diamondCutAbi, deployer);

  console.log("\nCalling diamondCut to add facets...");
  try {
    const tx = await diamond.diamondCut(
      cuts,
      ethers.ZeroAddress, // no init
      "0x", // no calldata
      { gasLimit: 3000000 }
    );
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("diamondCut SUCCESS!");
  } catch (e) {
    console.log("diamondCut failed:", e.reason || e.message);
    if (e.data) console.log("Error data:", e.data);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });