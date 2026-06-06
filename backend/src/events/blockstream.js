const { BlockAndLogStreamer } = require('ethereumjs-blockstream');
const retry = require('p-retry');
const Events = require('./events');

const retryConfig = { retries: 3 };

class Blockstream extends Events {
  defaultConfig = {
    // Base produit ~1 bloc/2s : poller chaque seconde triplait la facture RPC
    // pour rien. Configurable via POOLING_INTERVAL (ms), défaut 3000.
    poolingInterval: parseInt(process.env.POOLING_INTERVAL, 10) || 3000,
    blockRetention: 1000,
    start: true,
  };
  contracts = {};
  filteredAddresses = new Set();

  constructor(provider, db, configuration = {}) {
    super(provider, db);
    console.log('listening for events with blockstream');
    this.configuration = { ...this.defaultConfig, ...configuration };
    this.blockAndLogStreamer = new BlockAndLogStreamer(
      this.getBlockByHash.bind(this),
      this.getLogs.bind(this),
      error => console.log('event processing error: ' + error, error),
      this.configuration,
    );
    // No global `{}` filter: that would fetch *every* log of *every* contract on
    // each block (huge eth_getLogs payloads, quota burn, connection resets).
    // Instead we add one address-scoped filter per contract in `on()`.
    this.blockAndLogStreamer.subscribeToOnLogsAdded((blockHash, logs) => this.emitLogs(blockHash, logs));
    this.blockAndLogStreamer.subscribeToOnLogsRemoved((blockHash, logs) => this.emitLogs(blockHash, logs, true));
    if (this.configuration.start) {
      this.start();
    }
  }

  async emitLogs(blockHash, logs, removed = false) {
    for (let log of logs) {
      const address = log.address.toLowerCase();
      const contract = this.contracts[address];
      if (contract) {
        const event = this.parseLog(contract, log);
        const listener = this.listeners.find(({ eventName, contract }) =>
          event.name === eventName && contract.address.toLowerCase() === address);
        if (listener) {
          const { addedCallback, prefetch } = listener;
          await this.useDeferrableCallback(addedCallback, prefetch)(...Array.from(event.args), event, removed);
        }
      }
    }
  }

  on(contract, eventName, addedCallback, prefetch, confirmed = false) {
    const address = contract.address.toLowerCase();
    this.contracts[address] = contract;
    // Register an address-scoped log filter once per contract so eth_getLogs only
    // pulls logs for the contracts we actually listen to (deduped by the streamer).
    if (!this.filteredAddresses.has(address)) {
      this.filteredAddresses.add(address);
      this.blockAndLogStreamer.addLogFilter({ address: contract.address });
    }
    return super.on(contract, eventName, addedCallback, prefetch, confirmed);
  }

  onBlock(callback) {
    this.blockAndLogStreamer.subscribeToOnBlockAdded(callback);
    return this;
  }

  onBlockRemoved(callback) {
    this.blockAndLogStreamer.subscribeToOnBlockRemoved(callback);
    return this;
  }

  async getLatestBlock() {
    return this.provider.send('eth_getBlockByNumber', ['latest', false]);
  }

  async getBlockByHash(hash) {
    return this.provider.send('eth_getBlockByHash', [hash, false]);
  }

  async getLogs(filterOptions) {
    return this.provider.send('eth_getLogs', [filterOptions]);
  }

  async reconcileNewBlock() {
    const latest = await this.getLatestBlock();
    await retry(() => this.blockAndLogStreamer.reconcileNewBlock(latest), retryConfig);
    return latest;
  }

  start() {
    this.timer = setInterval(() => this.reconcileNewBlock().catch(console.log), this.configuration.poolingInterval);
  }

  stop() {
    clearInterval(this.timer);
  }
}

module.exports = Blockstream;
