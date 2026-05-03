// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ERC721Token.sol";
import "./ERC2981Royalties.sol";

contract Gears is ERC721Token, ERC2981Royalties {
    function postUpgrade(address dungeon) public override {
        super.postUpgrade(dungeon);
    }

    function setRoyalty(address receiver, uint96 bps) external onlyProxyAdmin {
        _setRoyalty(receiver, bps);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 /* ERC-165 */
            || _supportsRoyaltyInterface(interfaceId);
    }
}
