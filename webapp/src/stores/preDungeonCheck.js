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
        const { minBalance } = config($wallet.chainId);
        let refill = minBalance;
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
            // Étape 1: Refill d'abord
            console.log('Step 1: Refilling energy...');
            const refillTx = await wallet.tx(
              { gas: gasEstimate, gasPrice, value },
              'Player',
              'refill',
            );
            await refillTx.wait();
            console.log('Refill done!');

            // Étape 2: Ajouter le delegate (sans value cette fois)
            console.log('Step 2: Adding delegate...');
            const tx = await wallet.tx(
              { gas: gasEstimate, gasPrice },
              'Player',
              'addDelegate',
              delegateAccount.address,
            );
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

          // Étape 1: Refill (acheter de l'énergie) d'abord
          console.log('Step 1: Refilling energy...');
          const refillTx = await wallet.tx(
            { gas: gasEstimate, gasPrice, value },
            'Player',
            'refill',
          );
          await refillTx.wait();
          console.log('Refill done!');

          // Étape 2: Créer et entrer dans le dungeon (sans paiement cette fois)
          console.log('Step 2: Creating character and entering dungeon...');
          console.log('DEBUG createAndEnter args:', {
            delegate: delegateAccount.address,
            value: "0",
            name: name,
            characterClass: characterClass,
            characterClassType: typeof characterClass,
            location: location,
            locationType: typeof location,
          });
          const tx = await wallet.tx(
            { gas: gasEstimate, gasPrice },
            'Player',
            'createAndEnter',
            delegateAccount.address,
            BigInt(0),
            name,
            Number(characterClass),
            BigInt(location),
          );
          const receipt = await tx.wait();
          console.log({ receipt });
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