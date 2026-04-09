/* eslint-disable no-shadow,no-console */
import { derived } from 'svelte/store';
import { getBytes, hexlify, zeroPadValue, toBeHex } from 'ethers';

import config from 'data/config';
import getDelegateKey from 'lib/delegateKey';
import characterChoice from 'stores/characterChoice';
import preDungeon from 'stores/preDungeon';
import wallet from 'stores/wallet';
import { fetchCache } from 'lib/cache';
import { coordinatesToLocation } from 'utils/utils';

const uint256 = number => zeroPadValue(toBeHex(number), 32);

const gasPrice = toBeHex(BigInt('1000000000'));

let lastWalletAddress;

let $data = { status: 'None' };
window.$preDungeonCheck = $data;

const store = derived(
  wallet,
  async ($wallet, set) => {
    const _set = obj => {
      $data = { ...$data, ...obj };
      console.log('pre dungeon check', $data);
      set($data);
    };

    if ($wallet.status === 'Ready') {
      if (lastWalletAddress !== $wallet.address) {
        lastWalletAddress = $wallet.address;
        _set({ status: 'Loading' });
        const delegateAccount = getDelegateKey($wallet.address);

        const checkCharacter = async () => {
          const characterId = await wallet.call('Player', 'getLastCharacterId', $wallet.address);
          const isDelegateReady = await wallet.call(
            'Player',
            'isDelegateFor',
            delegateAccount.address,
            $wallet.address,
          );
          const result = await wallet.call('Characters', 'fullOwnerOf', characterId);
          const dungeonAddress = wallet.getContract('Dungeon').target;
          const isCharacterInDungeon = result.owner.toLowerCase() === dungeonAddress.toLowerCase();
          const balance = await wallet.getProvider().getBalance($wallet.address);
          // TODO should be free
          const insufficientBalance = false;
          return { characterId, isDelegateReady, isCharacterInDungeon, insufficientBalance };
        };

        const { characterId, isDelegateReady, isCharacterInDungeon, insufficientBalance } = await checkCharacter();

        let characterInfo;
        const { price } = config($wallet.chainId);
        let refill = price;
        try {
          characterInfo = await fetchCache(`characters/${characterId}`);
        } catch (e) {
          console.log('failed to fetch character info from cache, using default');
          // Fallback quand le cache n'est pas disponible
          characterInfo = {
          characterName: 'TestHero',
          stats: { characterClass: 0 },
          status: { status: 'alive' },
        }; 
        }

        let ressurectedId;
        if (characterInfo && !isCharacterInDungeon && characterInfo.status.status === 'dead') {
          const { Dungeon } = window.contracts; // TODO get contract elsewhere
          const topic = Dungeon.interface.getEvent('Resurrect').topicHash;
          const [ressurect] = await Dungeon.queryFilter({
            address: Dungeon.target,
            topics: [topic, uint256(characterId)],
          });
          if (ressurect) {
            ressurectedId = ressurect.args.newCharacterId;
          }
        }

        _set({
          status: 'Done',
          isDelegateReady,
          isCharacterInDungeon,
          characterId,
          characterInfo,
          ressurectedId,
          refill,
          insufficientBalance,
        });

        if (isCharacterInDungeon) {
          preDungeon.clear();
          characterChoice.clear();
        }

        store.checkBackIn = async value => {
          const gasEstimate = toBeHex(BigInt(4000000));
          _set({ status: 'SigningBackIn', delegateAccount });

          try {
            // addDelegate calls _refill (adds ETH to energy) then _addDelegate (deducts CONTRACT_MIN_BALANCE).
            // Send exactly what's needed to cover the delegate cost — energy is capped at MAX_FOOD
            // (== price on current chains), so sending more would just be refunded by the contract
            // and confuses the user. Target: energy >= CONTRACT_MIN_BALANCE before deduction.
            const CONTRACT_MIN_BALANCE = BigInt(config($wallet.chainId).contractMinBalance);
            const [onChainEnergy] = await wallet.call('Player', 'getEnergy', $wallet.address);
            const currentEnergy = BigInt(onChainEnergy.toString());
            const needed = currentEnergy < CONTRACT_MIN_BALANCE
              ? CONTRACT_MIN_BALANCE - currentEnergy
              : BigInt(0);

            const valueToSend = needed > 0n ? toBeHex(needed) : '0x0';
            const txOpts = { gas: gasEstimate, gasPrice };
            if (BigInt(valueToSend) > BigInt(0)) txOpts.value = valueToSend;

            // Single atomic tx: addDelegate is payable and calls _refill internally.
            // Energy lost here will be topped up right after by the auto UBF claim
            // (triggered in stores/dungeon.js as soon as the dungeon finishes loading).
            console.log('Adding delegate...', {
              currentEnergy: currentEnergy.toString(),
              needed: needed.toString(),
              valueToSend,
            });
            const tx = await wallet.tx(txOpts, 'Player', 'addDelegate', delegateAccount.address);
            await tx.wait();
            console.log('Delegate added!');
          } catch (e) {
            _set({ status: 'Error', error: { code: 'checkBackIn', message: e.toString(), e, wallet } });
            return;
          }

          const { isDelegateReady, isCharacterInDungeon, insufficientBalance } = await checkCharacter();
          _set({
            status: 'Done',
            isDelegateReady,
            isCharacterInDungeon,
            insufficientBalance,
          });
        };

        store.enter = async ({ ressurectedId, characterInfo }) => {
          const { location } = await fetchCache('entry');
          await wallet
            .tx(
              { gas: toBeHex(BigInt(2000000)), gasPrice },
              'Player',
              'enter',
              '0x0000000000000000000000000000000000000000',
              ressurectedId,
              '0',
              characterInfo.characterName,
              '0',
              location || coordinatesToLocation('0,0'),
            )
            .then(tx => tx.wait());
          const { isDelegateReady, isCharacterInDungeon, insufficientBalance } = await checkCharacter();
          _set({
            status: 'Done',
            isDelegateReady,
            isCharacterInDungeon,
            insufficientBalance,
          });
        };

        store.join = async ({ name, characterClass }) => {
          _set({ status: 'Joining' });
          const gasEstimate = toBeHex(BigInt(2000000));
          const { price } = config($wallet.chainId);
          const value = toBeHex(BigInt(price));

          let location;
          try {
            const entryData = await fetchCache('entry');
            location = entryData.location;
            if (!location) {
              console.warn('No entry location in response, using default 0,0');
              location = coordinatesToLocation('0,0');
            }
          } catch (e) {
            console.warn('Failed to fetch entry location, using default 0,0');
            location = coordinatesToLocation('0,0');
          }

          // Single TX: createAndEnter is payable — _enter() calls _refill() with excess msg.value,
          // then _addDelegate() to set up the delegate. No separate refill() needed.
          console.log('Creating character and entering dungeon (single TX)...');
          const tx = await wallet.tx(
            { gas: gasEstimate, gasPrice, value },
            'Player',
            'createAndEnter',
            delegateAccount.address,
            BigInt(0),
            name,
            Number(characterClass),
            BigInt(location),
          );
          const receipt = await tx.wait();
          console.log('gas used for join', receipt.gasUsed.toString());

          const { isCharacterInDungeon, isDelegateReady } = await checkCharacter();

          if (isCharacterInDungeon) {
            preDungeon.clear();
            characterChoice.clear();
          }
          _set({
            firstTime: true,
            status: 'Done',
            isDelegateReady,
            isCharacterInDungeon,
          });
        };
      }
    } else {
      lastWalletAddress = null;
      _set({ status: 'None' });
    }
  },
  $data,
);

export default store;