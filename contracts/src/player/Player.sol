// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "hardhat-deploy/solc_0.8/proxy/Proxied.sol";
import "./PlayerDataLayout.sol";
import "../utils/MetaTransactionReceiver.sol";
import "./Pool.sol";
import "../utils/Constants.sol";

contract Player is Proxied, PlayerDataLayout, MetaTransactionReceiver, Constants {
    event Call(bool success, bytes returnData);
    event Refill(address indexed playerAddress, uint256 newEnergy);
    event DelegateAdded(address indexed player, address indexed delegate);
    event DelegateRemoved(address indexed player, address indexed delegate);
    event TreasuryUpdated(address indexed treasury);
    event RefillFeeUpdated(uint16 bps);
    event PoolFeeMultiplierUpdated(uint256 multiplier);
    event RefillFeeCollected(address indexed treasury, uint256 amount);
    event DelegateToppedUp(address indexed player, address indexed delegate, uint256 amount);
    event OnboardingFunded(address indexed from, uint256 amount);
    event OnboardingGranted(address indexed player, uint256 amount, bool fromUBF);
    event OnboardingConfigUpdated(uint256 grant, uint32 maxDaily);

    uint16 public constant MAX_REFILL_FEE_BPS = 1000; // 10% hard cap

    // UBF fee multiplier: callAsCharacter charges poolFee = txCharge * multiplier.
    // DEFAULT is used whenever _poolFeeMultiplier storage is 0 (e.g. right after
    // a proxy upgrade). MAX hard-caps the setter so a misconfigured value can't
    // brick movement by pushing the per-move energy burn past a player's bar.
    uint256 public constant DEFAULT_POOL_FEE_MULTIPLIER = 2;
    uint256 public constant MAX_POOL_FEE_MULTIPLIER = 20;

    // Restricted to the Pool (UBF) so sponsorOnboarding can push ETH back here.
    // Anyone else sending ETH would inflate this contract's balance without
    // crediting any player's energy, breaking the implicit accounting.
    receive() external payable {
        require(msg.sender == address(_pool), "ONLY_POOL");
    }

    function setTreasury(address payable treasury) external onlyProxyAdmin {
        _treasury = treasury;
        emit TreasuryUpdated(treasury);
    }

    function setRefillFee(uint16 bps) external onlyProxyAdmin {
        require(bps <= MAX_REFILL_FEE_BPS, "fee too high");
        _refillFeeBps = bps;
        emit RefillFeeUpdated(bps);
    }

    /// @notice Proxy-admin-only: tune the UBF fee multiplier. A lower value
    /// gives players more moves per food refill but proportionally less UBF
    /// (free-food) funding. Passing 0 resets to DEFAULT_POOL_FEE_MULTIPLIER.
    function setPoolFeeMultiplier(uint256 multiplier) external onlyProxyAdmin {
        require(multiplier <= MAX_POOL_FEE_MULTIPLIER, "multiplier too high");
        _poolFeeMultiplier = multiplier;
        emit PoolFeeMultiplierUpdated(multiplier);
    }

    /// @notice The effective UBF fee multiplier — resolves the 0 storage
    /// sentinel to DEFAULT_POOL_FEE_MULTIPLIER.
    function getPoolFeeMultiplier() external view returns (uint256) {
        uint256 m = _poolFeeMultiplier;
        return m == 0 ? DEFAULT_POOL_FEE_MULTIPLIER : m;
    }

    function setOnboardingConfig(uint256 grant, uint32 maxDaily) external onlyProxyAdmin {
        _onboardingGrant = grant;
        _maxDailyGrants = maxDaily;
        emit OnboardingConfigUpdated(grant, maxDaily);
    }

    function fundOnboarding() external payable {
        require(msg.value > 0, "no value");
        _onboardingPool += msg.value;
        emit OnboardingFunded(msg.sender, msg.value);
    }

    function getOnboardingInfo()
        external
        view
        returns (
            uint256 pool,
            uint256 grant,
            uint32 maxDaily,
            uint32 usedToday,
            uint256 ubfBalance
        )
    {
        pool = _onboardingPool;
        grant = _onboardingGrant;
        maxDaily = _maxDailyGrants;
        uint64 today = uint64(block.timestamp / 1 days);
        usedToday = today == _dailyGrantsDay ? _dailyGrantsUsed : 0;
        ubfBalance = address(_pool).balance;
    }

    function isOnboarded(address player) external view returns (bool) {
        return _onboarded[player];
    }

    /// @notice Proxy-admin-only: set (or clear) the trusted EIP-2771 meta-tx
    /// forwarder. Pass address(0) to disable meta-tx routing — _msgSender
    /// then always returns msg.sender. Until this is set, the meta-tx code
    /// path is dead, so direct callers always identify themselves.
    function setTrustedForwarder(address forwarder) external onlyProxyAdmin {
        _setTrustedForwarder(forwarder);
    }

    function getTreasury() external view returns (address) {
        return _treasury;
    }

    function getRefillFeeBps() external view returns (uint16) {
        return _refillFeeBps;
    }

    function postUpgrade(
        Characters charactersContract,
        address payable feeRecipient,
        uint256 minBalance,
        Pool pool
    ) external proxied {
        // Trusted forwarder is configured separately via setTrustedForwarder.
        _charactersContract = charactersContract;
        _feeRecipient = feeRecipient;
        MIN_BALANCE = minBalance;
        _pool = pool;
        pool.register();
    }

    function register() external {
        if (msg.sender != address(_holder)) {
            require(address(_holder) == address(0), "holder already set");
            _holder = Enterable(msg.sender);
        }
    }

    function getLastCharacterId(address playerAddress) external view returns (uint256) {
        return _lastCharacterIds[playerAddress];
    }

    function getEnergy(address playerAddress) external view returns (uint256 energy, uint256 freeEnergy) {
        PlayerStruct storage player = _players[playerAddress];
        energy = player.energy;
        freeEnergy = player.freeEnergy;
    }

    function createAndEnter(
        address payable newDelegate,
        uint256 value,
        string calldata name,
        uint8 class,
        uint256 location
    ) external payable {
        address payable sender = _msgSender();
        uint256 characterId = _charactersContract.mintTo(address(_holder));
        _enter(sender, newDelegate, characterId, value, name, class, location);
    }

    function enter(
        address payable newDelegate,
        uint256 characterId,
        uint256 value,
        string calldata name,
        uint8 class,
        uint256 location
    ) external payable {
        address payable sender = _msgSender();
        _charactersContract.transferFrom(sender, address(_holder), characterId);
        _enter(sender, newDelegate, characterId, value, name, class, location);
    }

    function _enter(
        address payable sender,
        address payable newDelegate,
        uint256 characterId,
        uint256 value,
        string memory name,
        uint8 class,
        uint256 location
    ) internal {
        // The holder's `enter` is payable but does not currently spend
        // msg.value, so any non-zero value forwarded here would be silently
        // locked in the diamond. Reject it explicitly until a holder-side
        // flow consumes it.
        require(value == 0, "value not supported");
        require(msg.value >= value, "msg.value < value");

        if (msg.value > value) {
            _refill(sender, sender, msg.value - value);
        }
        if (newDelegate != address(0)) {
            // If the refilled amount didn't cover MIN_BALANCE (e.g. msg.value=0
            // for a sponsored onboarding), try to top up the player's energy
            // from the onboarding pool. _addDelegate will then succeed; if the
            // grant is unavailable, _addDelegate's own require gives a clear
            // "not enough energy" revert.
            if (_players[sender].energy < uint128(MIN_BALANCE)) {
                _tryGrantOnboarding(sender);
            }
            _addDelegate(sender, newDelegate);
        }
        _holder.enter{value: value}(sender, characterId, name, class, location);
        _lastCharacterIds[sender] = characterId;
    }

    function callAsCharacter(
        address destination,
        uint256 gasLimit,
        bytes calldata data
    ) external returns (bool success, bytes memory returnData) {
        address sender = _msgSender();
        // TODO check death ?
        require(destination != address(this), "cannot call itself");
        // TODO block data if == `enter(address sender, uint256 characterId, bytes data)`
        uint256 initialGas = gasleft();
        uint256 characterId = _getFirstParam(data);
        require(_charactersContract.ownerOf(characterId) == address(_holder), "_holder does not own character");
        uint256 playerAddress = _charactersContract.getSubOwner(characterId);
        if (uint256(uint160(sender)) != playerAddress) {
            require(uint256(uint160(_delegates[sender])) == playerAddress, "sender is not delegate of character's player");
        }

        (success, returnData) = _executeWithSpecificGas(destination, gasLimit, data);
        require(success, "call failed");

        PlayerStruct storage player = _players[address(uint160(playerAddress))];
        uint256 energy = player.energy;
        uint256 txCharge = ((initialGas - gasleft()) + 10000) * tx.gasprice;
        uint256 freeEnergyFee = (txCharge * 10) / 100; // 10% extra is used for free energy

        // Per-move energy burn ~3.1x its gas cost at the default multiplier:
        // poolFee to the UBF pool (below) + 10% to freeEnergy + ~1x to refund
        // the burner's spent gas. The UBF multiplier is admin-tunable via
        // setPoolFeeMultiplier — default 2x gives ~25 moves per full MAX_FOOD
        // bar (down from the original hardcoded 10x / ~7 moves). Lower = more
        // moves per refill but proportionally less UBF (free-food) funding;
        // see audit note L8, MAX_POOL_FEE_MULTIPLIER bounds the worst case.
        uint256 multiplier = _poolFeeMultiplier;
        if (multiplier == 0) {
            multiplier = DEFAULT_POOL_FEE_MULTIPLIER;
        }
        uint256 poolFee = txCharge * multiplier; // % of txCharge sent to UBF

        require(energy >= freeEnergyFee + poolFee, "not enough energy");
        energy -= (freeEnergyFee + poolFee);
        _pool.recordCharge{value: poolFee}(sender, txCharge, poolFee);

        // Refund msg.sender's gas balance from the player's energy when it
        // dips below MIN_BALANCE — applies to both direct calls (msg.sender ==
        // player) and meta-tx calls (msg.sender == delegate). Without this,
        // a delegate slowly burns its initial top-up across moves and ends up
        // unable to pay gas for the very tx (notably claimUBFAsCharacter)
        // that would refill it, creating a chicken-and-egg lockout.
        if (msg.sender.balance < MIN_BALANCE) {
            uint256 balanceToGive = MIN_BALANCE - msg.sender.balance;
            if (balanceToGive >= energy) {
                balanceToGive = energy;
                energy = 0;
            } else {
                energy -= balanceToGive;
            }

            if (balanceToGive > 0) {
                payable(msg.sender).transfer(balanceToGive);
            }
        }
        player.freeEnergy += uint128(freeEnergyFee);
        player.energy = uint128(energy);

        emit Call(success, returnData);
    }

    function isDelegateFor(address delegate, address playerAddress) external view returns (bool) {
        return _delegates[delegate] == playerAddress;
    }

    function refillAccount(address account) public payable {
        address payable sender = _msgSender();
        _refill(sender, account, msg.value);
    }

    function refill() public payable {
        address payable sender = _msgSender();
        _refill(sender, sender, msg.value);
    }

    function _refill(
        address payable sender,
        address account,
        uint256 value
    ) internal returns (uint256 refund) {
        uint128 currentEnergy = _players[account].energy;

        // Clamp the deposit to the remaining headroom before MAX_FOOD.
        uint256 headroom = currentEnergy < MAX_FOOD ? MAX_FOOD - currentEnergy : 0;
        uint256 toAdd = value;
        if (toAdd > headroom) {
            refund = toAdd - headroom;
            toAdd = headroom;
        }

        // Fee is taken from the kept amount (post-cap), so the user never overpays
        // the fee on ETH that ends up refunded to them.
        uint256 fee = 0;
        address payable treasury = _treasury;
        uint16 feeBps = _refillFeeBps;
        if (treasury != address(0) && feeBps > 0 && toAdd > 0) {
            fee = (toAdd * feeBps) / 10000;
        }
        uint256 energyAdded = toAdd - fee;

        // Auto top-up the delegate's gas balance if low, so the player's in-game
        // burner wallet stays funded for moves without needing a separate transfer.
        // Funded from the post-fee energy allocation (so the fee % stays consistent).
        address payable delegate = _delegateOf[account];
        uint256 topUp = 0;
        if (delegate != address(0)) {
            uint256 dBal = delegate.balance;
            if (dBal < MIN_BALANCE) {
                uint256 needed = MIN_BALANCE - dBal;
                if (needed > energyAdded) needed = energyAdded;
                topUp = needed;
                energyAdded -= topUp;
            }
        }

        // Effects: state updated before any external call (CEI).
        uint128 newEnergy = currentEnergy + uint128(energyAdded);
        _players[account].energy = newEnergy;
        emit Refill(account, newEnergy);

        // Interactions: forward fee, top up delegate, then refund.
        if (fee > 0) {
            (bool feeOk, ) = treasury.call{value: fee}("");
            require(feeOk, "treasury transfer failed");
            emit RefillFeeCollected(treasury, fee);
        }
        if (topUp > 0) {
            (bool topOk, ) = delegate.call{value: topUp}("");
            if (topOk) {
                emit DelegateToppedUp(account, delegate, topUp);
            } else {
                // A delegate set to a contract with a reverting fallback would
                // otherwise brick every future refill for this player. Treat
                // the top-up as best-effort: credit the amount back to energy
                // so neither the player's value nor the refill itself is lost.
                _players[account].energy += uint128(topUp);
                emit Refill(account, _players[account].energy);
            }
        }
        if (refund > 0) {
            (bool refundOk, ) = sender.call{value: refund}("");
            require(refundOk, "refund failed");
        }
    }

    function addDelegate(address payable _delegate) public payable {
        address payable sender = _msgSender();
        if (msg.value > 0) {
            _refill(sender, sender, msg.value);
        }
        _addDelegate(sender, _delegate);
    }

    function removeDelegate(address _delegate) external {
        address sender = _msgSender();
        require(_delegates[_delegate] == sender, "NOT_YOUR_DELEGATE");
        delete _delegates[_delegate];
        if (_delegateOf[sender] == _delegate) {
            delete _delegateOf[sender];
        }
        emit DelegateRemoved(sender, _delegate);
    }

    // Populate the reverse delegate mapping for an existing delegate registered
    // before this upgrade, so auto top-up on refill can find it. Callable by
    // either the player (main wallet) or the delegate itself. Idempotent.
    function bindDelegate(address payable _delegate) external {
        address sender = _msgSender();
        require(
            _delegates[_delegate] == sender || msg.sender == _delegate,
            "NOT_YOUR_DELEGATE"
        );
        address player = _delegates[_delegate];
        require(player != address(0), "delegate not registered");
        _delegateOf[player] = _delegate;
    }

    function _tryGrantOnboarding(address sender) internal returns (bool) {
        uint256 grant = _onboardingGrant;
        if (grant == 0) return false;
        if (_onboarded[sender]) return false;

        // Daily cap, rolling per UTC day. Reset the counter when the day changes.
        uint64 today = uint64(block.timestamp / 1 days);
        uint32 used = _dailyGrantsUsed;
        if (today != _dailyGrantsDay) {
            _dailyGrantsDay = today;
            used = 0;
        }
        if (used >= _maxDailyGrants) return false;

        // Source funds: dedicated pool first, then UBF reserve. We never
        // partially fund — if neither source can cover the full grant, abort.
        bool fromUBF;
        if (_onboardingPool >= grant) {
            _onboardingPool -= grant;
        } else if (address(_pool).balance >= grant) {
            _pool.sponsorOnboarding(payable(address(this)), grant);
            fromUBF = true;
        } else {
            return false;
        }

        _onboarded[sender] = true;
        _dailyGrantsUsed = used + 1;
        _players[sender].energy += uint128(grant);
        emit OnboardingGranted(sender, grant, fromUBF);
        return true;
    }

    function _addDelegate(address sender, address payable _delegate) internal {
        require(_delegate != address(0), "no zero address delegate");
        require(_delegates[_delegate] == address(0) || _delegates[_delegate] == sender, "DELEGATE_ALREADY_ASSIGNED");
        require(_players[sender].energy >= uint128(MIN_BALANCE), "not enough energy");
        _players[sender].energy -= uint128(MIN_BALANCE);
        _delegate.transfer(MIN_BALANCE);
        _delegates[_delegate] = sender;
        _delegateOf[sender] = _delegate;
        emit DelegateAdded(sender, _delegate);
    }

    function _getFirstParam(bytes memory data) internal pure returns (uint256) {
        if (data.length < 36) {
            return 0;
        }
        uint256 value;
        // solhint-disable-next-line security/no-inline-assembly
        assembly {
            value := mload(add(data, 36))
        }
        return value;
    }

    function _executeWithSpecificGas(
        address to,
        uint256 gasLimit,
        bytes memory data
    ) internal returns (bool success, bytes memory returnData) {
        (success, returnData) = to.call{gas: gasLimit}(data);
        // EIP-150: only 63/64 of remaining gas is forwarded to the inner call,
        // so if `gasleft()` after the call is at most `gasLimit / 63` the inner
        // call may have been starved by an out-of-gas in the caller's frame.
        // Revert with a real reason rather than consuming all gas via `assert`.
        require(gasleft() > gasLimit / 63, "INSUFFICIENT_GAS_FOR_INNER_CALL");
    }
}
