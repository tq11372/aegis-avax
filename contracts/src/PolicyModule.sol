// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PolicyModule is Ownable {
    // All spending limits are in base units of this one settlement asset.
    address public immutable settlementToken;
    mapping(address => bool) public tokenWhitelist;
    mapping(address => bool) public targetWhitelist;
    uint256 public txLimit;
    uint256 public dailyCap;
    bool public requireClearance = true;

    error InvalidPolicy();
    error TxLimitExceeded();
    error DailyCapExceeded();
    error TokenNotWhitelisted();
    error TargetNotWhitelisted();
    event PolicyUpdated(uint256 txLimit, uint256 dailyCap, bool requireClearance);
    event TokenPermission(address indexed token, bool allowed);
    event TargetPermission(address indexed target, bool allowed);

    constructor(address owner_, address token, uint256 perTx, uint256 perDay) Ownable(owner_) {
        if (token.code.length == 0) revert InvalidPolicy();
        settlementToken = token;
        tokenWhitelist[token] = true;
        _setLimits(perTx, perDay, true);
    }

    function setLimits(uint256 perTx, uint256 perDay, bool clearance) external onlyOwner {
        _setLimits(perTx, perDay, clearance);
    }

    function _setLimits(uint256 perTx, uint256 perDay, bool clearance) private {
        if (perTx == 0 || perDay < perTx) revert InvalidPolicy();
        txLimit = perTx;
        dailyCap = perDay;
        requireClearance = clearance;
        emit PolicyUpdated(perTx, perDay, clearance);
    }

    function setTokenAllowed(bool allowed) external onlyOwner {
        tokenWhitelist[settlementToken] = allowed;
        emit TokenPermission(settlementToken, allowed);
    }

    function setTargetAllowed(address target, bool allowed) external onlyOwner {
        if (target == address(0)) revert InvalidPolicy();
        targetWhitelist[target] = allowed;
        emit TargetPermission(target, allowed);
    }

    function check(address token, address recipient, uint256 amount, uint256 spent) external view {
        if (!tokenWhitelist[token]) revert TokenNotWhitelisted();
        if (!targetWhitelist[recipient]) revert TargetNotWhitelisted();
        if (amount == 0 || amount > txLimit) revert TxLimitExceeded();
        if (spent > dailyCap || amount > dailyCap - spent) revert DailyCapExceeded();
    }
}
