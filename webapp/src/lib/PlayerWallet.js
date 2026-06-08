/* eslint-disable no-throw-literal */
import { getBytes, hexlify, AbiCoder, toBeHex } from 'ethers';
import log from '../utils/log';
import config from '../data/config';

const defaultAbiCoder = AbiCoder.defaultAbiCoder();

// Game txs go through the delegate burner (signs without a MetaMask popup).
// The contract refunds the burner from the player's _playerEnergy on every
// successful callAsCharacter, so the burner stays funded as long as it had
// enough gas to land the previous tx.
//
// If the burner ever drops below the next-tx fee (e.g. the player let it sit
// idle, or the previous refund failed), we surface ONE popup: a refillAccount
// from the main wallet, refilling the burner to a comfortable buffer. Then we
// retry the original tx (now signed by the burner, no popup). This avoids the
// silent lockout that plagued the previous burner-only design.
class PlayerWallet {
  constructor({ playerContract, destinationContract, playerAddress, delegateWallet, walletStore, characterId }) {
    this.characterId = characterId;
    this.playerAddress = playerAddress;
    this.destinationContract = destinationContract;
    this.delegateWallet = delegateWallet;
    this.walletStore = walletStore;
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

  async _resolveGasPrice(opt) {
    if (opt !== null && opt !== undefined) return BigInt(opt);
    const chainId = await this.provider.send('eth_chainId', []);
    const configPrice = BigInt(config(chainId).gasPrice);
    const feeData = await this.provider.getFeeData();
    const networkPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
    return networkPrice > configPrice ? networkPrice : configPrice;
  }

  async computeOverrides({ limit = 800000, gasPrice = null }) {
    // Inner call needs headroom: a single move() can chain _actualiseRoom on
    // both source and destination, _blockHashRegister.request() for monster
    // commit-reveal, area generation on first visit, and external calls to
    // Rooms/Characters/Elements. 400k was tight enough that destination-actualise
    // moves on Base Sepolia hit the cap and reverted with the opaque
    // "missing revert data" (require(success, "call failed") inside
    // callAsCharacter, with revert data dropped by the RPC).
    const innerGasLimit = BigInt(limit);
    const txGasLimit = innerGasLimit + 300000n;
    const resolvedGasPrice = await this._resolveGasPrice(gasPrice);
    return { innerGasLimit, txGasLimit, gasPrice: resolvedGasPrice };
  }

  // Top up the delegate burner from the main wallet via a plain ETH transfer.
  // We deliberately bypass Player.refillAccount: that path routes value through
  // _refill which is capped at MAX_FOOD energy headroom, so a player whose
  // energy is already near max would see most of the deposit refunded back
  // and the burner barely topped up. A direct send is simpler and predictable.
  async _refillBurnerFromMainWallet(neededFee) {
    if (!this.walletStore || !this.walletStore.getSigner) {
      throw new Error('burner empty and no main wallet available to refill');
    }
    const signer = this.walletStore.getSigner();
    if (!signer) {
      throw new Error('main wallet signer unavailable');
    }
    const provider = (this.walletStore.getProvider && this.walletStore.getProvider()) || this.provider;
    const chainId = await provider.send('eth_chainId', []);
    const minBalance = BigInt(config(chainId).contractMinBalance);
    // Aim for ~50 moves of headroom per refill. neededFee already reflects
    // current gas (gasPrice × txGasLimit), so neededFee × 50 scales with
    // network conditions. Keep a minBalance × 10 floor in case neededFee is
    // unusually low (e.g. gas floor not yet hit on cold start). The previous
    // 4× multiplier only bought ~7 moves on Base Sepolia, which surfaced a
    // main-wallet popup every few moves and broke the "burner is invisible"
    // promise. The contract's callAsCharacter refund branch still tops the
    // burner up between refills, so this is purely a fallback runway.
    const feeBased = neededFee * 50n;
    const floor = minBalance * 10n;
    const targetTopup = feeBased > floor ? feeBased : floor;
    log.info('[burner-refill] funding delegate from main wallet', {
      delegate: this.delegateWallet.address,
      targetTopup: targetTopup.toString(),
    });
    const tx = await signer.sendTransaction({
      to: this.delegateWallet.address,
      value: targetTopup,
    });
    await tx.wait();
    log.info('[burner-refill] done');
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
    const overrides = await this.computeOverrides(options);
    const fee = overrides.gasPrice * overrides.txGasLimit;

    // If the burner can't cover this tx, refill from main wallet (1 popup) then continue.
    let balance = await this.getBalance();
    if (fee > balance) {
      try {
        await this._refillBurnerFromMainWallet(fee);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('burner refill failed', e);
        const detail = e.reason || e.shortMessage || e.message || e;
        const insufficient = /insufficient funds/i.test(String(detail));
        throw {
          reason: insufficient
            ? 'your main wallet is out of ETH to fund game actions — please top it up and try again'
            : `could not fund the game wallet: ${detail}`,
          _refillFailure: true,
        };
      }
      // The refill tx is mined, but on Base Sepolia (and other public RPCs) an
      // immediate eth_getBalance can still hit a node that hasn't applied the
      // new block yet, returning the *pre-refill* (empty) balance. A single read
      // here would then abort a move that is actually fully funded. Retry a few
      // times — same mitigation as waitFor() in stores/preDungeonCheck.js — and
      // only give up if the balance is still short after the RPC caught up.
      for (let i = 0; i < 8 && fee > balance; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 400));
        // eslint-disable-next-line no-await-in-loop
        balance = await this.getBalance();
      }
      if (fee > balance) {
        // Reaching here means the top-up tx succeeded (otherwise _refillBurner…
        // would have thrown above) yet the burner still looks underfunded after
        // several retries — almost always a lagging RPC rather than a real
        // shortfall. Surface a message the player can act on.
        throw {
          reason:
            'wallet sync delay: your action funded the game wallet but the network '
            + 'is slow to confirm the balance. Please wait a few seconds and try again.',
          _refillStale: true,
        };
      }
    }

    // Pre-flight: simulate the full callAsCharacter to surface revert reasons
    // before spending gas on-chain.  Catches inner-call errors (monster
    // blocking, can't move, etc.) AND outer errors (energy, delegate, ETH
    // balance) that would otherwise appear as opaque "missing revert data".
    try {
      const outerData = this.playerContract.interface.encodeFunctionData(
        'callAsCharacter',
        [this.destinationContract.target, overrides.innerGasLimit, data],
      );
      await this.provider.call({
        to: this.playerContract.target,
        data: outerData,
        from: this.delegateWallet.address,
        gasLimit: overrides.txGasLimit,
      });
    } catch (simErr) {
      let simReason =
        simErr.reason || simErr.revert?.args?.[0] || simErr.shortMessage || simErr.message;
      // If the outer simulation only says "call failed", replay the inner
      // call directly to get the underlying revert reason.
      if (simReason === 'call failed' || (simReason && simReason.includes('missing revert data'))) {
        try {
          await this.provider.call({
            to: this.destinationContract.target,
            data,
            from: this.playerContract.target,
            gasLimit: overrides.innerGasLimit,
          });
        } catch (innerSimErr) {
          const innerReason =
            innerSimErr.reason || innerSimErr.revert?.args?.[0] || innerSimErr.shortMessage || innerSimErr.message;
          if (innerReason && innerReason !== 'call failed' && !innerReason.includes('missing revert data')) {
            simReason = innerReason;
          }
        }
      }
      // eslint-disable-next-line no-console
      console.warn('metatx pre-flight reverted method=', methodName, 'reason=', simReason, 'args=', args);
      throw { reason: simReason || 'pre-flight simulation failed', _preflight: true };
    }

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
        // Try to replay the inner call directly to surface the real revert
        // reason. Previously this only ran when outerReason was exactly
        // "call failed", but RPC nodes (especially on L2s) often return
        // empty revert data, producing "missing revert data" from ethers.
        if (outerReason === 'call failed' || outerReason === 'transaction reverted'
            || (outerReason && outerReason.includes('missing revert data'))) {
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
            if (innerReason && innerReason !== 'call failed' && !innerReason.includes('missing revert data')) {
              outerReason = innerReason;
            }
          }
        }
        // Dump on-chain state to identify silent value-transfer reverts.
        // If outerReason is "missing revert data" but the tx used ~450k gas
        // and emitted no logs, the most likely cause is the
        // _pool.recordCharge{value: poolFee} call failing because the Player
        // contract's actual ETH balance is below poolFee.
        let diag = {};
        try {
          const [contractBalance, energyResult, delegateBalance] = await Promise.all([
            this.provider.getBalance(this.playerContract.target),
            this.playerContract.getEnergy(this.playerAddress).catch(() => null),
            this.provider.getBalance(this.delegateWallet.address),
          ]);
          diag = {
            playerContractAddress: this.playerContract.target,
            playerContractEthBalance: contractBalance.toString(),
            playerEnergy: energyResult ? energyResult.toString() : '(unavailable)',
            delegateAddress: this.delegateWallet.address,
            delegateEthBalance: delegateBalance.toString(),
            txGasPrice: result.gasPrice ? result.gasPrice.toString() : null,
            txGasUsed: result.gasUsed ? result.gasUsed.toString() : null,
          };
        } catch (e) {
          diag = { diagFailed: e.message };
        }
        // eslint-disable-next-line no-console
        console.warn(
          'metatx reverted method=', methodName,
          'reason=', outerReason,
          'hash=', tx.hash,
          'args=', args,
          'diag=', diag,
          'basescan=', `https://sepolia.basescan.org/tx/${tx.hash}`,
        );
        throw { reason: outerReason, receipt: result };
      } else if (result.logs.length === 0 && result.status !== 0) {
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
