import { derived } from 'svelte/store';
import { Wallet, formatUnits } from 'ethers';

import wallet from 'stores/wallet';
import log from 'utils/log';
import { rebuildLocationHash } from 'utils/web';

const hashParams = window.hashParams || {};
const claimKey = hashParams.dungeonKey;
const clearClaimKey = () => {
  delete hashParams.dungeonKey;
  rebuildLocationHash(hashParams);
  hashParams.dungeonKey = claimKey; // keep it in memory
};

let $claim = {
  status: claimKey ? 'Loading' : 'None',
  claimKey,
};
window.$claim = $claim;

let claimWallet;
const store = derived(
  wallet,
  async ($wallet, set) => {
    const _set = obj => {
      $claim = { ...$claim, ...obj };
      log.info('CLAIM', JSON.stringify($claim, null, '  '));
      set($claim);
    };

    const gasPrice = BigInt('1000000000');
    const gasLimit = BigInt(21000);
    const gasFee = gasLimit * gasPrice;
    const extraValue = BigInt('100000000000000');
    const minimum = gasFee + extraValue;
    const maximum = BigInt('4000000000000000000');

    if (claimKey && typeof $claim.rawBalance === 'undefined') {
      try {
        claimWallet = new Wallet(claimKey);
        const provider = wallet.getFallbackProvider();
        if (provider) {
          (async () => {
            let claimBalance = await wallet.getFallbackProvider().getBalance(claimWallet.address);
            if (claimBalance < minimum) {
              claimBalance = BigInt(0);
            }
            if (claimBalance > maximum) {
              claimBalance = maximum;
            }
            // eslint-disable-next-line no-console
            console.log({
              address: claimWallet.address,
              status: 'WaitingWallet',
              rawBalance: claimBalance,
              balance: formatUnits(claimBalance, 18),
            });
            _set({
              status: 'WaitingWallet',
              rawBalance: claimBalance,
              balance: formatUnits(claimBalance, 18),
            });
          })();
        }
      } catch (e) {
        const claimBalance = BigInt(0);
        _set({
          status: 'WaitingWallet',
          rawBalance: claimBalance,
          balance: formatUnits(claimBalance, 18),
        });
      }
    }

    async function claim() {
      _set({ status: 'Loading' });
      const provider = wallet.getProvider();

      let claimingTxHash;
      const localStorageKeyForClaimTxHash = `${$wallet.address}_${$wallet.chainId}_claimTxHash`;
      try {
        claimingTxHash = localStorage.getItem(localStorageKeyForClaimTxHash);
      } catch (err) {
        //
      }

      if (claimingTxHash && claimingTxHash !== '') {
        _set({ status: 'WaitingOldTx' });

        const tx = await provider.getTransaction(claimingTxHash);
        if (tx) {
          const receipt = await tx.wait();
          if (tx.blockNumber) {
            if (receipt.status === 1) {
              _set({ status: 'Claimed' });
              clearClaimKey();
              return;
            }
            _set({ status: 'Failed' });
          } else {
            const txReceipt = await tx.wait();
            if (txReceipt.status === 1) {
              _set({ status: 'Claimed' });
              clearClaimKey();
              return;
            }
            _set({ status: 'Failed' });
          }
        } else {
          log.trace(`cannot find tx ${claimingTxHash}`);
        }
      }

      const claimBalance = await provider.getBalance(claimWallet.address);
      log.trace({ claimBalance });

      const claimValue = BigInt('5000000000000000000');
      if (claimBalance >= minimum) {
        const signer = claimWallet.connect(provider);
        let value = claimBalance - gasFee;
        const maxValue = BigInt(claimValue);
        if (value > maxValue) {
          value = maxValue;
        }
        _set({ status: 'Claiming' });

        const tx = await signer.sendTransaction({
          to: $wallet.address,
          value,
          gasLimit,
          gasPrice,
        });
        localStorage.setItem(localStorageKeyForClaimTxHash, tx.hash);
        _set({ status: 'WaitingTx' });

        const receipt = await tx.wait();
        if (receipt.status === 1) {
          _set({ status: 'Claimed' });
          clearClaimKey();
          return;
        }
        _set({ status: 'Failed' });
      } else {
        _set({ status: 'Gone' });
      }
      clearClaimKey();
    }

    store.claim = claim;
    store.acknowledge = () => {
      _set({ status: 'None' });
    };
  },
  $claim,
);

export default store;