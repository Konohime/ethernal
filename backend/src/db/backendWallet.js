const { Wallet, utils, BigNumber } = require('ethers');
const retry = require('p-retry');

const { fromMnemonic } = utils.HDNode;

class BackendWallet extends Wallet {
  constructor(...args) {
    super(...args);
    this._sendQueue = Promise.resolve();
    this._nextNonce = null;
  }

  connect(provider) {
    // @TODO: catch same errors
    super.connect(provider);
    return new BackendWallet(this.privateKey, provider);
  }

  async sendTransaction(transaction) {
    if (transaction.gasPrice == null) {
      transaction.gasPrice = BigNumber.from(process.env.GAS_PRICE || '1000000000');
    }

    // Serialize all sends so nonce assignment + submission is atomic.
    // Concurrent sends previously raced on a shared promise chain — if one failed
    // with "nonce", all others already had stale nonces assigned and looped.
    const run = this._sendQueue.then(async () => {
      if (transaction.nonce == null) {
        if (this._nextNonce == null) {
          this._nextNonce = await this.provider.getTransactionCount(this.address, 'pending');
        }
        transaction.nonce = this._nextNonce;
      }

      return retry(async () => {
        try {
          this.provider.clearCache();
          const tx = await super.sendTransaction(transaction);
          this._nextNonce = transaction.nonce + 1;
          return tx;
        } catch (err) {
          if (err.message && err.message.includes('nonce')) {
            console.log('incorrect nonce, refetching');
            const fresh = await this.provider.getTransactionCount(this.address, 'pending');
            transaction.nonce = fresh;
            this._nextNonce = null;
            throw err; // let p-retry retry with fresh nonce
          }
          throw err;
        }
      });
    });

    // Keep the queue chain alive even if this send fails.
    this._sendQueue = run.catch(() => {});
    return run;
  }

  static fromMnemonic(mnemonic, path = "m/44'/60'/0'/0/0", wordlist) {
    return new BackendWallet(fromMnemonic(mnemonic, wordlist).derivePath(path));
  }
}

module.exports = BackendWallet;
