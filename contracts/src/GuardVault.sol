// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {PolicyModule} from "./PolicyModule.sol";

library VaultErrors {
    error AgentRevoked();
}

contract GuardVault is Ownable, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CLEARANCE_TYPEHASH = keccak256(
        "SecurityClearance(address vault,address agent,address target,bytes32 calldataHash,uint256 value,uint256 nonce,uint256 deadline)"
    );

    struct Checkpoint {
        uint256 timestamp;
        uint256 total;
    }
    Checkpoint[] private history;
    PolicyModule public immutable policy;
    address public immutable signer;
    address public agent;
    uint256 public nonce;
    bool public paused;

    error InvalidAddress();
    error UnsupportedCall();
    error InvalidSecurityClearance();
    error ClearanceExpired();
    event AgentGranted(address indexed agent);
    event AgentRevoked(address indexed agent);
    event PauseChanged(bool paused);
    event AgentExecuted(
        address indexed agent, address indexed token, address indexed recipient, uint256 amount, uint256 nonce
    );

    constructor(address owner_, PolicyModule policy_, address signer_)
        Ownable(owner_)
        EIP712("AegisAVAX GuardVault", "1")
    {
        if (address(policy_).code.length == 0 || signer_ == address(0) || signer_ == owner_) {
            revert InvalidAddress();
        }
        policy = policy_;
        signer = signer_;
    }

    receive() external payable {}

    function withdrawToken(IERC20 token, uint256 amount) external onlyOwner nonReentrant {
        token.safeTransfer(owner(), amount);
    }

    function withdrawNative(uint256 amount) external onlyOwner nonReentrant {
        Address.sendValue(payable(owner()), amount);
    }

    function grantAgent(address next) external onlyOwner {
        if (next == address(0) || next == owner() || next == signer) revert InvalidAddress();
        if (agent != address(0)) emit AgentRevoked(agent);
        ++nonce;
        agent = next;
        emit AgentGranted(next);
    }

    function revokeAgent() external onlyOwner {
        emit AgentRevoked(agent);
        delete agent;
        ++nonce;
    }

    function pause() external onlyOwner {
        paused = true;
        ++nonce;
        emit PauseChanged(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit PauseChanged(false);
    }

    // Upper bound search for the first payment strictly inside (now - 24h, now].
    function spentInWindow() public view returns (uint256) {
        uint256 end = history.length;
        if (end == 0) return 0;
        uint256 total = history[end - 1].total;
        if (block.timestamp < 1 days) return total;
        uint256 cutoff = block.timestamp - 1 days;
        uint256 start;
        while (start < end) {
            uint256 mid = start + (end - start) / 2;
            if (history[mid].timestamp <= cutoff) start = mid + 1;
            else end = mid;
        }
        return start == 0 ? total : total - history[start - 1].total;
    }

    function clearanceDigest(
        address caller,
        address target,
        bytes32 calldataHash,
        uint256 value,
        uint256 seq,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(CLEARANCE_TYPEHASH, address(this), caller, target, calldataHash, value, seq, deadline))
        );
    }

    function execute(address target, bytes calldata data, uint256 value, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
    {
        if (paused || msg.sender != agent) revert VaultErrors.AgentRevoked();
        if (value != 0 || data.length != 68 || bytes4(data[:4]) != IERC20.transfer.selector) revert UnsupportedCall();
        (address recipient, uint256 amount) = abi.decode(data[4:], (address, uint256));
        policy.check(target, recipient, amount, spentInWindow());
        uint256 seq = nonce++;
        if (policy.requireClearance()) {
            if (block.timestamp > deadline) revert ClearanceExpired();
            bytes32 digest = clearanceDigest(msg.sender, target, keccak256(data), value, seq, deadline);
            (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, signature);
            if (err != ECDSA.RecoverError.NoError || recovered != signer) revert InvalidSecurityClearance();
        }
        uint256 length = history.length;
        if (length > 0 && history[length - 1].timestamp == block.timestamp) {
            history[length - 1].total += amount;
        } else {
            uint256 previous = length == 0 ? 0 : history[length - 1].total;
            history.push(Checkpoint(block.timestamp, previous + amount));
        }
        IERC20(target).safeTransfer(recipient, amount);
        emit AgentExecuted(msg.sender, target, recipient, amount, seq);
    }
}
