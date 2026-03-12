/* eslint-disable no-throw-literal */
import { getBytes, hexlify, AbiCoder } from 'ethers';
import log from '../utils/log';
import config from '../data/config';

const defaultAbiCoder = AbiCoder.defaultAbiCoder();

class PlayerWallet {
  constructor({ playerContract, destinationContract, playerAddress, delegateWallet, characterId }) {
    this.characterId = characterId;
    this.playerAddress = playerAddress;
    this.destinationContract = destinationContract;
    this.delegateWallet = delegateWallet;
    this.provider = delegateWallet.provider;
    this.playerContract = playerContract.connect(delegateWallet);
  }

  async fetchCharacterId() {
    if (!this.characterId) {
      this.characterId = await this.playerContract.getLastCharacterId(this.playerAddress);
    }
    return this.characterId;
  }

  async getBalance() {
    return this.provider.getBalance(this.delegateWallet.address);
  }

  // @TODO: better estimation
  async reserveGas({ limit = 400000, gasPrice = null }) {
    if (gasPrice === null) {
      const chainId = await this.provider.send('eth_chainId', []);
      const configPrice = BigInt(config(chainId).gasPrice);
      const feeData = await this.provider.getFeeData();
      // Use whichever is higher: network current price or configured minimum
      const networkPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
      gasPrice = networkPrice > configPrice ? networkPrice : configPrice;
    }
    const gasEstimate = BigInt(limit);
    const gasLimit = gasEstimate + 100000n; // BigInt addition

    const fee = gasPrice * gasLimit; // BigInt multiplication

    const balance = await this.getBalance();
    if (fee > balance) { // BigInt comparison
      throw new Error(`not enough balance, needed: ${fee}`);
    }

    return { gasLimit, gasPrice };
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

    const data = (await this.destinationContract[methodName].populateTransaction(...args)).data;
    const overrides = await this.reserveGas(options);

    const tx = await this.playerContract.callAsCharacter(
      this.destinationContract.target, // ethers v6: .target instead of .address
      overrides.gasLimit,
      data,
      overrides,
    );
    const oldWait = tx.wait.bind(tx);
    tx.wait = async () => {
      // ethers v6 throws CALL_EXCEPTION when receipt.status === 0
      // We need to catch that to extract the receipt and check the Call event for inner revert reasons
      let receipt;
      try {
        receipt = await oldWait();
      } catch (err) {
        // ethers v6 attaches receipt via Object.assign in makeError
        receipt = err.receipt || err.info?.receipt;
        if (!receipt) {
          // Fallback: fetch receipt from provider using the TX hash
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
      // Use plain object to avoid issues with ethers v6 read-only receipt properties
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
        // Outer TX reverted (e.g. not enough energy) — no logs emitted
        throw { reason: 'transaction reverted', receipt: result };
      } else if (result.logs.length === 0 && result.status !== 0) {
        // should not reach here
        throw { receipt: result };
      }
      log.debug('metatransaction receipt received', { tx, receipt: result });
      return result;
    };

    log.debug('sending metatransaction', {
      tx,
      methodName,
      args,
      delegate: this.delegateWallet.address,
      player: this.playerAddress,
      character: this.characterId,
    });

    return !options.wait ? tx : tx.wait();
  }
}

export default PlayerWallet;