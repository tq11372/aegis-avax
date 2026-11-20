// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FoundryTest} from "./GuardVault.t.sol";
import {ScamRegistry} from "../src/ScamRegistry.sol";
import {ThreatAuditLog} from "../src/ThreatAuditLog.sol";

contract RegistryTest is FoundryTest {
    function testRegistryFlagAndClear() public {
        ScamRegistry registry = new ScamRegistry(address(this));
        address fixture = address(123);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, fixture));
        vm.prank(fixture);
        registry.setFlag(fixture, true);
        registry.setFlag(fixture, true);
        require(registry.isFlagged(fixture));
        registry.setFlag(fixture, false);
        require(!registry.isFlagged(fixture));
    }

    function testOnlyReporterCanRecordUniqueEvidence() public {
        ThreatAuditLog audit = new ThreatAuditLog(address(this));
        bytes32 id = keccak256("simulated-transaction");
        bytes32 evidence = keccak256("risk report");
        vm.expectRevert(ThreatAuditLog.UnauthorizedReporter.selector);
        audit.logThreat(id, evidence, ThreatAuditLog.RiskLevel.Critical, block.timestamp);
        audit.setReporter(address(this), true);
        audit.logThreat(id, evidence, ThreatAuditLog.RiskLevel.Critical, block.timestamp);
        require(audit.recorded(id));
        vm.expectRevert(ThreatAuditLog.InvalidReport.selector);
        audit.logThreat(id, evidence, ThreatAuditLog.RiskLevel.Critical, block.timestamp);
    }
}
