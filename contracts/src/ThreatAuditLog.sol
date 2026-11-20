// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ThreatAuditLog is Ownable {
    enum RiskLevel {
        Safe,
        Medium,
        Critical
    }
    mapping(address => bool) public reporters;
    mapping(bytes32 => bool) public recorded;

    error UnauthorizedReporter();
    error InvalidReport();
    event ReporterUpdated(address indexed reporter, bool allowed);
    event ThreatLogged(bytes32 indexed id, bytes32 indexed riskHash, RiskLevel level, uint256 observedAt);
    constructor(address admin) Ownable(admin) {}

    function setReporter(address reporter, bool allowed) external onlyOwner {
        reporters[reporter] = allowed;
        emit ReporterUpdated(reporter, allowed);
    }

    function logThreat(bytes32 id, bytes32 riskHash, RiskLevel level, uint256 observedAt) external {
        if (!reporters[msg.sender]) revert UnauthorizedReporter();
        if (id == 0 || riskHash == 0 || recorded[id] || observedAt > block.timestamp) revert InvalidReport();
        recorded[id] = true;
        emit ThreatLogged(id, riskHash, level, observedAt);
    }
}
