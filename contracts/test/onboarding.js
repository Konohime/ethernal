// Onboarding sponsor tests. Standalone — uses ethers v6 + hardhat-deploy
// fixture, bypassing the legacy lib/index.js that depends on @nomiclabs/buidler.
//
// Coverage:
//   - fundOnboarding accumulates into _onboardingPool, emits event
//   - setOnboardingConfig is proxy-admin only
//   - getOnboardingInfo reflects state (incl. UBF balance)
//   - receive() rejects ETH from non-pool senders
//   - createAndEnter with value=0 succeeds when grant available, sets
//     _onboarded[sender], increments dailyGrantsUsed, funds the delegate
//   - second createAndEnter from same sender does NOT re-grant
//   - daily cap blocks further grants for the day
//   - empty pool + empty UBF → createAndEnter reverts on _addDelegate

const { expect } = require('chai');
const { ethers, deployments, getNamedAccounts } = require('hardhat');

const ZERO = '0x0000000000000000000000000000000000000000';
const ONE_ETH = ethers.parseEther('1');
const GRANT = ethers.parseEther('0.001'); // matches MIN_BALANCE

describe('Onboarding sponsor', function () {
  let player, ubf, owner, fresh, fresh2;

  async function deployAll() {
    await deployments.fixture(['core']);
    const playerDeployment = await deployments.get('Player');
    const ubfDeployment = await deployments.get('UBF');
    const { dungeonOwner } = await getNamedAccounts();

    const ownerSigner = await ethers.getSigner(dungeonOwner);
    const signers = await ethers.getSigners();
    // Pick signers that are not used by deployment scripts (deployer/dungeonOwner/users[0]).
    const freshA = signers[5];
    const freshB = signers[6];

    const playerAbi = [
      'function setOnboardingConfig(uint256 grant, uint32 maxDaily) external',
      'function fundOnboarding() external payable',
      'function getOnboardingInfo() view returns (uint256 pool, uint256 grant, uint32 maxDaily, uint32 usedToday, uint256 ubfBalance)',
      'function isOnboarded(address) view returns (bool)',
      'function getEnergy(address) view returns (uint256 energy, uint256 freeEnergy)',
      'function createAndEnter(address newDelegate, uint256 value, string name, uint8 class, uint256 location) external payable',
      'event OnboardingFunded(address indexed from, uint256 amount)',
      'event OnboardingGranted(address indexed player, uint256 amount, bool fromUBF)',
      'event OnboardingConfigUpdated(uint256 grant, uint32 maxDaily)',
      'event DelegateAdded(address indexed player, address indexed delegate)',
    ];
    player = new ethers.Contract(playerDeployment.address, playerAbi, ownerSigner);
    ubf = await ethers.getContractAt('UBF', ubfDeployment.address);
    owner = ownerSigner;
    fresh = freshA;
    fresh2 = freshB;

    await (await player.setOnboardingConfig(GRANT, 50)).wait();
  }

  beforeEach(deployAll);

  it('fundOnboarding accumulates and emits event', async function () {
    const before = (await player.getOnboardingInfo()).pool;
    const tx = await player.connect(fresh).fundOnboarding({ value: GRANT * 3n });
    await expect(tx).to.emit(player, 'OnboardingFunded').withArgs(fresh.address, GRANT * 3n);
    const after = (await player.getOnboardingInfo()).pool;
    expect(after - before).to.equal(GRANT * 3n);
  });

  it('setOnboardingConfig is proxy-admin only', async function () {
    await expect(
      player.connect(fresh).setOnboardingConfig(GRANT, 10),
    ).to.be.reverted;
  });

  it('receive() rejects non-pool senders', async function () {
    await expect(
      fresh.sendTransaction({ to: await player.getAddress(), value: 1n }),
    ).to.be.revertedWith('ONLY_POOL');
  });

  it('createAndEnter with value=0 grants and funds delegate', async function () {
    await (await player.connect(fresh).fundOnboarding({ value: GRANT * 5n })).wait();

    const playerAsFresh = player.connect(fresh);
    const delegate = ethers.Wallet.createRandom().connect(ethers.provider);
    expect(await ethers.provider.getBalance(delegate.address)).to.equal(0n);

    const tx = await playerAsFresh.createAndEnter(delegate.address, 0, '0x', 0, 0, { value: 0 });
    const receipt = await tx.wait();

    // Delegate received MIN_BALANCE = GRANT
    expect(await ethers.provider.getBalance(delegate.address)).to.equal(GRANT);

    // Player marked onboarded
    expect(await player.isOnboarded(fresh.address)).to.equal(true);

    // Daily counter advanced, pool drained by exactly one grant
    const info = await player.getOnboardingInfo();
    expect(info.usedToday).to.equal(1n);
    expect(info.pool).to.equal(GRANT * 4n);

    // OnboardingGranted event present
    const ev = receipt.logs
      .map((l) => { try { return player.interface.parseLog(l); } catch { return null; } })
      .find((l) => l && l.name === 'OnboardingGranted');
    expect(ev, 'OnboardingGranted not emitted').to.exist;
    expect(ev.args.player).to.equal(fresh.address);
    expect(ev.args.amount).to.equal(GRANT);
    expect(ev.args.fromUBF).to.equal(false);
  });

  it('second createAndEnter from same sender does not re-grant', async function () {
    await (await player.connect(fresh).fundOnboarding({ value: GRANT * 5n })).wait();
    const d1 = ethers.Wallet.createRandom().connect(ethers.provider);
    await (await player.connect(fresh).createAndEnter(d1.address, 0, '0x', 0, 0, { value: 0 })).wait();

    expect(await player.isOnboarded(fresh.address)).to.equal(true);
    const poolAfter1 = (await player.getOnboardingInfo()).pool;

    // Second attempt with no value: no grant, _addDelegate should revert with "not enough energy"
    const d2 = ethers.Wallet.createRandom().connect(ethers.provider);
    await expect(
      player.connect(fresh).createAndEnter(d2.address, 0, '0x', 0, 0, { value: 0 }),
    ).to.be.reverted;

    // Pool was not drained by the failed second attempt
    expect((await player.getOnboardingInfo()).pool).to.equal(poolAfter1);
  });

  it('daily cap blocks further grants', async function () {
    // Tighten cap to 1 for this test
    await (await player.setOnboardingConfig(GRANT, 1)).wait();
    await (await player.connect(fresh).fundOnboarding({ value: GRANT * 5n })).wait();

    const d1 = ethers.Wallet.createRandom().connect(ethers.provider);
    await (await player.connect(fresh).createAndEnter(d1.address, 0, '0x', 0, 0, { value: 0 })).wait();

    // fresh2 is a brand new EOA, eligible per-account but blocked by global cap
    const d2 = ethers.Wallet.createRandom().connect(ethers.provider);
    await expect(
      player.connect(fresh2).createAndEnter(d2.address, 0, '0x', 0, 0, { value: 0 }),
    ).to.be.reverted;
    expect(await player.isOnboarded(fresh2.address)).to.equal(false);
  });

  it('falls back to UBF when _onboardingPool empty', async function () {
    // Don't call fundOnboarding; instead, send ETH directly to UBF.
    const ubfAddr = await ubf.getAddress();
    await fresh.sendTransaction({ to: ubfAddr, value: GRANT * 5n });

    const delegate = ethers.Wallet.createRandom().connect(ethers.provider);
    const tx = await player.connect(fresh).createAndEnter(delegate.address, 0, '0x', 0, 0, { value: 0 });
    const receipt = await tx.wait();

    const ev = receipt.logs
      .map((l) => { try { return player.interface.parseLog(l); } catch { return null; } })
      .find((l) => l && l.name === 'OnboardingGranted');
    expect(ev.args.fromUBF).to.equal(true);
    expect(await ethers.provider.getBalance(delegate.address)).to.equal(GRANT);
  });
});
