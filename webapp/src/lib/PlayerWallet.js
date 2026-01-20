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
      gasPrice = BigInt(config(chainId).gasPrice);
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
      const receipt = await oldWait();
      receipt.methodName = methodName;
      receipt.args = args;
      if (receipt.logs && receipt.logs.length > 0) {
        const callEvent = receipt.logs.find((log) => log.fragment?.name === 'Call');
        if (callEvent && !callEvent.args.success) {
          const bytes = getBytes(callEvent.args[1]);
          if (hexlify(bytes.slice(0, 4)) === '0x08c379a0') {
            const reason = defaultAbiCoder.decode(['string'], bytes.slice(4));
            throw { reason: reason[0], receipt };
          }
          throw { receipt, errorData: callEvent.args[1] };
        } else if (callEvent) {
          // eslint-disable-next-line prefer-destructuring
          receipt.returnData = callEvent.args[1];
        }
      } else {
        // should not reach here
        throw { receipt };
      }
      log.debug('metatransaction receipt received', { tx, receipt });
      return receipt;
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