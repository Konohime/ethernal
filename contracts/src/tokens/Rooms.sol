// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./ERC721Token.sol";
import "./ERC2981Royalties.sol";

contract Rooms is ERC721Token, ERC2981Royalties {
    function postUpgrade(address dungeon) public override {
        super.postUpgrade(dungeon);
    }

    function mintId(uint256 id, uint256 subOwner) public {
        require(msg.sender == _minter, "NOT_AUTHORIZED_MINT");
        _subOwners[id] = subOwner;
        _subNumNFTPerAddress[subOwner]++;
        _owners[id] = _minter;
        emit Transfer(address(0), _minter, id);
        emit SubTransfer(0, subOwner, id);
    }

    function setRoyalty(address receiver, uint96 bps) external onlyProxyAdmin {
        _setRoyalty(receiver, bps);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 /* ERC-165 */
            || _supportsRoyaltyInterface(interfaceId);
    }
}
