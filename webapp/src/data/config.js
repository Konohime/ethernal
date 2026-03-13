const settings = Object.freeze({
  price: {
    default: '400000000000000000',
    '4': '10000000000000000',
    '42': '10000000000000000',
    '15001': '30000000000000000',
    '80001': '400000000000000000',
    '77': '1000000000000000000',
    '100': '1000000000000000000',
    '84532': '1000000000000000', // 0.001 ETH - Base Sepolia
    '8453': '1000000000000000',  // 0.001 ETH - Base Mainnet
  },
  minBalance: {
    default: '1500000000000000',
    '4': '1000000000000000',
    '42': '1000000000000000',
    '15001': '150000000000000',
    '80001': '1500000000000000',
    '77': '1000000000000000',
    '100': '100000000000000000',
    '84532': '10000000000000', // 0.00001 ETH - Base Sepolia (needFood threshold = minBalance*5 = 0.00005 ETH)
    '8453': '1000000000000000',  // 0.001 ETH - Base Mainnet
  },
  gasPrice: {
    default: '1000000000',
    '15001': '100000000',
    '80001': '1000000000',
    '84532': '1000000',
    '8453': '1000000',
  },
  blockExplorerUrl: {
    default: 'https://etherscan.io/block',
    '4': 'https://rinkeby.etherscan.io/block',
    '42': 'https://kovan.etherscan.io/block',
    '80001': 'https://mumbai.polygonscan.com/block',
    '77': 'https://blockscout.com/poa/sokol/block',
    '100': 'https://blockscout.com/xdai/mainnet/block',
    '84532': 'https://sepolia.basescan.org/block',
    '8453': 'https://basescan.org/block',
  },
});
const cache = {};
const config = chainId => {
  if (typeof chainId === 'string' && chainId.slice(0, 2) === '0x') {
    chainId = parseInt(chainId.slice(2), 16);
  }
  if (cache[chainId]) {
    return cache[chainId];
  }
  const opts = {};
  Object.entries(settings).forEach(([key, val]) => {
    if (typeof val === 'object') {
      if (val[chainId]) {
        opts[key] = val[chainId];
      } else if (val.default) {
        opts[key] = val.default;
      }
    } else {
      opts[key] = val;
    }
  });
  cache[chainId] = opts;
  return opts;
};
module.exports = config;
