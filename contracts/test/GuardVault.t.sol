// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {GuardVault, VaultErrors} from "../src/GuardVault.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockPartner} from "../src/MockPartner.sol";

interface TestVm {
    function addr(uint256 key) external pure returns (address);
    function sign(uint256 key, bytes32 digest) external pure returns (uint8, bytes32, bytes32);
    function prank(address caller) external;
    function expectRevert(bytes4 err) external;
    function expectRevert(bytes calldata err) external;
    function warp(uint256 timestamp) external;
    function deal(address account, uint256 balance) external;
    function chainId(uint256 id) external;
}

abstract contract FoundryTest {
    TestVm internal constant vm = TestVm(address(uint160(uint256(keccak256("hevm cheat code")))));
}

contract GuardVaultTest is FoundryTest {
    uint256 constant KEY = 1234;
    address constant AGENT = address(0xA);
    uint256 constant DEADLINE = 10 days;
    MockUSDC token;
    address partner;
    PolicyModule policy;
    GuardVault vault;

    receive() external payable {}

    function setUp() public {
        vm.warp(2 days);
        token = new MockUSDC();
        partner = address(new MockPartner());
        policy = new PolicyModule(address(this), address(token), 10e6, 15e6);
        vault = new GuardVault(address(this), policy, vm.addr(KEY));
        policy.setTargetAllowed(partner, true);
        vault.grantAgent(AGENT);
        token.faucet();
        token.transfer(address(vault), 100e6);
    }

    function payment(address recipient, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodeCall(IERC20.transfer, (recipient, amount));
    }

    // Build the digest independently, as an off-chain verifier would.
    function signature(bytes memory data, uint256 deadline, uint256 key) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AegisAVAX GuardVault"),
                keccak256("1"),
                block.chainid,
                address(vault)
            )
        );
        bytes32 fields = keccak256(
            abi.encode(
                keccak256(
                    "SecurityClearance(address vault,address agent,address target,bytes32 calldataHash,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                address(vault),
                AGENT,
                address(token),
                keccak256(data),
                uint256(0),
                vault.nonce(),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked(hex"1901", domain, fields)));
        return abi.encodePacked(r, s, v);
    }

    function send(bytes memory data, bytes memory sig) internal {
        vm.prank(AGENT);
        vault.execute(address(token), data, 0, DEADLINE, sig);
    }

    function pay(uint256 amount) internal {
        bytes memory data = payment(partner, amount);
        send(data, signature(data, DEADLINE, KEY));
    }

    function testDepositAndOwnerWithdrawal() public {
        vault.withdrawToken(token, 4e6);
        require(token.balanceOf(address(vault)) == 96e6 && token.balanceOf(address(this)) == 4e6);
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        require(ok);
        vault.withdrawNative(1 ether);
        require(address(this).balance == 1 ether);
    }

    function testCleanPayment() public {
        uint256 seq = vault.nonce();
        pay(3e6);
        require(token.balanceOf(partner) == 3e6 && vault.spentInWindow() == 3e6 && vault.nonce() == seq + 1);
    }

    function testTxLimit() public {
        bytes memory data = payment(partner, 10e6 + 1);
        vm.expectRevert(PolicyModule.TxLimitExceeded.selector);
        send(data, "");
    }

    function testDailyLimit() public {
        pay(10e6);
        bytes memory data = payment(partner, 5e6 + 1);
        vm.expectRevert(PolicyModule.DailyCapExceeded.selector);
        send(data, "");
        require(vault.spentInWindow() == 10e6 && token.balanceOf(partner) == 10e6);
    }

    function testRollingDayExpiresOnlyOldPayments() public {
        pay(8e6);
        vm.warp(3 days - 1);
        pay(7e6);
        vm.warp(3 days);
        require(vault.spentInWindow() == 7e6);
        pay(8e6);
        require(vault.spentInWindow() == 15e6);
        vm.warp(4 days);
        require(vault.spentInWindow() == 0);
    }

    function testUnknownRecipient() public {
        bytes memory data = payment(address(0xB), 1);
        vm.expectRevert(PolicyModule.TargetNotWhitelisted.selector);
        send(data, "");
    }

    function testTokenDisabled() public {
        policy.setTokenAllowed(false);
        bytes memory data = payment(partner, 1);
        vm.expectRevert(PolicyModule.TokenNotWhitelisted.selector);
        send(data, "");
    }

    function testWrongSigner() public {
        bytes memory data = payment(partner, 1);
        bytes memory sig = signature(data, DEADLINE, 1235);
        vm.expectRevert(GuardVault.InvalidSecurityClearance.selector);
        send(data, sig);
    }

    function testExpiredClearance() public {
        bytes memory data = payment(partner, 1);
        bytes memory sig = signature(data, 1 days, KEY);
        vm.expectRevert(GuardVault.ClearanceExpired.selector);
        vm.prank(AGENT);
        vault.execute(address(token), data, 0, 1 days, sig);
    }

    function testCannotReuseClearance() public {
        bytes memory data = payment(partner, 1);
        bytes memory sig = signature(data, DEADLINE, KEY);
        send(data, sig);
        vm.expectRevert(GuardVault.InvalidSecurityClearance.selector);
        send(data, sig);
    }

    function testClearanceBindsAmount() public {
        bytes memory sig = signature(payment(partner, 1), DEADLINE, KEY);
        bytes memory changed = payment(partner, 2);
        vm.expectRevert(GuardVault.InvalidSecurityClearance.selector);
        send(changed, sig);
    }

    function testClearanceBindsChain() public {
        bytes memory data = payment(partner, 1);
        bytes memory sig = signature(data, DEADLINE, KEY);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(GuardVault.InvalidSecurityClearance.selector);
        send(data, sig);
    }

    function testRevocationAndRegrantInvalidateOldClearance() public {
        bytes memory data = payment(partner, 1);
        bytes memory sig = signature(data, DEADLINE, KEY);
        vault.revokeAgent();
        vm.expectRevert(VaultErrors.AgentRevoked.selector);
        send(data, sig);
        vault.grantAgent(AGENT);
        vm.expectRevert(GuardVault.InvalidSecurityClearance.selector);
        send(data, sig);
    }

    function testPauseBlocksApprovedPaymentsAndAllowsOwnerRecovery() public {
        bytes memory data = payment(partner, 1);
        bytes memory sig = signature(data, DEADLINE, KEY);
        vault.pause();
        vm.expectRevert(VaultErrors.AgentRevoked.selector);
        send(data, sig);
        vault.withdrawToken(token, 1);
        vault.unpause();
        vm.expectRevert(GuardVault.InvalidSecurityClearance.selector);
        send(data, sig);
        pay(1);
    }

    function testOnlyOwnerMayManageFundsOrPolicy() public {
        bytes memory denied = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, AGENT);
        vm.expectRevert(denied);
        vm.prank(AGENT);
        vault.withdrawToken(token, 1);
        vm.expectRevert(denied);
        vm.prank(AGENT);
        policy.setLimits(1, 2, false);
        vm.expectRevert(denied);
        vm.prank(AGENT);
        vault.grantAgent(address(0xB));
    }

    function testOnlyCurrentAgentCanExecute() public {
        bytes memory data = payment(partner, 1);
        bytes memory sig = signature(data, DEADLINE, KEY);
        vm.expectRevert(VaultErrors.AgentRevoked.selector);
        vault.execute(address(token), data, 0, DEADLINE, sig);
    }

    function testMissingClearance() public {
        bytes memory data = payment(partner, 1);
        vm.expectRevert(GuardVault.InvalidSecurityClearance.selector);
        send(data, "");
    }

    function testUnsupportedSelectorAndNativeValue() public {
        bytes memory data = abi.encodeCall(IERC20.balanceOf, (partner));
        vm.expectRevert(GuardVault.UnsupportedCall.selector);
        send(data, "");
        data = payment(partner, 1);
        vm.expectRevert(GuardVault.UnsupportedCall.selector);
        vm.prank(AGENT);
        vault.execute(address(token), data, 1, DEADLINE, "");
    }

    function testTokenFailureRollsBackAccounting() public {
        vault.withdrawToken(token, 100e6);
        uint256 seq = vault.nonce();
        bytes memory data = payment(partner, 1);
        bytes memory sig = signature(data, DEADLINE, KEY);
        vm.expectRevert(
            abi.encodeWithSignature("ERC20InsufficientBalance(address,uint256,uint256)", address(vault), 0, 1)
        );
        send(data, sig);
        require(vault.spentInWindow() == 0 && vault.nonce() == seq);
    }

    function testFuzzOptionalClearanceStillEnforcesLimits(uint96 seed) public {
        policy.setLimits(10e6, 15e6, false);
        uint256 amount = uint256(seed) % 10e6 + 1;
        send(payment(partner, amount), "");
        require(vault.spentInWindow() == amount && token.balanceOf(partner) == amount);
        bytes memory data = payment(partner, 11e6);
        vm.expectRevert(PolicyModule.TxLimitExceeded.selector);
        send(data, "");
    }
}
