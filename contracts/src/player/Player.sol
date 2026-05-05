// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
    event RefillFeeCollected(address indexed treasury, uint256 amount);
    event DelegateToppedUp(address indexed player, address indexed delegate, uint256 amount);

    uint16 public constant MAX_REFILL_FEE_BPS = 1000; // 10% hard cap

    function setTreasury(address payable treasury) external onlyProxyAdmin {
        _treasury = treasury;
        emit TreasuryUpdated(treasury);
    }

    function setRefillFee(uint16 bps) external onlyProxyAdmin {
        require(bps <= MAX_REFILL_FEE_BPS, "fee too high");
        _refillFeeBps = bps;
        emit RefillFeeUpdated(bps);
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
        // TODO _setTrustedForwarder(...);
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

    // TODO remove ?
    function getPlayerInfo(address playerAddress, uint256 characterId)
        external
        view
        returns (uint256 energy, uint256 freeEnergy)
    {
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

        // If a delegate is being attached, _addDelegate will burn MIN_BALANCE
        // from energy after _refill returns. Validate up-front that the
        // refilled-net-of-fee amount can cover MIN_BALANCE so the user gets
        // a clear revert instead of a deep "not enough energy" failure.
        if (newDelegate != address(0)) {
            uint256 refillAmount = msg.value - value;
            uint256 maxFee = (refillAmount * _refillFeeBps) / 10000;
            require(refillAmount >= MIN_BALANCE + maxFee, "msg.value below MIN_BALANCE+fee");
        }

        if (msg.value > value) {
            _refill(sender, sender, msg.value - value);
        }
        if (newDelegate != address(0)) {
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

        uint256 poolFee = txCharge * 10; // 1000% is used for UBF

        require(energy >= freeEnergyFee + poolFee, "not enough energy");
        energy -= (freeEnergyFee + poolFee);
        _pool.recordCharge{value: poolFee}(sender, txCharge, poolFee);

        if (msg.sender == sender) {
            // not metatx : use local private key so need to recharge local balance // TODO remove (once metatx is enabled)
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
        assert(gasleft() > gasLimit / 63);
        // not enough gas provided, assert to throw all gas // TODO use EIP-1930
    }
}
