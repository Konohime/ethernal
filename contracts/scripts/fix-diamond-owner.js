const { ethers, deployments } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  // Récupérer l'adresse du Dungeon depuis les déploiements
  const dungeonDeployment = await deployments.get("Dungeon");
  const dungeonAddress = dungeonDeployment.address;
  console.log("Dungeon address:", dungeonAddress);

  // 1. Déployer DiamondInit
  console.log("\n1. Deploying DiamondInit...");
  const DiamondInit = await ethers.getContractFactory("DiamondInit");
  const diamondInit = await DiamondInit.deploy();
  await diamondInit.waitForDeployment();
  const diamondInitAddress = await diamondInit.getAddress();
  console.log("   DiamondInit deployed at:", diamondInitAddress);

  // 2. Encoder l'appel à init(owner)
  const initCalldata = diamondInit.interface.encodeFunctionData("init", [deployer.address]);
  console.log("   Init calldata:", initCalldata);

  // 3. Appeler diamondCut avec init
  const diamondCutAbi = [
    "function diamondCut(tuple(address facetAddress, uint8 action, bytes4[] functionSelectors)[] _diamondCut, address _init, bytes _calldata)"
  ];
  
  const dungeon = new ethers.Contract(dungeonAddress, diamondCutAbi, deployer);

  console.log("\n2. Calling diamondCut to initialize owner...");
  try {
    const tx = await dungeon.diamondCut(
      [], // pas de changement de facets
      diamondInitAddress, // adresse du contrat init
      initCalldata, // calldata pour init
      { gasLimit: 200000 }
    );
    console.log("   Transaction:", tx.hash);
    await tx.wait();
    console.log("   diamondCut SUCCESS!");
  } catch (e) {
    console.log("   diamondCut failed:", e.reason || e.message);
  }

  // 4. Vérifier le résultat
  console.log("\n3. Verifying...");
  const DIAMOND_STORAGE_POSITION = "0xc8fcad8db84d3cc18b4c41d551ea0ee66dd599cde068d998e57d5e09332c131c";
  const ownerData = await ethers.provider.getStorage(dungeonAddress, DIAMOND_STORAGE_POSITION);
  const ownerAddress = "0x" + ownerData.slice(-40);
  console.log("   Owner in DiamondStorage:", ownerAddress);
  console.log("   Expected:", deployer.address);
  console.log("   Match:", ownerAddress.toLowerCase() === deployer.address.toLowerCase());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });