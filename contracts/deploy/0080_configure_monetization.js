// Configure ETH monetization after the core contracts are deployed.
//
// Five idempotent admin calls (skipped when already at the target value):
//   1. Player.setTreasury(treasury)        — recipient of the refill fee
//   2. Player.setRefillFee(REFILL_FEE_BPS)  — % skimmed on ETH energy deposits
//   3. Rooms.setRoyalty(treasury, ROYALTY)  — EIP-2981 secondary-sale royalty
//   4. Dungeon.setMarketplaceTreasury(treasury) — recipient of room commissions
//   5. Dungeon.setMarketplaceFeeBps(FEE)    — % commission on room sales
//
// On Base, dungeonOwner == deployer == account 0, which is both the EIP173
// proxyAdmin (Player/Rooms) and the diamond owner (Dungeon), so a single key
// signs all five.
//
// Treasury address: set TREASURY_ADDRESS in the environment to route revenue to
// a dedicated cold wallet / multisig. If unset, it falls back to dungeonOwner
// (the deploy hot wallet) with a warning — fine for a testnet, not for prod.

const REFILL_FEE_BPS = 400; // 4% on energy refills (Player hard cap: 1000 = 10%)
const ROOM_ROYALTY_BPS = 500; // 5% EIP-2981 royalty (Rooms hard cap: 1000)
const MARKETPLACE_FEE_BPS = 500; // 5% commission on room sales (facet hard cap: 1000)

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const eqAddr = (a, b) => (a || "").toLowerCase() === (b || "").toLowerCase();

module.exports = async ({deployments, getNamedAccounts}) => {
  const {execute, read, log} = deployments;
  const {deployer, dungeonOwner} = await getNamedAccounts();

  const treasury = process.env.TREASURY_ADDRESS || dungeonOwner;
  if (!ADDRESS_RE.test(treasury)) {
    throw new Error(`Invalid TREASURY_ADDRESS: ${treasury}`);
  }
  if (!process.env.TREASURY_ADDRESS) {
    log(
      `[monetization] TREASURY_ADDRESS not set — defaulting to dungeonOwner ${dungeonOwner}. ` +
        `Set TREASURY_ADDRESS to a dedicated wallet for production.`
    );
  }
  log(`[monetization] treasury = ${treasury}`);

  // 1. Player.setTreasury
  const currentTreasury = await read("Player", "getTreasury");
  if (!eqAddr(currentTreasury, treasury)) {
    log(`[monetization] Player.setTreasury(${treasury})`);
    await execute("Player", {from: deployer, log: true}, "setTreasury", treasury);
  } else {
    log(`[monetization] Player treasury already set, skipping`);
  }

  // 2. Player.setRefillFee
  const currentFee = Number(await read("Player", "getRefillFeeBps"));
  if (currentFee !== REFILL_FEE_BPS) {
    log(`[monetization] Player.setRefillFee(${REFILL_FEE_BPS})`);
    await execute("Player", {from: deployer, log: true}, "setRefillFee", REFILL_FEE_BPS);
  } else {
    log(`[monetization] Player refill fee already ${REFILL_FEE_BPS}, skipping`);
  }

  // 3. Rooms.setRoyalty
  const royalty = await read("Rooms", "getRoyalty");
  if (!eqAddr(royalty.receiver, treasury) || Number(royalty.bps) !== ROOM_ROYALTY_BPS) {
    log(`[monetization] Rooms.setRoyalty(${treasury}, ${ROOM_ROYALTY_BPS})`);
    await execute("Rooms", {from: deployer, log: true}, "setRoyalty", treasury, ROOM_ROYALTY_BPS);
  } else {
    log(`[monetization] Rooms royalty already configured, skipping`);
  }

  // 4 + 5. Dungeon marketplace (diamond owner)
  const mkt = await read("Dungeon", "getMarketplaceConfig");
  if (!eqAddr(mkt.treasury, treasury)) {
    log(`[monetization] Dungeon.setMarketplaceTreasury(${treasury})`);
    await execute("Dungeon", {from: deployer, log: true}, "setMarketplaceTreasury", treasury);
  } else {
    log(`[monetization] Marketplace treasury already set, skipping`);
  }
  if (Number(mkt.bps) !== MARKETPLACE_FEE_BPS) {
    log(`[monetization] Dungeon.setMarketplaceFeeBps(${MARKETPLACE_FEE_BPS})`);
    await execute("Dungeon", {from: deployer, log: true}, "setMarketplaceFeeBps", MARKETPLACE_FEE_BPS);
  } else {
    log(`[monetization] Marketplace fee already ${MARKETPLACE_FEE_BPS}, skipping`);
  }

  log("[monetization] configuration complete");
};

module.exports.tags = ["monetization"];
module.exports.dependencies = ["Player", "Rooms", "Dungeon"];
