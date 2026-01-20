// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface Pool {
    function register() external;

    function recordCharge(
        address account,
        uint256 txCharge,
        uint256 poolFee
    ) external payable;
}
