import * as ethers from 'ethers';
import * as Sentry from '@sentry/browser';
import nprogress from 'nprogress';

import Cache from 'lib/cache';
import log from 'utils/log';
import PlayerWallet from 'lib/PlayerWallet';
import { locationToCoordinates, coordinatesToLocation } from 'utils/utils';
import { escapeHtml } from 'utils/text';
import { notificationOverlay } from 'stores/screen';
import cacheUrl from 'lib/cacheUrl';
import { get } from 'svelte/store';

const config = require('../data/config');

const DIRECTIONS = { '0': {}, '1': {}, '-1': {} };
DIRECTIONS[0][1] = 'north';
DIRECTIONS[1][0] = 'west';
DIRECTIONS[0][-1] = 'south';
DIRECTIONS[-1][0] = 'east';

const REVERSE = {
  north: 'south',
  south: 'north',
  west: 'east',
  east: 'west',
};

class Dungeon {
  constructor({ ethersProvider, wallet, contract, playerContract, transferer, ubf }) {
    this.provider = ethersProvider;
    this.wallet = wallet; // to perform tx on behalf of current user
    // En ethers v6, .target remplace .address, et les contrats sont déjà créés
    this.contract = contract.target ? contract : new ethers.Contract(contract.address, contract.abi, this.provider);
    this.playerContract = playerContract.target ? playerContract : new ethers.Contract(playerContract.address, playerContract.abi, this.provider);
    this.transferer = transferer.target ? transferer : new ethers.Contract(transferer.address, transferer.abi, this.provider);
    this.ubf = ubf.target ? ubf : new ethers.Contract(ubf.address, ubf.abi, this.provider);
  }

  static moveToDirection({ from, to }) {
    const [ax, ay] = from.split(',').map(Number);
    const [bx, by] = to.split(',').map(Number);
    const dx = ax - bx;
    const dy = ay - by;
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      throw new Error(`cannot determine direction of move from ${from} to ${to}`);
    }
    return DIRECTIONS[dx][dy];
  }

  static reverseDirection(direction) {
    return REVERSE[direction];
  }

  async init(player, delegatePrivateKey, wallet) {
    if (this.initializing) {
      throw new Error('cannot initialised Dungeon twice');
    }
    log.info('initializing...');
    this.initializing = true;

    this.player = player;
    this.delegateWallet = new ethers.Wallet(delegatePrivateKey, this.provider);
    this.contract = this.contract.connect(this.delegateWallet);
    this.transferer = this.transferer.connect(this.delegateWallet);
    this.ubf = this.ubf.connect(this.delegateWallet);

    this.playerWallet = new PlayerWallet({
      playerContract: this.playerContract,
      destinationContract: this.contract,
      playerAddress: this.player,
      delegateWallet: this.delegateWallet,
      walletStore: wallet,
    });

    this.transferWallet = new PlayerWallet({
      playerContract: this.playerContract,
      destinationContract: this.transferer,
      playerAddress: this.player,
      delegateWallet: this.delegateWallet,
      walletStore: wallet,
    });

    this.ubfWallet = new PlayerWallet({
      playerContract: this.playerContract,
      destinationContract: this.ubf,
      playerAddress: this.player,
      delegateWallet: this.delegateWallet,
      walletStore: wallet,
    });

    const network = await this.provider.getNetwork();
    const chainId = network.chainId.toString();
    const gasPrice = BigInt(config(chainId).gasPrice);
    this.defaultOpts = {
      gas: 4000000,
      gasPrice,
    };

    const characterId = await wallet.call('Player', 'getLastCharacterId', player);
    this.character = characterId.toString();
    this.cache = new Cache(await cacheUrl, this.character, this);

    // @TODO remove debug
    window.cache = this.cache;

    await this.cache.init();
    this.initializing = false;
    log.info('initialized');
  }

  async notifyOnError(metatx) {
    let tx;
    try {
      tx = await metatx;
      await tx.wait();
    } catch (err) {
      // Emit a serializable error object (ethers v6 receipts contain BigInt which JSON.stringify can't handle)
      try {
        this.cache.socket.emit('metatx-error', {
          reason: err.reason || err.message || 'unknown error',
          hash: err.receipt?.hash || tx?.hash,
        });
      } catch (emitErr) {
        // eslint-disable-next-line no-console
        console.warn('failed to emit metatx-error', emitErr);
      }
      // eslint-disable-next-line no-console
      console.error('tx failed reason=', err.reason || '(no reason)', 'hash=', err.receipt?.hash || tx?.hash || '(no hash)', 'errorData=', err.errorData || '(none)', 'fullErr=', err);
      Sentry.captureException(err, {
        tags: { metatx: err.reason },
        extra: { hash: err.receipt?.hash || tx?.hash },
      });
      throw err;
    }
  }

  // @TODO handle transaction errors
  async equip(gear) {
    const slotNum = { attack: 0, defense: 1 };
    const { id, slotType } = gear;
    const slot = slotNum[slotType];
    return nprogress.observe(
      this.notifyOnError(this.playerWallet.tx('multiEquip', this.character, [id], [slot])),
      this.cache.onceEquipped(gear),
    );
  }

  async recycle(gearIds) {
    const [first] = gearIds;
    return nprogress.observe(
      this.playerWallet.tx('recycle', this.character, gearIds).then(tx => tx.wait()),
      this.cache.once(
        'gear-removed',
        ({ character, gearId }) => character === this.character && gearId.toString() === first,
      ),
    );
  }

  async levelUp(newLevel) {
    return nprogress.observe(
      this.playerWallet.tx('levelUp', this.character).then(tx => tx.wait()),
      this.cache.onceLevelUp(newLevel),
    );
  }

  async refill(value) {
    // @TODO: gas price
    const txPromise = this.wallet
      .tx({ ...this.defaultOpts, value }, 'Player', 'refill')
      .then(tx => tx.wait());
    return nprogress.observe(this._waitForRefill(txPromise, this.cache.onceRefill()));
  }

  // FoodScreen.refill awaits this through nprogress.observe, and the Refill
  // button stays on its "Refilling..." loading state until it settles. The
  // backend's 'refill' socket event (carrying fresh character info) is the
  // normal completion signal, but it can be missed — socket reconnect,
  // indexer lag — and then `onceRefill` never resolves, freezing the button
  // forever. Same failure mode as the move hang fixed in _waitForMove: once
  // the refill tx confirms on-chain the energy has landed, so give the event
  // a short grace window then fall back to re-fetching character info.
  _waitForRefill(txPromise, refilledPromise, fallbackMs = 4000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = (v) => { if (!settled) { settled = true; resolve(v); } };
      const ko = (e) => { if (!settled) { settled = true; reject(e); } };
      refilledPromise.then(ok);
      txPromise.then(() => {
        const t = setTimeout(async () => {
          try {
            await this.cache.fetchAndApplyCharacterInfo();
            this.cache.calculateReachableRooms();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('refill fallback resync failed', e);
          }
          ok({ fallback: true });
        }, fallbackMs);
        refilledPromise.finally(() => clearTimeout(t));
      }).catch(ko);
    });
  }

  async move(direction) {
    const txPromise = this.notifyOnError(this.playerWallet.tx('move', this.character, direction));
    const movedPromise = this.cache.onceMoved();
    return this._waitForMove(txPromise, movedPromise);
  }

  async movePath(path) {
    const txPromise = this.notifyOnError(this.playerWallet.tx('movePath', this.character, path));
    const movedPromise = this.cache.onceMoved();
    return this._waitForMove(txPromise, movedPromise);
  }

  // Off-chain movement between already-discovered rooms. No transaction is
  // signed: the backend validates the path, updates position and emits the
  // 'move' event the cache already listens for. Used for plain exploration;
  // discovery and locked doors still go on-chain (see cache.move).
  async walk(directions) {
    // Register the move listener before emitting so a fast off-chain reply
    // can't dispatch the 'move' broadcast before we're listening for it.
    const movedPromise = this.cache.onceMoved();
    const replyPromise = this.cache.action('walk', { path: directions });
    return this._waitForWalk(replyPromise, movedPromise);
  }

  _waitForWalk(replyPromise, movedPromise, fallbackMs = 4000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = (v) => { if (!settled) { settled = true; resolve(v); } };
      const ko = (e) => { if (!settled) { settled = true; reject(e); } };
      movedPromise.then(ok);
      replyPromise.then(reply => {
        if (reply && reply.error) {
          ko(new Error(reply.error));
          return;
        }
        // The backend acknowledged; if the 'move' broadcast was missed (socket
        // reconnect, listener race) resync after a short grace window so the
        // caller never hangs — same failure mode handled in _waitForMove.
        const t = setTimeout(async () => {
          try {
            await this.cache.resyncAfterMove();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('walk fallback resync failed', e);
          }
          ok({ fallback: true });
        }, fallbackMs);
        movedPromise.finally(() => clearTimeout(t));
      }).catch(ko);
    });
  }

  // On-chain discovery of an undiscovered room, decoupled from movement. The
  // character is treated as standing in the already-discovered `fromCoordinates`
  // (the backend has walked them there off-chain); the contract validates the
  // exit, burns fragments, mints the Room NFT and arms the monster seed.
  async discoverAt(fromCoordinates, direction) {
    const fromLocation = coordinatesToLocation(fromCoordinates);
    const txPromise = this.notifyOnError(this.playerWallet.tx('discoverAt', this.character, fromLocation, direction));
    const movedPromise = this.cache.onceMoved();
    return this._waitForMove(txPromise, movedPromise);
  }

  async teleport(location) {
    console.log(`teleporting to ${location}`);
    const txPromise = this.notifyOnError(this.playerWallet.tx('teleport', this.character, coordinatesToLocation(location)));
    const movedPromise = this.cache.onceMoved();
    return this._waitForMove(txPromise, movedPromise);
  }

  // The 'move' socket event is the fast path: backend emits roomUpdates,
  // statusUpdates, characterInfo in one shot and the cache reactively
  // re-renders. But it can be missed — socket reconnect, indexer lag, event
  // dispatched before our listener attached — and awaiting onceMoved alone
  // hangs the caller forever in that case. MapRenderer._move does
  // `await cache.move(...)` and leaves `myCharacter.moving = true` until it
  // resolves, so a missed event produces exactly the symptom we're chasing:
  // walking animation looping + room clicks ignored until full reload.
  //
  // Once the tx confirms on-chain we know the move happened, so we give the
  // socket a short grace window for the event; if it still hasn't arrived,
  // resync state from the backend and resolve manually.
  _waitForMove(txPromise, movedPromise, fallbackMs = 4000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = (v) => { if (!settled) { settled = true; resolve(v); } };
      const ko = (e) => { if (!settled) { settled = true; reject(e); } };
      movedPromise.then(ok);
      txPromise.then(() => {
        const t = setTimeout(async () => {
          try {
            await this.cache.resyncAfterMove();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('move fallback resync failed', e);
          }
          ok({ fallback: true });
        }, fallbackMs);
        movedPromise.finally(() => clearTimeout(t));
      }).catch(ko);
    });
  }

  // Movement is off-chain, so the on-chain character location lags behind the
  // real room until a discovery / locked-door / teleport. Item transactions
  // (scavenge, pick, drop) sent straight from the player wallet read the
  // on-chain location to find the player's room, so they revert with "need to
  // be in same room" after a plain off-chain walk. Ask the backend to resync the
  // on-chain position first — idempotent, no transaction when already in sync.
  async _syncPosition() {
    // Bounded wait: the backend may need to mine a setCharacterPosition tx, but
    // if its RPC is being throttled (Alchemy CU limit) the reply can never come.
    // Time out instead of leaving the scavenge/pick button hung forever.
    const reply = await this.cache.action('sync-position', undefined, { timeoutMs: 30000 });
    if (reply && reply.error) {
      throw new Error(reply.error);
    }
  }

  // Surface an otherwise-swallowed action failure to the player. Without this a
  // failed scavenge (e.g. position resync stalled on RPC rate-limiting) looked
  // like "I clicked but nothing happened".
  _notifyActionError(title, err) {
    const reason =
      err?.reason || err?.shortMessage || (err?.message && err.message.slice(0, 120)) || 'Unknown error';
    notificationOverlay.open('generic', { text: `<em>${title}:</em> ${escapeHtml(reason)}`, timeout: 8000 });
  }

  async scavengeGear(character, id) {
    try {
      await this._syncPosition();
      await nprogress.observe(
        this.transferWallet.tx('scavengeGear', this.character, character, id).then(tx => tx.wait()),
      );
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('scavenging gear failed', err);
      this._notifyActionError('Scavenge failed', err);
      return false;
    }
  }

  async scavengeElements(character, type, amount) {
    try {
      await this._syncPosition();
      await nprogress.observe(
        this.transferWallet.tx('scavengeElements', this.character, character, type, amount).then(tx => tx.wait()),
      );
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('scavenging elements failed', err);
      this._notifyActionError('Scavenge failed', err);
      return false;
    }
  }

  /**
   * Request trade from character
   * @function
   * @param to {String,Number} - seller's character id
   * @param buyer {Object} - buyer's offer
   * @param seller {Object} - seller's items
   */
  async requestTrade(to, buyer, seller) {
    await nprogress.observe(
      this.cache.socket.emit('request-trade', { seller: to, deal: { buyer, seller } }),
      (async () => new Promise(resolve => this.cache.socket.once('trade', resolve)))(),
    );
  }

  /**
   * Seller accepts a trade request from a buyer
   * @function
   * @param buyer {String,Number} - buyer's character id
   */
  async acceptTradeRequest(buyer) {
    await nprogress.observe(
      this.cache.socket.emit('accept-trade-request', { buyer }),
      (async () => new Promise(resolve => this.cache.socket.once('trade', resolve)))(),
    );
  }

  /**
   * Buyer cancels a trade request with seller
   * @function
   * @param seller {String,Number} - seller's character id
   */
  async cancelTrade(seller) {
    await nprogress.observe(
      this.cache.socket.emit('cancel-trade', { seller }),
      (async () => new Promise(resolve => this.cache.socket.once('trade', resolve)))(),
    );
  }

  /**
   * Seller cancels a trade request from buyer
   * @function
   * @param buyer {String,Number} - buyer's character id
   */
  async denyTrade(buyer) {
    await nprogress.observe(
      this.cache.socket.emit('deny-trade', { buyer }),
      (async () => new Promise(resolve => this.cache.socket.once('trade', resolve)))(),
    );
  }

  /**
   * Proposed deal between buyer and seller.
   * In a coin-only trade, this will both propose and sell gear to buyer upon seller's proposal.
   * @function
   * @param buyer {String,Number} - buyer's character id
   * @param buyer {String,Number} - buyer's character id
   * @param deal {Object} - proposed deal. must include `{ buyer: { coins: # }, seller: { gear: [1, ...] } }`.
   */
  async proposeTrade(buyer, seller, deal) {
    await nprogress.observe(
      this.cache.socket.emit('propose-trade', { buyer, seller, deal }),
      (async () => new Promise(resolve => this.cache.socket.once('trade', resolve)))(),
    );
  }

  /**
   * Send a chat message to a room.
   * @function
   * @param message {Object} - message
   */
  async sendRoomMessage(message) {
    await this.cache.socket.emit('chat-message', message);
  }

  /**
   * Accept a quest
   * @function
   * @param id {String} - quest id
   */
  async acceptQuest(id) {
    await nprogress.observe(
      this.cache.socket.emit('accept-quest', { id }),
      (async () =>
        new Promise((resolve, reject) => {
          this.cache.socket.once('accept-quest-reply', resp => {
            resp.error ? reject(resp.error) : resolve(resp);
          });
        }))(),
    );
  }

  /**
   * Advance a quest's goal
   * @function
   * @param id {String} - quest id
   * @param data {Object} - quest goal data
   */
  async advanceQuest(id, data = {}) {
    await nprogress.observe(
      this.cache.socket.emit('advance-quest', { id, data }),
      (async () =>
        new Promise((resolve, reject) => {
          this.cache.socket.once('advance-quest-reply', resp => {
            resp.error ? reject(resp.error) : resolve(resp);
          });
        }))(),
    );
  }

  /**
   * Finish a quest
   * @function
   * @param id {String} - quest id
   * @param data {Object} - quest goal data
   */
  async finishQuest(id, data = {}) {
    await nprogress.observe(
      this.cache.socket.emit('claim-quest-reward', { id, data }),
      (async () =>
        new Promise((resolve, reject) => {
          this.cache.socket.once('claim-quest-reward-reply', resp => {
            resp.error ? reject(resp.error) : resolve(resp);
          });
        }))(),
    );
  }

  async addDelegate() {
    const gasEstimate = 4000000;
    return this.wallet.tx(
      { ...this.defaultOpts, gas: gasEstimate + 15000 },
      'Dungeon',
      'addDelegate',
      this.delegateWallet.address,
    );
  }

  async createNewCharacter(characterName, characterClass) {
    // eslint-disable-next-line no-console
    console.log('creating new character');
    return nprogress.observe(
      this.wallet
        .tx(
          { ...this.defaultOpts },
          'Player',
          'createAndEnter',
          '0x0000000000000000000000000000000000000000',
          '0',
          characterName,
          characterClass,
          await this.cache.entry(),
        )
        .then(tx => tx.wait()),
    );
  }

  async resurrect(characterName) {
    const fn = async () => {
      const receipt = await this.playerWallet.tx('resurrectFrom', this.character).then(tx => tx.wait());
      const { newCharacterId } = receipt.logs
        .map(item => {
          try {
            return this.contract.interface.parseLog(item);
          } catch (_) {
            return null;
          }
        })
        .filter(i => i)
        .filter(({ name }) => name === 'Resurrect')[0].args;
      // eslint-disable-next-line no-console
      console.log('resurrected character id', Number(newCharacterId));
      return this.wallet
        .tx(
          { ...this.defaultOpts },
          'Player',
          'enter',
          '0x0000000000000000000000000000000000000000',
          newCharacterId,
          '0',
          characterName,
          '0',
          await this.cache.entry(),
        )
        .then(tx => tx.wait());
    };
    return nprogress.observe(fn());
  }

  async heal(hp) {
    return nprogress.observe(this.playerWallet.tx('heal', this.character, hp).then(tx => tx.wait()));
  }

  async drop(gear) {
    await this._syncPosition();
    return nprogress.observe(
      this.transferWallet.tx('drop', this.character, gear.id).then(tx => tx.wait()),
      this.cache.once(
        'gear-removed',
        ({ character, gearId }) => character === this.character && gearId.toString() === gear.id,
      ),
    );
  }

  async pick(gearId) {
    await this._syncPosition();
    return nprogress.observe(this.transferWallet.tx('pick', this.character, gearId).then(tx => tx.wait()));
  }

  /**
   * convert items from object to array of items in required order:
   *  > [fire, air, electricity, earth, water, coins, keys, fragments]
   *
   *        { fire, air, electricity, earth, water, coins, keys, fragments }
   * @returns {number[]} resolutions means tx success, rejection fail
   * @param items
   */
  convertConsumablesToArray(items = {}) {
    const { fire = 0, air = 0, electricity = 0, earth = 0, water = 0, coins = 0, keys = 0, fragments = 0 } = items;
    return [fire, air, electricity, earth, water, coins, keys, fragments];
  }

  /**
   * transfer tokens (elements, coins, keys and fragments) to the current room
   *
   * @param amounts of different tokens to be transferred
   * @returns {Promise<void>} resolutions means tx success, rejection fail
   */
  async dropElements(amounts) {
    const elements = this.convertConsumablesToArray(amounts);
    if (elements.filter(Boolean).length === 0) {
      return;
    }
    console.log('dropping', elements);
    await this._syncPosition();
    return nprogress.observe(this.transferWallet.tx('dropElements', this.character, elements).then(tx => tx.wait()));
  }

  /**
   * transfers elements of particular type (id) from the current room
   *
   * this is not done as batch to work similar as scavenging from the corpse (one token type per tx)
   *
   * @param id of the token 1-5: elements 6: coins 7: keys 8: fragments
   * @param amount to be transferred
   * @returns {Promise<void>}
   */
  async pickElement(id, amount) {
    await this._syncPosition();
    return nprogress.observe(this.transferWallet.tx('pickElement', this.character, id, amount).then(tx => tx.wait()));
  }

  async recyclingReward(gears) {
    const cost = await this.wallet.call(
      'ReadOnlyDungeon',
      'recyclingReward',
      gears.map(gear => gear.bytes),
    );
    return Number(cost);
  }

  async carrierCost() {
    const cost = await this.wallet.call('ReadOnlyDungeon', 'carrierCost', this.cache.currentRoom.location);
    return Number(cost);
  }

  async sendGearsToVault(gearIds) {
    return nprogress.observe(
      this.transferWallet
        .tx('batchTransferGearOut', this.character, get(this.wallet).address, gearIds)
        .then(tx => tx.wait()),
    );
  }

  /**
   * transfers tokens (elements, coins, keys and fragments) to vault by carrier
   *
   * @param amounts of different tokens to be transferred
   * @returns {Promise<void>} resolutions means tx success, rejection fail
   */
  async sendElementsToVault(amounts) {
    const elements = this.convertConsumablesToArray(amounts);
    if (elements.filter(Boolean).length === 0) {
      return;
    }
    return nprogress.observe(
      this.transferWallet
        .tx('batchTransferElementsOut', this.character, get(this.wallet).address, elements)
        .then(tx => tx.wait()),
    );
  }

  /**
   * check whenever transfers by carrier from vault of Gears or Elements is approved
   *
   * @param nft contract approved - Gears or Elements
   * @returns {Promise<Boolean>} is approved?
   */
  async isCarrierApproved(nft = 'Gears') {
    return this.wallet.call(nft, 'isApprovedForAll', get(this.wallet).address, this.transferer.address);
  }

  /**
   * approves transfers from vault by carrier of Gears or Elements
   *
   * @param nft contract to be approved - Gears or Elements
   * @returns {Promise<*>} resolution
   */
  async approveCarrier(nft = 'Gears') {
    return this.wallet.tx(nft, 'setApprovalForAll', this.transferer.address, true).then(tx => tx.wait());
  }

  async retrieveGearsFromVault(gearIds) {
    return nprogress.observe(
      this.wallet.tx('DungeonTokenTransferer', 'batchTransferGearIn', this.character, gearIds).then(tx => tx.wait()),
    );
  }

  /**
   * transfers tokens (elements, coins, keys and fragments) from vault by carrier
   *
   * carrier has to be approved to facilitate this transfer
   *
   * this function triggers portis wallet signature request as this has to be triggered directly from wallet
   * and not as usual meta transaction
   *
   * @param amounts of different tokens to be transferred
   * @returns {Promise<void>} resolutions means tx success, rejection fail
   */
  async retrieveElementsFromVault(amounts) {
    const elements = this.convertConsumablesToArray(amounts);
    if (elements.filter(Boolean).length === 0) {
      return;
    }
    return nprogress.observe(
      this.wallet
        .tx('DungeonTokenTransferer', 'batchTransferElementsIn', this.character, elements)
        .then(tx => tx.wait()),
    );
  }

  /**
   * cost in fragments of the room discovery at coordinates
   *
   * @param coordinates
   * @returns {Promise<number>} fragments
   */
  async discoveryCost(coordinates) {
    const fragments = await this.wallet.call('ReadOnlyDungeon', 'discoveryCost', coordinatesToLocation(coordinates));
    return Number(fragments);
  }

  /**
   * dungeon has to be approved to transfer character coins from vault to pay for keeping rooms
   *
   * @param nft
   * @returns {Promise<*>}
   */
  async approveDungeon(nft = 'Elements') {
    return this.wallet.tx(nft, 'setApprovalForAll', this.contract.target, true).then(tx => tx.wait());
  }

  async isDungeonApproved(nft = 'Elements') {
    return this.wallet.call(nft, 'isApprovedForAll', get(this.wallet).address, this.contract.target);
  }

  /**
   * buys foreclosed room, fee is paid directly by character
   *
   * @returns {Promise<void>}
   */
  async buyRoom() {
    return nprogress.observe(this.playerWallet.tx('buyRoom', this.character).then(tx => tx.wait()));
  }

  /**
   * abandons room - transfers it to dungeon therefore foreclosing it
   *
   * @param coordinates
   * @returns {Promise<void>}
   */
  async abandonRoom(coordinates) {
    return nprogress.observe(
      this.playerWallet.tx('abandonRoom', this.character, coordinatesToLocation(coordinates)).then(tx => tx.wait()),
    );
  }

  /**
   * deactivates room - transfers it out of the dungeon
   *
   * dungeon has to be approved for elements transfers to deduct the fee from vault
   *
   * @param coordinates
   * @returns {Promise<void>}
   */
  async deactivateRoom(coordinates) {
    return nprogress.observe(
      this.playerWallet.tx('deactivateRoom', this.character, coordinatesToLocation(coordinates)).then(tx => tx.wait()),
    );
  }

  /**
   * activates room - transfers room to the dungeon
   *
   * @param coordinates
   * @returns {Promise<void>}
   */
  async activateRoom(coordinates) {
    return nprogress.observe(
      this.playerWallet.tx('activateRoom', this.character, coordinatesToLocation(coordinates)).then(tx => tx.wait()),
    );
  }

  /**
   * tax for kept rooms in coins
   *
   * @param periods to pay for
   * @returns {Promise<*>} number of coins
   */
  async roomsTax(periods = 1) {
    return Number(await this.wallet.call('ReadOnlyDungeon', 'roomsTax', this.cache.keeperRooms.length, periods));
  }

  /**
   * pay tax for rooms and extend due date
   *
   * dungeon has to be approved for elements transfers to deduct the fee from vault
   *
   * @param periods to pay for
   * @returns {Promise<void>}
   */
  async payRoomsTax(periods = 1) {
    return nprogress.observe(this.playerWallet.tx('payRoomsTax', this.character, periods).then(tx => tx.wait()));
  }

  /**
   * name room
   *
   * dungeon has to be approved for elements transfers to deduct the fee from vault
   *
   * @returns {Promise<void>}
   */
  async nameRoom(coordinates, name) {
    return nprogress.observe(
      this.playerWallet.tx('nameRoom', this.character, coordinatesToLocation(coordinates), name).then(tx => tx.wait()),
    );
  }

  /**
   * gets all UBF related data necessary for food screen
   *
   * @return {Promise<*>} { amount, ubfBalance, slot, claimed, untilNextSlot }
   */
  async ubfInfo() {
    return this.wallet.call('UBF', 'getInfo', get(this.wallet).address);
  }

  /**
   * claims ubf by using character metatransaction
   *
   * @return {Promise<*>}
   */
  async claimUbf() {
    return nprogress.observe(
      this.ubfWallet.tx('claimUBFAsCharacter', this.character).then(tx => tx.wait()),
    );
  }

  /**
   * add bounty to the room
   *
   * @returns {Promise<void>}
   */
  async addBounty(coordinates, amounts) {
    const elements = this.convertConsumablesToArray(amounts);
    if (elements.filter(Boolean).length === 0) {
      return;
    }
    return nprogress.observe(
      this.playerWallet.tx('addBounty', this.character, coordinatesToLocation(coordinates), elements).then(tx => tx.wait()),
    );
  }
}

export default Dungeon;
