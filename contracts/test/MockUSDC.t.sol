// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../src/MockUSDC.sol";
import {FoundryTest} from "./GuardVault.t.sol";

contract MockUSDCTest is FoundryTest {
    MockUSDC token;
    uint256 constant KEY = 8181;
    uint256 constant FEE = 5000;
    bytes32 constant NONCE = keccak256("invoice-one");
    address payer;
    address constant PAYEE = address(123);

    function setUp() public {
        vm.warp(100);
        token = new MockUSDC();
        payer = vm.addr(KEY);
        vm.prank(payer);
        token.faucet();
    }

    function sign(bytes32 typeHash) internal view returns (uint8, bytes32, bytes32) {
        bytes32 fields = keccak256(abi.encode(typeHash, payer, PAYEE, FEE, uint256(1), uint256(200), NONCE));
        return signFields(fields);
    }

    function signFields(bytes32 fields) internal view returns (uint8, bytes32, bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Aegis Mock USDC"),
                keccak256("1"),
                block.chainid,
                address(token)
            )
        );
        return vm.sign(KEY, keccak256(abi.encodePacked(hex"1901", domain, fields)));
    }

    function testRelayerSettlesExactFeeOnce() public {
        (uint8 v, bytes32 r, bytes32 s) = sign(token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH());
        token.transferWithAuthorization(payer, PAYEE, FEE, 1, 200, NONCE, v, r, s);
        require(token.decimals() == 6 && token.balanceOf(PAYEE) == FEE && token.authorizationState(payer, NONCE));
        vm.expectRevert(MockUSDC.AuthorizationUnavailable.selector);
        token.transferWithAuthorization(payer, PAYEE, FEE, 1, 200, NONCE, v, r, s);
    }

    function testReceiveRequiresPayee() public {
        (uint8 v, bytes32 r, bytes32 s) = sign(token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH());
        vm.expectRevert(MockUSDC.PayeeRequired.selector);
        token.receiveWithAuthorization(payer, PAYEE, FEE, 1, 200, NONCE, v, r, s);
        vm.prank(PAYEE);
        token.receiveWithAuthorization(payer, PAYEE, FEE, 1, 200, NONCE, v, r, s);
        require(token.balanceOf(PAYEE) == FEE);
    }

    function testSignedCancellationInvalidatesPayment() public {
        (uint8 v, bytes32 r, bytes32 s) =
            signFields(keccak256(abi.encode(token.CANCEL_AUTHORIZATION_TYPEHASH(), payer, NONCE)));
        token.cancelAuthorization(payer, NONCE, v, r, s);
        (v, r, s) = sign(token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH());
        vm.expectRevert(MockUSDC.AuthorizationUnavailable.selector);
        token.transferWithAuthorization(payer, PAYEE, FEE, 1, 200, NONCE, v, r, s);
    }

    function testOpenValidityInterval() public {
        (uint8 v, bytes32 r, bytes32 s) = sign(token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH());
        vm.warp(1);
        vm.expectRevert(MockUSDC.InvalidTime.selector);
        token.transferWithAuthorization(payer, PAYEE, FEE, 1, 200, NONCE, v, r, s);
        vm.warp(200);
        vm.expectRevert(MockUSDC.InvalidTime.selector);
        token.transferWithAuthorization(payer, PAYEE, FEE, 1, 200, NONCE, v, r, s);
        require(!token.authorizationState(payer, NONCE));
    }

    function testSignatureBindsPaymentAmount() public {
        (uint8 v, bytes32 r, bytes32 s) = sign(token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH());
        vm.expectRevert(MockUSDC.InvalidSigner.selector);
        token.transferWithAuthorization(payer, PAYEE, FEE + 1, 1, 200, NONCE, v, r, s);
        require(!token.authorizationState(payer, NONCE));
    }
}
