import { keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  connect,
  fuji,
  isSame,
  policyAbi,
  rpc,
  vaultAbi,
  type Scan,
} from "./fuji.ts";
import type { confirmedTransfer } from "./risk.ts";

export async function issue(
  scan: Scan,
  transfer: NonNullable<ReturnType<typeof confirmedTransfer>>,
) {
  const key = process.env.AEGIS_SIGNER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw Error("Signer unavailable");
  const signing = privateKeyToAccount(key);
  const chain = connect(rpc);
  if ((await chain.getChainId()) !== 43113)
    throw Error("Unexpected signer network");
  const head = await chain.getBlock();
  const read = {
    address: fuji.vault,
    abi: vaultAbi,
    blockNumber: head.number,
  } as const;
  const [agent, nonce, signer, paused, spent] = await Promise.all([
    chain.readContract({ ...read, functionName: "agent" }),
    chain.readContract({ ...read, functionName: "nonce" }),
    chain.readContract({ ...read, functionName: "signer" }),
    chain.readContract({ ...read, functionName: "paused" }),
    chain.readContract({ ...read, functionName: "spentInWindow" }),
  ]);
  if (paused || /^0x0{40}$/i.test(agent) || !isSame(signer, signing.address))
    throw Error("Vault signing unavailable");
  await chain.readContract({
    address: fuji.policy,
    abi: policyAbi,
    functionName: "check",
    args: [fuji.token, transfer.recipient, BigInt(transfer.amount), spent],
    blockNumber: head.number,
  });
  const deadline = head.timestamp + 90n;
  const fields = [
    { name: "vault", type: "address" },
    { name: "agent", type: "address" },
    { name: "target", type: "address" },
    { name: "calldataHash", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ] as const;
  const signature = await signing.signTypedData({
    domain: {
      name: "AegisAVAX GuardVault",
      version: "1",
      chainId: 43113,
      verifyingContract: fuji.vault,
    },
    types: { SecurityClearance: fields },
    primaryType: "SecurityClearance",
    message: {
      vault: fuji.vault,
      agent,
      target: scan.to,
      calldataHash: keccak256(scan.data),
      value: 0n,
      nonce,
      deadline,
    },
  });
  // Apply the current policy and signature through the same entrypoint the agent uses.
  await chain.simulateContract({
    account: agent,
    address: fuji.vault,
    abi: vaultAbi,
    functionName: "execute",
    args: [scan.to, scan.data, 0n, deadline, signature],
  });
  return {
    signature,
    nonce: String(nonce),
    deadline: String(deadline),
    agent,
    vault: fuji.vault,
    target: scan.to,
    calldataHash: keccak256(scan.data),
  };
}
