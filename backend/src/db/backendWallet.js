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

      return retry(async attempt => {
        try {
          this.provider.clearCache();
          const tx = await super.sendTransaction(transaction);
          this._nextNonce = transaction.nonce + 1;
          return tx;
        } catch (err) {
          // Only treat as a nonce problem when the *reason* field says so — not just
          // the presence of the word "nonce" somewhere in the dumped tx. Also bail
          // out early on reverts: they are deterministic, retrying burns RPC.
          const reason = (err && (err.reason || '')) + '';
          const code = err && err.code;
          if (code === 'UNPREDICTABLE_GAS_LIMIT' || reason.includes('execution reverted')) {
            throw new retry.AbortError(err);
          }
          const isNonceErr = /^nonce /i.test(reason)
            || reason === 'nonce has already been used'
            || reason === 'replacement transaction underpriced'
            || reason === 'already known';
          if (isNonceErr) {
            const fresh = await this.provider.getTransactionCount(this.address, 'pending');
            console.log(`nonce error (attempt ${attempt}), used=${transaction.nonce}, pending-count=${fresh}, reason="${reason}"`);
            transaction.nonce = fresh > transaction.nonce ? fresh : transaction.nonce + 1;
            this._nextNonce = null;
            throw err;
          }
          throw err;
        }
      }, { retries: 5 });
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
