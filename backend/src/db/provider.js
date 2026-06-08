require('dotenv').config();
const Sentry = require('@sentry/node');
const ethers = require('ethers');
const retry = require('p-retry');
const Promise = require('bluebird');
const memoize = require('memoizee');
const taim = require('taim');

// Nouvelles imports @ethereumjs
const { createVM, runTx } = require('@ethereumjs/vm');
const { Common, Mainnet, Hardfork } = require('@ethereumjs/common');
const { createLegacyTx } = require('@ethereumjs/tx');
const { Address, privateToAddress, hexToBytes } = require('@ethereumjs/util');

const { simpleEncode, simpleDecode } = require('ethereumjs-abi');
const contractsInfo = process.env.DEV ? require('../dev_contractsInfo.json') : require('../contractsInfo.json');
const Postgres = require('./postgres');
const Progress = require('../utils/progress.js');
const retryable = require('../utils/retryable.js');
const BackendWallet = require('./backendWallet.js');
const Blockstream = require('../events/blockstream.js');
const DaggerEvents = require('../events/dagger.js');
const WebSocketEvents = require('../events/websocket.js');
const { bn } = require('../game/utils.js');

const retryConfig = { retries: 3 };
const concurrency = process.env.CONCURRENCY || 20;
const url = process.env.ETH_URL || 'http://localhost:8545';
const mnemonic = process.env.MNEMONIC;
const cacheConfig = { length: false, primitive: true, max: 10000 };

console.log('connecting to provider ' + url);
// Force `Connection: close` so Node (keepAlive=true by default since Node 19)
// doesn't reuse a pooled socket that the RPC endpoint already closed, which
// surfaces as `write EPIPE` on the next request. StaticJsonRpcProvider also
// avoids re-detecting the network on every call.
const provider = new ethers.providers.StaticJsonRpcProvider({
  url,
  headers: { Connection: 'close' },
});
let wallet;
let hashBotWallet;
if (mnemonic) {
  wallet = BackendWallet.fromMnemonic(mnemonic).connect(provider);
  hashBotWallet = BackendWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/1").connect(provider);
  console.log('using address', wallet.address);
}
let _contracts = null;

const db = new Postgres();

const setupAuthorization = async ({ DungeonAdmin }) => {
  const [, backendAddress] = await DungeonAdmin.getDungeonAndBackendAddress();
  if (backendAddress.toLowerCase() === wallet.address.toLowerCase()) {
    console.log('backend is authorized in dungeon');
    return;
  }
  console.log('current backend address is not authorized!');
  console.log('only ' + backendAddress + ' is authorized in dungeon');

  // Two-step rotation: owner calls nominateBackend(us), then we call acceptBackend().
  // We can only do the second step. If we're not pending, the owner must nominate us first
  // (run contracts/scripts/nominate-backend.js with the owner key).
  const pending = await DungeonAdmin.pendingBackend();
  if (pending.toLowerCase() !== wallet.address.toLowerCase()) {
    console.log('not nominated yet. pending backend = ' + pending);
    console.log('the contract OWNER must call nominateBackend(' + wallet.address + ') first.');
    console.log('see contracts/scripts/nominate-backend.js');
    return;
  }

  console.log('we are the pending backend, calling acceptBackend()...');
  const tx = await DungeonAdmin.acceptBackend();
  await tx.wait();
  console.log('admin wallet changed to ' + wallet.address);
};

const setupPureContract = async deploymentBytecode => {
  const accountPk = hexToBytes('0xe331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109');
  const accountAddress = new Address(privateToAddress(accountPk));
  
  // Utiliser Berlin (avant EIP-1559) pour éviter les problèmes de baseFee
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Berlin });
  const vm = await createVM({ common });
  
  const txData = {
    value: 0n,
    gasLimit: 10000000n,
    gasPrice: 1n, // Mettre au moins 1
    data: hexToBytes(deploymentBytecode.startsWith('0x') ? deploymentBytecode : '0x' + deploymentBytecode),
    nonce: 0n,
  };
  
  const tx = createLegacyTx(txData, { common });
  const signedTx = tx.sign(accountPk);
  
  const deploymentResult = await runTx(vm, { tx: signedTx, skipBalance: true, skipNonce: true });
  if (deploymentResult.execResult.exceptionError) {
    throw deploymentResult.execResult.exceptionError;
  }
  const contractAddress = deploymentResult.createdAddress;
  console.log('vm for pure calls started');
  
  return async (funcSig, args) => {
    const callResult = await vm.evm.runCall({
      to: contractAddress,
      caller: accountAddress,
      origin: accountAddress,
      data: simpleEncode(funcSig, ...args),
    });
    if (callResult.execResult.exceptionError) {
      throw callResult.execResult.exceptionError;
    }
    return simpleDecode(funcSig, Buffer.from(callResult.execResult.returnValue));
  };
};

const loadContracts = async () => {
  const chainId = bn(await provider.send('eth_chainId', [])).toString();
  console.log(`loading contracts on network ${chainId}`);
  let chainInfo = contractsInfo[chainId];
  if (!chainInfo) {
    chainInfo = contractsInfo['1337'];
  }
  if (!chainInfo) {
    const providedChain = contractsInfo.chainId;
    if (providedChain === chainId) {
      chainInfo = contractsInfo;
    } else {
      console.log('only provided contracts info is for chain ' + providedChain);
    }
  }
  if (!chainInfo) {
    console.log('missing contracts info for the network');
    Sentry.captureException(new Error('Missing contracts info for network'));
    await Sentry.close();
    process.exit(1);
  }
  const chainContracts = chainInfo.contracts || chainInfo[0].contracts;
  const contracts = Object.keys(chainContracts).reduce(
    (result, key) => {
      const info = chainContracts[key];
      let connectedWallet = wallet;
      if (key === 'BlockHashRegister') {
        connectedWallet = hashBotWallet;
      }
      if (key === 'Dungeon') {
        console.log('connected to Dungeon contract ' + info.address);
      }
      result[key] = new ethers.Contract(info.address, info.abi, connectedWallet);
      return result;
    },
    {
      pureCall: memoize(
        await setupPureContract(chainContracts.Dungeon.linkedData.readOnlyDungeon),
        cacheConfig,
      ),
    },
  );
  await setupAuthorization(contracts);
  Object.values(contracts).forEach(contract => {
    if (contract.functions) {
      contract.cached = Object.entries(contract.functions).reduce((o, [name, fn]) => ({
        ...o, [name]: memoize(taim(name, retryable(fn, retryConfig)), cacheConfig)
      }), {});
    }
  });
  provider.clearCache = () => {
    console.log('clearing cache');
    if (_contracts) {
      Object.values(_contracts).forEach(contract => {
        if (contract.functions) {
          Object.values(contract.cached).forEach(memoized => memoized.clear());
        }
      });
    }
  };
  return contracts;
};

const contracts = async () => {
  if (!_contracts) {
    _contracts = await loadContracts();
    await db.init(_contracts);
    await events.storeSchema();
  }
  return _contracts;
};

const pastEvents = async (
  contractName,
  eventName,
  additionalTopics = [],
  fromBlock = 0,
  toBlock = 'latest',
  blockChunk = parseInt(process.env.BLOCK_CHUNK, 10) || 9999,
  showProgress = false,
) => {
  const contract = _contracts[contractName];
  const eventTopic = contract.interface.getEventTopic(eventName);
  const topics = [eventTopic, ...additionalTopics];
  let chunks = [{ fromBlock, toBlock }];
  if (fromBlock) {
    const from = fromBlock;
    const to = toBlock === 'latest' ? (await provider.getBlock('latest')).number : toBlock;
    if (to - from > blockChunk) {
      chunks = [];
      let block = from;
      while (block + blockChunk < to) {
        chunks.push({ fromBlock: block, toBlock: (block += blockChunk) });
        block++;
      }
      if (block < to) {
        chunks.push({ fromBlock: block, toBlock });
      }
    }
  }
  const progress = new Progress('event chunks', 1);
  return Promise.map(
    chunks,
    ({ fromBlock, toBlock }) =>
      retry(async () => {
        const logs = await provider.getLogs({
          fromBlock,
          toBlock,
          address: contract.address,
          topics,
        });
        if (showProgress) {
          progress.tick();
        }
        return logs.map(event => ({ ...event, ...contract.interface.parseLog(event) }));
      }, retryConfig),
    { concurrency },
  ).then(chunks => chunks.flat());
};

// WS_URL (wss://) => souscriptions push, plus de polling ni de getLogs par bloc.
// Sans WS_URL on garde le comportement actuel (Dagger sur Mumbai, sinon polling).
const wsUrl = process.env.WS_URL;
const events = wsUrl
  ? new WebSocketEvents(provider, db, wsUrl)
  : url.includes('rpc-mumbai.matic.today') && process.env.DAGGER !== 'disabled'
    ? new DaggerEvents(provider, db, process.env.DAGGER || 'wss://mumbai-dagger.matic.today')
    : new Blockstream(provider, db);

module.exports = { provider, db, contracts, wallet, events, pastEvents };