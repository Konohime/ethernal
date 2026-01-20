/**
 * Wallet Store - Modernized for ethers v6 and Base network
 */
import { writable, get } from 'svelte/store';
import { BrowserProvider, Contract, JsonRpcProvider } from 'ethers';
import log from 'utils/log';

const ETH_URL = globalThis.ETH_URL || '';

// Network configurations
const NETWORKS = {
  8453: {
    chainId: '0x2105',
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
  },
  84532: {
    chainId: '0x14a34',
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
  },
};

// Create wallet store
function createWalletStore() {
  const { subscribe, set, update } = writable({
    status: 'Loading',
    address: null,
    chainId: null,
    provider: null,
    signer: null,
    contracts: {},
    walletTakingTimeToReply: false,
    requestingTx: false,
  });

  let contractsInfo = null;
  let supportedChainIds = [];
  let contractInstances = {};
  let fallbackProvider = null;
  let browserProvider = null;
  let currentSigner = null;

  // Load contracts info
  const loadContractsInfo = async () => {
    try {
      const info = await import('contractsInfo');
      contractsInfo = info.default || info;
      
      if (contractsInfo.chainId) {
        supportedChainIds = [String(contractsInfo.chainId)];
      } else {
        supportedChainIds = Object.keys(contractsInfo).filter(k => k !== 'default');
      }
      
      log.debug('Contracts info loaded', { supportedChainIds });
    } catch (err) {
      log.error('Failed to load contracts info', err);
    }
  };

  // Get fallback URL based on chain
  const getFallbackUrl = (chainId) => {
    if (ETH_URL) return ETH_URL;
    
    const chainNum = typeof chainId === 'string' ? parseInt(chainId) : chainId;
    
    switch (chainNum) {
      case 8453:
        return 'https://mainnet.base.org';
      case 84532:
        return 'https://sepolia.base.org';
      case 1:
        return 'https://eth.llamarpc.com';
      default:
        return 'https://sepolia.base.org';
    }
  };

  // Get provider
  const getProvider = () => {
    return browserProvider;
  };

  // Get fallback provider (read-only JSON-RPC)
  const getFallbackProvider = () => {
    if (!fallbackProvider) {
      const state = get({ subscribe });
      const url = getFallbackUrl(state.chainId || 84532);
      fallbackProvider = new JsonRpcProvider(url);
    }
    return fallbackProvider;
  };

  // Get signer
  const getSigner = () => {
    return currentSigner;
  };

  // Get contract instance
  const getContract = (name) => {
    if (contractInstances[name]) {
      return contractInstances[name];
    }
    
    const state = get({ subscribe });
    const contractDef = state.contracts[name];
    
    if (!contractDef) {
      log.error(`Contract ${name} not found`);
      return null;
    }
    
    const provider = currentSigner || getFallbackProvider();
    const contract = new Contract(contractDef.address, contractDef.abi, provider);
    contractInstances[name] = contract;
    
    // Also store in window.contracts for compatibility
    if (typeof window !== 'undefined') {
      window.contracts = window.contracts || {};
      window.contracts[name] = contract;
    }
    
    return contract;
  };

  // Call contract method (read-only)
  const call = async (contractName, method, ...args) => {
    const contract = getContract(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }
    
    try {
      const result = await contract[method](...args);
      return result;
    } catch (err) {
      log.error(`Failed to call ${contractName}.${method}`, err);
      throw err;
    }
  };

  // Send transaction
  const tx = async (options, contractName, method, ...args) => {
    // Handle different call signatures
    if (typeof options === 'string') {
      args = [method, ...args].filter(a => a !== undefined);
      method = contractName;
      contractName = options;
      options = {};
    }
    
    const contract = getContract(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }
    
    // Connect with signer for write operations
    const contractWithSigner = contract.connect(currentSigner);
    
    try {
      update(s => ({ ...s, requestingTx: true }));
      
      const txOptions = {};
      if (options.gas) txOptions.gasLimit = options.gas;
      if (options.gasPrice) txOptions.gasPrice = options.gasPrice;
      if (options.value) txOptions.value = options.value;
      
      const transaction = await contractWithSigner[method](...args, txOptions);
      
      update(s => ({ ...s, requestingTx: false }));
      
      return transaction;
    } catch (err) {
      update(s => ({ ...s, requestingTx: false }));
      log.error(`Failed to send tx ${contractName}.${method}`, err);
      throw err;
    }
  };

  // Switch network
  const switchNetwork = async (chainId) => {
    if (!window.ethereum) return false;
    
    const hexChainId = '0x' + chainId.toString(16);
    
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
      return true;
    } catch (switchError) {
      if (switchError.code === 4902) {
        const networkConfig = NETWORKS[chainId];
        if (networkConfig) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [networkConfig],
            });
            return true;
          } catch (addError) {
            log.error('Failed to add network', addError);
          }
        }
      }
      log.error('Failed to switch network', switchError);
      return false;
    }
  };

  // Connect wallet
  const connect = async () => {
    update(s => ({ ...s, status: 'Unlocking' }));
    
    try {
      if (!window.ethereum) {
        update(s => ({ ...s, status: 'NoWallet' }));
        return;
      }

      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      if (!accounts || accounts.length === 0) {
        update(s => ({ ...s, status: 'Locked' }));
        return;
      }

      browserProvider = new BrowserProvider(window.ethereum);
      currentSigner = await browserProvider.getSigner();
      const address = await currentSigner.getAddress();
      const network = await browserProvider.getNetwork();
      const chainId = String(network.chainId);

      // Reset fallback provider for new chain
      fallbackProvider = null;
      contractInstances = {};

      // Check if on supported network
      if (supportedChainIds.length > 0 && !supportedChainIds.includes(chainId)) {
        const targetChain = parseInt(supportedChainIds[0]);
        const switched = await switchNetwork(targetChain);
        if (!switched) {
          log.warn(`Please switch to a supported network: ${supportedChainIds.join(', ')}`);
        }
      }

      // Register contracts
      const contracts = await registerContracts(chainId, browserProvider, currentSigner);

      update(s => ({
        ...s,
        status: 'Ready',
        address,
        chainId,
        provider: browserProvider,
        signer: currentSigner,
        contracts,
      }));

      // Listen for account changes
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      log.debug('Wallet connected', { address, chainId });
    } catch (err) {
      log.error('Failed to connect wallet', err);
      update(s => ({ ...s, status: 'Error' }));
    }
  };

  // Handle account changes
  const handleAccountsChanged = async (accounts) => {
    if (accounts.length === 0) {
      update(s => ({ ...s, status: 'Locked', address: null }));
    } else {
      const currentState = get({ subscribe });
      if (currentState.address !== accounts[0]) {
        await connect();
      }
    }
  };

  // Handle chain changes
  const handleChainChanged = () => {
    window.location.reload();
  };

  // Register contracts for the current chain
  const registerContracts = async (chainId, provider, signer) => {
    if (!contractsInfo) return {};
    
    let chainInfo = contractsInfo[chainId]?.[0];
    if (!chainInfo) {
      const providedChain = contractsInfo.chainId;
      if (String(providedChain) === String(chainId)) {
        chainInfo = contractsInfo;
      } else {
        log.warn(`No contracts for chain ${chainId}`);
        return {};
      }
    }

    const { contracts: contractDefs } = chainInfo;
    const contracts = {};

    for (const [name, def] of Object.entries(contractDefs)) {
      contracts[name] = {
        address: def.address,
        abi: def.abi,
      };
    }

    log.debug(`Registered ${Object.keys(contracts).length} contracts for chain ${chainId}`);
    return contracts;
  };

  // Unlock (alias for connect)
  const unlock = connect;

  // Disconnect
  const disconnect = () => {
    if (window.ethereum) {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    }
    contractInstances = {};
    fallbackProvider = null;
    browserProvider = null;
    currentSigner = null;
    set({
      status: 'Locked',
      address: null,
      chainId: null,
      provider: null,
      signer: null,
      contracts: {},
      walletTakingTimeToReply: false,
      requestingTx: false,
    });
  };

  // Initialize
  const init = async () => {
    await loadContractsInfo();
    
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          await connect();
          return;
        }
      } catch (err) {
        log.debug('No existing connection');
      }
    }
    
    update(s => ({ 
      ...s, 
      status: window.ethereum ? 'Locked' : 'NoWallet' 
    }));
  };

  // Auto-init
  if (typeof window !== 'undefined') {
    init();
  }

  return {
    subscribe,
    connect,
    unlock,
    disconnect,
    switchNetwork,
    getProvider,
    getFallbackProvider,
    getSigner,
    getContract,
    call,
    tx,
  };
}

const wallet = createWalletStore();

// Export for global access
if (typeof window !== 'undefined') {
  window.wallet = wallet;
}

// Contract data export for compatibility
export const contractData = { contractsInfo: null };

export default wallet;