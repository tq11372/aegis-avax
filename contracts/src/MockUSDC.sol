// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Six-decimal test token for Fuji. Each faucet call mints 100 test USDC.
contract MockUSDC is ERC20, EIP712 {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    error AuthorizationUnavailable();
    error InvalidTime();
    error InvalidSigner();
    error PayeeRequired();
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    constructor() ERC20("Aegis Mock USDC", "mUSDC") EIP712("Aegis Mock USDC", "1") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        _mint(msg.sender, 100e6);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _authorizedTransfer(
            TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, v, r, s
        );
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (msg.sender != to) revert PayeeRequired();
        _authorizedTransfer(
            RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, v, r, s
        );
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        _consume(authorizer, nonce, keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)), v, r, s);
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _authorizedTransfer(
        bytes32 kind,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        if (block.timestamp <= validAfter || block.timestamp >= validBefore) revert InvalidTime();
        bytes32 structHash = keccak256(abi.encode(kind, from, to, value, validAfter, validBefore, nonce));
        _consume(from, nonce, structHash, v, r, s);
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    function _consume(address authorizer, bytes32 nonce, bytes32 structHash, uint8 v, bytes32 r, bytes32 s) private {
        if (authorizationState[authorizer][nonce]) revert AuthorizationUnavailable();
        if (ECDSA.recover(_hashTypedDataV4(structHash), v, r, s) != authorizer) revert InvalidSigner();
        authorizationState[authorizer][nonce] = true;
    }
}
