// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ScamRegistry is Ownable {
    mapping(address => bool) public isFlagged;
    event FlagUpdated(address indexed account, bool flagged);

    constructor(address admin) Ownable(admin) {}

    function setFlag(address account, bool flagged) external onlyOwner {
        isFlagged[account] = flagged;
        emit FlagUpdated(account, flagged);
    }
}
