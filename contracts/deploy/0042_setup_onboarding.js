// Configures the onboarding sponsor (grant size + global daily cap) on the
// Player proxy after deploy/upgrade. Idempotent: re-runs only emit a no-op
// transaction when the on-chain values already match the desired ones.

// Default grant: MIN_BALANCE (delegate funding) + ~5 moves of energy headroom.
// At Base ~0.05 gwei × 250k gas, energy per move ≈ 1.4e14 wei (11.1 × txCharge).
// 0.0008 ETH = 0.0001 (delegate) + 5×1.4e14 ≈ 0.0008 → 5 trial moves before
// the player can claim UBF (auto-refill, every 23h) for further sessions.
const DEFAULT_GRANT = "800000000000000"; // 0.0008 ETH
const DEFAULT_MAX_DAILY = 50;

module.exports = async ({ deployments, ethers, getNamedAccounts }) => {
  const { log } = deployments;
  const { dungeonOwner } = await getNamedAccounts();

  const playerDeployment = await deployments.get('Player');
  const signer = await ethers.getSigner(dungeonOwner);

  const abi = [
    'function setOnboardingConfig(uint256 grant, uint32 maxDaily) external',
    'function getOnboardingInfo() view returns (uint256 pool, uint256 grant, uint32 maxDaily, uint32 usedToday, uint256 ubfBalance)',
  ];
  const player = new ethers.Contract(playerDeployment.address, abi, signer);

  const desiredGrant = BigInt(process.env.ONBOARDING_GRANT || DEFAULT_GRANT);
  const desiredMaxDaily = Number(process.env.ONBOARDING_MAX_DAILY || DEFAULT_MAX_DAILY);

  let current;
  try {
    current = await player.getOnboardingInfo();
  } catch (e) {
    log('[onboarding] getOnboardingInfo failed (Player not upgraded yet?):', e.message);
    return;
  }

  if (BigInt(current.grant) === desiredGrant && Number(current.maxDaily) === desiredMaxDaily) {
    log(`[onboarding] config already up to date (grant=${desiredGrant}, maxDaily=${desiredMaxDaily})`);
    return;
  }

  log(`[onboarding] setting grant=${desiredGrant} wei, maxDaily=${desiredMaxDaily}`);
  const tx = await player.setOnboardingConfig(desiredGrant, desiredMaxDaily, { gasLimit: 100000 });
  const receipt = await tx.wait();
  log(`[onboarding] setOnboardingConfig ${receipt.status === 1 ? 'OK' : 'FAILED'} (tx ${tx.hash})`);
};

module.exports.tags = ['OnboardingSetup'];
module.exports.dependencies = ['Player'];
