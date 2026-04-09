![alt text](./ethernal.png)

# Ethernal

**Ethernal** is a fully on-chain roguelike dungeon crawler built on [Ethereum](https://ethereum.org). Players explore procedurally generated dungeons, fight monsters, collect loot, and own rooms as NFTs.

Created by [@Ohjia](https://github.com/Ohjia), [@lumir-mrkva](https://github.com/lumir-mrkva), [@gleuch](https://github.com/gleuch) and [@wighawag](https://github.com/wighawag) (whose early prototype can be found [here](https://github.com/wighawag/the_eternal_dungeon)).

---

## Game Overview

### Core Loop

1. **Create a character** — choose a class (Warrior, Explorer, Mage, or Barbarian)
2. **Explore the dungeon** — move through rooms in 4 cardinal directions or descend to lower floors
3. **Discover new rooms** — spend Fragments to reveal unexplored areas and become their owner
4. **Fight monsters** — turn-based card combat against procedurally generated enemies
5. **Collect loot** — earn Coins, Keys, Fragments, Elements, and Gear from combat and exploration
6. **Level up** — spend Coins at Temples to increase your character's power
7. **Go deeper** — unlock new floors as you explore further from the center

### Character Classes

| Class      | Bonus                              |
|------------|------------------------------------|
| Warrior    | Base stats                         |
| Explorer   | +25% Coins from discovery          |
| Mage       | +25% Elements from discovery       |
| Barbarian  | Base stats                         |

Characters level from 1 to 9, gaining +10 HP per level. Leveling costs Coins at Temple rooms, with costs increasing exponentially.

---

## Resources & Inventory

### Elements

Elements are ERC-1155 tokens representing the five elemental types: **Fire, Air, Earth, Water**, and a fifth element. They are obtained as rewards when discovering new rooms (scaled by distance from center and class bonus). Elements are used as currency for room operations such as bounties, taxes, and naming.

### Coins (Element #6)

Coins are the primary in-game currency, dropped by defeated monsters and awarded for room discovery.

**Earning Coins:**
- Defeating monsters (scaled by monster level and type; big bosses give 3x more)
- Discovering new rooms
- Passive income from owned rooms (1/5 of Coins spent by visitors)

**Spending Coins:**
- **Healing** at Temples (1 Coin per HP)
- **Leveling up** at Temples (cost increases with level)
- **Teleportation** between teleport rooms (cost scales with distance)
- **Naming rooms** (20 Coins)
- **Deactivating rooms** (100 Coins)

### Keys (Element #7)

Keys unlock locked doors. Some room exits are locked (40% chance of at least one lock per room) and require a Key to pass through.

### Fragments (Element #8)

Fragments are spent to discover new rooms (1–3 Fragments depending on distance from center). They can also be obtained by **recycling gear**: base reward is `1 + (gear level / 2)`, with a +50% bonus if the gear is at full durability.

### Gear (Equipment)

Gear items are ERC-721 NFTs that equip to your character:

| Slot   | Type       |
|--------|------------|
| Slot 0 | Weapon     |
| Slot 1 | Armor      |
| Slot 2–4 | Accessories |

- Inventory holds up to 10 items
- Gear has level requirements and class compatibility
- Gear loses 1 durability per combat; broken gear reverts to "bare hands"
- Unwanted gear can be recycled into Fragments

**Drop rarity by monster type:**

| Monster Type | Common | Uncommon | Rare |
|-------------|--------|----------|------|
| Trash       | 95%    | 5%       | —    |
| Mini Boss   | 65%    | 34%      | 1%   |
| Big Boss    | 5%     | 55%      | 40%  |

---

## Combat

Combat is **turn-based** with a card/deck system. Each turn, both the player and monster pick from:
- An **attack deck** (4–5 options)
- A **defense deck** (2–3 options)

**Damage resolution:**
1. Total Attack = weapon bonus + character attack stat + charge bonus
2. Total Defense = defense gear + defense action
3. If Total Attack > Total Defense, the hit lands
4. Damage = weapon damage + character damage − target's protection (minimum 0)

**Special mechanics:**
- **Charge** — build up power for stronger attacks next turn
- **Protection** — stacked defense reduces incoming damage

**Monster types:**
- **Trash** — most common (15% base spawn rate)
- **Mini Boss** — rarer, drops 4–11x more loot
- **Big Boss** — rarest, drops 3x reward multiplier with much better gear

---

## The Dungeon

### Map Structure

The dungeon is a 3D procedurally generated maze (X, Y, Z coordinates). It is organized into:
- **Areas** — a 9x9 grid, each area containing a 9x9 grid of rooms
- **Floors** — the Z axis represents depth; deeper floors unlock as you explore farther from center
- **Elemental areas** — outer areas can become elemental, granting themed rewards

### Room Types

| Type     | Function                                      |
|----------|-----------------------------------------------|
| Normal   | Standard rooms — may contain monsters          |
| Teleport | Fast travel nodes (costs Coins)                |
| Temple   | Heal HP and level up (costs Coins)             |
| Lore     | Narrative/story rooms                          |
| Carrier  | Special transport rooms                        |

Each area is guaranteed to contain at least one Teleport, Temple, Lore, and Carrier room.

### Room Ownership (Dungeon Keeper)

When you discover a room, you become its owner. Owners:
- Earn passive income (1/5 of Coins spent by visitors, 1 Fragment per visitor)
- Can name their room (20 Coins)
- Can set bounties on their rooms to attract visitors
- Must pay taxes every 5 days or lose ownership

---

## Energy System

Actions in the game consume **energy** (ETH-based, via meta-transactions). Energy replenishes every ~23 hours from a shared UBF (Utility Based Funding) pool. The amount replenished depends on how depleted your energy is relative to the maximum.

---

## Architecture

The game is composed of three modules:

- **[contracts](contracts/)** — Solidity smart contracts for game rules and on-chain data storage
- **[backend](backend/)** — NodeJS server that caches and synchronizes data between the frontend and contracts
- **[webapp](webapp/)** — Svelte-based user interface for players

### Running Locally

Deploy local `contracts` first, then run `backend` and `webapp`.

Alternatively, the `webapp` can connect to already-deployed staging or production contracts on Polygon Testnet.

## License

The code is licensed as MIT, see [LICENSE](./LICENSE) file.
