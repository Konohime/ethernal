require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("@nomicfoundation/hardhat-ledger");

const fs = require("fs");
const { ethers } = require("ethers");

// Ledger : ton adresse publique Ethereum (pas la clé privée!)
const LEDGER_ADDRESS = process.env.LEDGER_ADDRESS || "";

// Charger le mnemonic local pour le développement
let localMnemonic = "test test test test test test test test test test test junk";
try {
  localMnemonic = fs.readFileSync("mnemonic.local").toString().trim();
} catch (e) {
  console.log("No mnemonic.local found, using default test mnemonic");
}

// Générer les comptes pour le réseau local
const localAccounts = [];
for (let i = 0; i < 10; i++) {
  const wallet = ethers.Wallet.fromPhrase(localMnemonic, `m/44'/60'/0'/0/${i}`);
  localAccounts.push({
    privateKey: wallet.privateKey,
    balance: "10000000000000000000000", // 10000 ETH
  });
}

// Clé privée pour le déploiement (optionnel, si pas de Ledger)
const deployerPrivateKey = process.env.PRIVATE_KEY || "";

// Fonction pour obtenir la configuration des comptes selon le mode
function getNetworkConfig(rpcUrl, chainId) {
  const config = {
    url: rpcUrl,
    chainId: chainId,
    gasPrice: 1500000000,
  };
  
  // Si Ledger configuré, utiliser le Ledger
  if (LEDGER_ADDRESS) {
    config.ledgerAccounts = [LEDGER_ADDRESS];
  } 
  // Sinon, utiliser la clé privée si disponible
  else if (deployerPrivateKey) {
    config.accounts = [deployerPrivateKey];
  }
  // Sinon, pas de comptes (erreur au déploiement)
  
  return config;
}

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    // Réseau local Hardhat
    hardhat: {
      accounts: localAccounts,
      chainId: 31337,
    },
    // Réseau local (si tu lances `npx hardhat node` séparément)
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Base Sepolia (Testnet)
    "base-sepolia": {
      ...getNetworkConfig(
        process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
        84532
      ),
    },
    // Base Mainnet
    "base": {
      ...getNetworkConfig(
        process.env.BASE_RPC_URL || "https://mainnet.base.org",
        8453
      ),
    },
  },
  // Configuration pour hardhat-deploy
  namedAccounts: {
    deployer: {
      default: 0,
    },
    dungeonOwner: {
      default: 1,
      "base-sepolia": 0,
      base: 0,
    },
    backendAddress: {
      default: 0,
      "base-sepolia": process.env.BACKEND_WALLET || 0,
      base: process.env.BACKEND_WALLET || 0,
    },
  },
  // Vérification sur Basescan
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
  // Reporter de gas (optionnel, utile pour optimiser)
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
};
