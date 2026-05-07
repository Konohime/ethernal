/* eslint-disable no-throw-literal */
import { getBytes, hexlify, AbiCoder } from 'ethers';
import log from '../utils/log';
import config from '../data/config';

const defaultAbiCoder = AbiCoder.defaultAbiCoder();

// As of the "kill the burner" cleanup, every game tx is signed directly by the
// player's main wallet (one MetaMask popup per action). The on-chain delegate
// is still registered (cheap, used only for the socket signMessage handshake
// in cache.js) but no longer holds funds and never signs txs — so it can no
// longer cause the "not enough balance, needed: ..." lockout. Player.callAsCharacter
// takes the direct-call branch (msg.sender == sender == player) so the contract
// path is unchanged otherwise.
class PlayerWallet {
  constructor({ playerContract, destinationContract, playerAddress, delegateWallet, walletStore, characterId }) {
    this.characterId = characterId;
    this.playerAddress = playerAddress;
    this.destinationContract = destinationContract;
    this.delegateWallet = delegateWallet; // kept for compatibility (signMessage in cache.js)
    this.walletStore = walletStore;
    this.provider = (walletStore && walletStore.getProvider && walletStore.getProvider()) || (delegateWallet && delegateWallet.provider);
    // playerContract is connected to the main wallet's signer so msg.sender == player.
    const signer = (walletStore && walletStore.getSigner && walletStore.getSigner()) || delegateWallet;
    this.playerContract = playerContract.connect(signer);
  }

  async fetchCharacterId() {
    if (!this.characterId) {
      this.characterId = await this.playerContract.getLastCharacterId(this.playerAddress);
    }
    return this.characterId;
  }

  // Compute gas overrides for the meta-tx style call. We no longer guard on
  // a delegate balance — the main wallet pays gas directly via MetaMask, so
  // there's nothing to "reserve" client-side.
  async computeGasOverrides({ limit = 400000, gasPrice = null }) {
    if (gasPrice === null) {
      const chainId = await this.provider.send('eth_chainId', []);
      const configPrice = BigInt(config(chainId).gasPrice);
      const feeData = await this.provider.getFeeData();
      const networkPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
      gasPrice = networkPrice > configPrice ? networkPrice : configPrice;
    }
    const innerGasLimit = BigInt(limit);
    const txGasLimit = innerGasLimit + 200000n;
    return { innerGasLimit, txGasLimit, gasPrice };
  }

  async tx(options, methodName, ...args) {
    if (typeof options === 'string') {
      if (typeof args === 'undefined') {
        args = [methodName];
      } else {
        args = [methodName].concat(args);
      }
      methodName = options;
      options = {};
    }

    // Re-bind to the latest signer in case the user switched accounts mid-session.
    if (this.walletStore && this.walletStore.getSigner) {
      const currentSigner = this.walletStore.getSigner();
      if (currentSigner) {
        this.playerContract = this.playerContract.connect(currentSigner);
      }
    }

    const data = (await this.destinationContract[methodName].populateTransaction(...args)).data;
    const overrides = await this.computeGasOverrides(options);

    const tx = await this.playerContract.callAsCharacter(
      this.destinationContract.target,
      overrides.innerGasLimit,
      data,
      { gasLimit: overrides.txGasLimit, gasPrice: overrides.gasPrice },
    );
    const oldWait = tx.wait.bind(tx);
    tx.wait = async () => {
      let receipt;
      try {
        receipt = await oldWait();
      } catch (err) {
        receipt = err.receipt || err.info?.receipt;
        if (!receipt) {
          try {
            receipt = await this.provider.getTransactionReceipt(tx.hash);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('failed to get receipt for reverted tx', e);
          }
        }
        if (!receipt) {
          throw err;
        }
      }
      const result = {
        ...receipt,
        logs: receipt.logs || [],
        status: receipt.status,
        hash: receipt.hash,
        methodName,
        args,
      };
      if (result.logs.length > 0) {
        const callEvent = result.logs.find((l) => l.fragment?.name === 'Call');
        if (callEvent && !callEvent.args.success) {
          const bytes = getBytes(callEvent.args[1]);
          if (hexlify(bytes.slice(0, 4)) === '0x08c379a0') {
            const reason = defaultAbiCoder.decode(['string'], bytes.slice(4));
            throw { reason: reason[0], receipt: result };
          }
          throw { receipt: result, errorData: callEvent.args[1] };
        } else if (callEvent) {
          result.returnData = callEvent.args[1];
        }
      } else if (result.status === 0) {
        let outerReason = 'transaction reverted';
        let txData;
        try {
          txData = await this.provider.getTransaction(tx.hash);
          if (txData) {
            await this.provider.call(
              { to: txData.to, data: txData.data, from: txData.from, gasLimit: txData.gasLimit },
              result.blockNumber,
            );
          }
        } catch (callErr) {
          outerReason = callErr.reason || callErr.revert?.args?.[0] || callErr.shortMessage || callErr.message || outerReason;
        }
        if (outerReason === 'call failed') {
          try {
            await this.provider.call(
              {
                to: this.destinationContract.target,
                data,
                from: this.playerContract.target,
                gasLimit: overrides.innerGasLimit,
              },
              result.blockNumber,
            );
          } catch (innerErr) {
            const innerReason =
              innerErr.reason || innerErr.revert?.args?.[0] || innerErr.shortMessage || innerErr.message;
            if (innerReason && innerReason !== 'call failed') {
              outerReason = innerReason;
            }
          }
        }
        // eslint-disable-next-line no-console
        console.warn(
          'tx reverted method=', methodName,
          'reason=', outerReason,
          'hash=', tx.hash,
          'args=', args,
        );
        throw { reason: outerReason, receipt: result };
      } else if (result.logs.length === 0 && result.status !== 0) {
        throw { receipt: result };
      }
      log.debug('tx receipt received', { tx, receipt: result });
      return result;
    };

    log.debug('sending player tx', {
      tx,
      methodName,
      args,
      player: this.playerAddress,
      character: this.characterId,
    });

    return !options.wait ? tx : tx.wait();
  }
}

export default PlayerWallet;
