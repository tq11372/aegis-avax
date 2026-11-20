// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ThreatAuditLog} from "../src/ThreatAuditLog.sol";

interface AuditVm {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(address sender) external;
    function stopBroadcast() external;
}

contract DeployAudit {
    AuditVm private constant vm = AuditVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function run() external returns (ThreatAuditLog log) {
        uint256 expected = vm.envUint("AUDIT_L1_CHAIN_ID");
        require(block.chainid == expected && expected != 43113 && expected != 43114 && expected != 1, "Expected dedicated test L1");
        address admin = vm.envAddress("DEPLOYER_ADDRESS");
        address reporter = vm.envAddress("AUDIT_REPORTER_ADDRESS");
        require(admin != address(0) && reporter != address(0), "Missing audit roles");
        vm.startBroadcast(admin);
        log = new ThreatAuditLog(admin);
        log.setReporter(reporter, true);
        vm.stopBroadcast();
    }
}
