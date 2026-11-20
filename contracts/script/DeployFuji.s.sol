// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../src/MockUSDC.sol";
import {MockPartner} from "../src/MockPartner.sol";
import {MockDrainer} from "../src/MockDrainer.sol";
import {GuardVault} from "../src/GuardVault.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {ScamRegistry} from "../src/ScamRegistry.sol";
import {ThreatAuditLog} from "../src/ThreatAuditLog.sol";

interface BroadcastVm {
    function envAddress(string calldata key) external view returns (address);
    function startBroadcast(address sender) external;
    function stopBroadcast() external;
}

contract DeployFuji {
    BroadcastVm private constant vm = BroadcastVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        require(block.chainid == 43113, "Expected Fuji chain 43113");
        address owner = vm.envAddress("DEPLOYER_ADDRESS");
        address signer = vm.envAddress("AEGIS_SIGNER_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");
        require(owner != address(0) && signer != address(0) && agent != address(0), "Missing role address");
        require(owner != signer && owner != agent && agent != signer, "Use separate roles");

        vm.startBroadcast(owner);
        MockUSDC token = new MockUSDC();
        MockPartner partner = new MockPartner();
        MockDrainer flagged = new MockDrainer();
        PolicyModule policy = new PolicyModule(owner, address(token), 10e6, 25e6);
        GuardVault vault = new GuardVault(owner, policy, signer);
        ScamRegistry registry = new ScamRegistry(owner);
        ThreatAuditLog audit = new ThreatAuditLog(owner);

        policy.setTargetAllowed(address(partner), true);
        registry.setFlag(address(flagged), true);
        audit.setReporter(signer, true);
        vault.grantAgent(agent);
        token.faucet();
        require(token.transfer(address(vault), 100e6), "Vault funding failed");
        vm.stopBroadcast();
    }
}
