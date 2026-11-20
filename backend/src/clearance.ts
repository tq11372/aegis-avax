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

const POLICY_REVERTS: Record<string, string> = {
  TxLimitExceeded: "Vượt hạn mức tối đa mỗi giao dịch (TxLimitExceeded).",
  DailyCapExceeded: "Vượt tổng hạn mức chi tiêu trong cửa sổ trượt 24 giờ (DailyCapExceeded).",
  TargetNotWhitelisted: "Địa chỉ người nhận không nằm trong targetWhitelist (TargetNotWhitelisted).",
  TokenNotWhitelisted: "Token không được phép chi tiêu (TokenNotWhitelisted).",
  AgentRevoked: "Session key của AI Agent đã bị thu hồi hoặc két đang tạm dừng (AgentRevoked).",
  InvalidSecurityClearance: "Chữ ký EIP-712 Security Clearance không hợp lệ (InvalidSecurityClearance).",
  ClearanceExpired: "Chữ ký EIP-712 Security Clearance đã hết hạn (ClearanceExpired).",
};

export class PolicyRejectionError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? POLICY_REVERTS[code] ?? `Hợp đồng từ chối (${code}).`);
    this.name = "PolicyRejectionError";
    this.code = code;
  }
}

export function extractRevertCode(error: unknown): string | undefined {
  const text = String(error);
  for (const code of Object.keys(POLICY_REVERTS)) {
    if (text.includes(code)) return code;
  }
  return undefined;
}

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
  if (paused || /^0x0{40}$/i.test(agent))
    throw new PolicyRejectionError("AgentRevoked");
  if (!isSame(signer, signing.address))
    throw Error("Vault signing unavailable");
  try {
    await chain.readContract({
      address: fuji.policy,
      abi: policyAbi,
      functionName: "check",
      args: [fuji.token, transfer.recipient, BigInt(transfer.amount), spent],
      blockNumber: head.number,
    });
  } catch (err) {
    const code = extractRevertCode(err);
    if (code) throw new PolicyRejectionError(code);
    throw err;
  }
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
  try {
    await chain.simulateContract({
      account: agent,
      address: fuji.vault,
      abi: vaultAbi,
      functionName: "execute",
      args: [scan.to, scan.data, 0n, deadline, signature],
    });
  } catch (err) {
    const code = extractRevertCode(err);
    if (code) throw new PolicyRejectionError(code);
    throw err;
  }
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
