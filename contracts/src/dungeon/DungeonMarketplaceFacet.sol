// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./DungeonFacetBase.sol";

/// @notice Native ETH marketplace for in-game (active) rooms.
///
/// UX / popup rationale:
/// - `listRoom` / `cancelRoomListing` are in-game actions routed through
///   Player.callAsCharacter, so the delegate burner signs them and they add NO
///   wallet popup — consistent with movement and the rest of gameplay.
/// - `buyListedRoom` moves real ETH, so it is a direct, payable call from the
///   buyer's main wallet: one deliberate signature, outside the movement loop.
///   That is the single intentional popup the player opts into when buying.
///
/// Economics: the contract keeps a commission (basis points, hard-capped) in
/// ETH for the marketplace treasury; the remainder goes to the seller. ETH only
/// — no token is involved anywhere in this flow.
contract DungeonMarketplaceFacet is DungeonFacetBase {
    uint16 internal constant MAX_MARKETPLACE_FEE_BPS = 1000; // 10% hard cap

    // RoomListed / RoomUnlisted / RoomSold are declared in DungeonEvents so
    // ownership-changing facets (buyRoom/abandonRoom/deactivateRoom) can emit
    // the unlist when they clear a stale listing.
    event MarketplaceTreasuryUpdated(address indexed treasury);
    event MarketplaceFeeUpdated(uint16 bps);
    event Withdrawal(address indexed account, uint256 amount);
    event PayoutDeferred(address indexed account, uint256 amount);

    modifier nonReentrant() {
        require(_marketplaceLock == 0, "REENTRANCY");
        _marketplaceLock = 1;
        _;
        _marketplaceLock = 0;
    }

    // --- Admin (proxy/diamond owner only) ---

    function setMarketplaceTreasury(address payable treasury) external onlyOwner {
        require(treasury != address(0), "zero treasury");
        _marketplaceTreasury = treasury;
        emit MarketplaceTreasuryUpdated(treasury);
    }

    function setMarketplaceFeeBps(uint16 bps) external onlyOwner {
        require(bps <= MAX_MARKETPLACE_FEE_BPS, "fee too high");
        _marketplaceFeeBps = bps;
        emit MarketplaceFeeUpdated(bps);
    }

    function getMarketplaceConfig() external view returns (address treasury, uint16 bps) {
        return (_marketplaceTreasury, _marketplaceFeeBps);
    }

    /// @notice Current listing for a room. `seller` is non-zero only while the
    /// listing is still honourable (room active and seller still the sub-owner).
    function getRoomListing(uint256 location) external view returns (uint256 price, address seller) {
        price = _roomPrice[location];
        if (price > 0 && _isRoomActive(location)) {
            seller = address(uint160(_roomsContract.subOwnerOf(location)));
        }
    }

    function pendingWithdrawal(address account) external view returns (uint256) {
        return _pendingWithdrawals[account];
    }

    // --- Seller side (gasless via the delegate burner; onlyPlayer) ---

    function listRoom(uint256 characterId, uint256 location, uint256 price) external onlyPlayer {
        require(price > 0, "price must be > 0");
        uint256 seller = _charactersContract.getSubOwner(characterId);
        require(_isRoomActive(location), "room not active");
        require(_roomsContract.subOwnerOf(location) == seller, "not room owner");
        // A foreclosed keeper cannot sell: the cheap on-chain buyRoom path takes
        // precedence so squatters can't park a high price on a lapsed room.
        require(_taxDueDate[address(uint160(seller))] >= block.timestamp, "foreclosed");
        _roomPrice[location] = price;
        emit RoomListed(location, address(uint160(seller)), price);
    }

    function cancelRoomListing(uint256 characterId, uint256 location) external onlyPlayer {
        uint256 seller = _charactersContract.getSubOwner(characterId);
        require(_roomsContract.subOwnerOf(location) == seller, "not room owner");
        require(_roomPrice[location] > 0, "not listed");
        delete _roomPrice[location];
        emit RoomUnlisted(location, address(uint160(seller)));
    }

    // --- Buyer side (direct payable call from the main wallet; one popup) ---

    function buyListedRoom(uint256 location) external payable nonReentrant {
        uint256 price = _roomPrice[location];
        require(price > 0, "not listed");
        require(_isRoomActive(location), "room not active");

        uint256 sellerSub = _roomsContract.subOwnerOf(location);
        address payable seller = payable(address(uint160(sellerSub)));
        require(seller != address(0), "no seller");
        // Mirror listRoom: a lapsed keeper's listing is void; the buyRoom path applies.
        require(_taxDueDate[seller] >= block.timestamp, "foreclosed");

        address buyer = msg.sender;
        require(buyer != seller, "cannot buy own room");
        require(msg.value >= price, "insufficient payment");

        uint256 buyerSub = uint256(uint160(buyer));

        // Treasury unset => no commission is skimmed (the whole price goes to the
        // seller) so ETH can never get stranded with no recipient.
        uint256 fee = 0;
        address payable treasury = _marketplaceTreasury;
        if (treasury != address(0)) {
            fee = (price * _marketplaceFeeBps) / 10000;
        }
        uint256 proceeds = price - fee;

        // Effects: clear the listing and move sub-ownership before any ETH
        // leaves the contract (checks-effects-interactions).
        delete _roomPrice[location];
        _roomsContract.subTransferFrom(address(this), sellerSub, buyerSub, location);
        _initializeTaxDueDate(buyerSub);
        if (_roomsContract.subBalanceOf(sellerSub) == 0) {
            delete _taxDueDate[seller];
        }
        emit RoomSold(location, seller, buyer, price, fee);

        // Interactions: pay out (best-effort push, fall back to pull on failure)
        // then refund any overpayment.
        if (fee > 0) {
            _payout(treasury, fee);
        }
        _payout(seller, proceeds);

        uint256 refund = msg.value - price;
        if (refund > 0) {
            (bool ok, ) = payable(buyer).call{value: refund}("");
            require(ok, "refund failed");
        }
    }

    function withdraw() external nonReentrant {
        uint256 amount = _pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to withdraw");
        _pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw failed");
        emit Withdrawal(msg.sender, amount);
    }

    /// @dev Best-effort push. If the recipient is a contract that reverts on
    /// receive, the amount is credited for a later pull via `withdraw()`, so a
    /// griefing recipient can never brick the sale for everyone else.
    function _payout(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) {
            _pendingWithdrawals[to] += amount;
            emit PayoutDeferred(to, amount);
        }
    }
}
