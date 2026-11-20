/**
 * Optional one-shot live Avalanche Fuji (43113) proof-of-execution script.
 * Executes exactly ONE minimal proof cycle on live Fuji C-Chain so judges inspecting
 * Snowtrace see real AgentExecuted, AuthorizationUsed (x402 EIP-3009), and ThreatLogged events:
 *   1) Agent signs EIP-3009 transferWithAuthorization (0.005 mUSDC -> X402_PAY_TO) settled by relayer.
 *   2) Signer signs EIP-712 SecurityClearance for 1 mUSDC -> MockPartner; Agent calls GuardVault.execute.
 *   3) Authorized reporter records 1 sample threat hash on Fuji ThreatAuditLog.
 *
 * Requires env vars (never commit keys to Git):
 *   AEGIS_SIGNER_PRIVATE_KEY, AGENT_SESSION_PRIVATE_KEY, RELAYER_PRIVATE_KEY (optional, defaults to signer)
 *   AUDIT_REPORTER_PRIVATE_KEY (optional, defaults to signer)
 */
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  parseAbi,
  parseSignature,
  stringToHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { fuji, rpc, vaultAbi } from "../src/fuji.ts";
import { auditAbi } from "../src/audit.ts";

const signerKey = process.env.AEGIS_SIGNER_PRIVATE_KEY as Hex | undefined;
const agentKey = (process.env.AGENT_SESSION_PRIVATE_KEY ||
  process.env.X402_PAYER_PRIVATE_KEY) as Hex | undefined;
const relayerKey = (process.env.RELAYER_PRIVATE_KEY || signerKey) as
  | Hex
  | undefined;
const reporterKey = (process.env.AUDIT_REPORTER_PRIVATE_KEY || signerKey) as
  | Hex
  | undefined;

if (!signerKey || !agentKey || !relayerKey || !reporterKey) {
  console.error(
    "Missing keys. Set AEGIS_SIGNER_PRIVATE_KEY and AGENT_SESSION_PRIVATE_KEY (and optional RELAYER_PRIVATE_KEY / AUDIT_REPORTER_PRIVATE_KEY) in terminal env before running.",
  );
  process.exit(1);
}

const signer = privateKeyToAccount(signerKey);
const agent = privateKeyToAccount(agentKey);
const relayer = privateKeyToAccount(relayerKey);
const reporter = privateKeyToAccount(reporterKey);
const auditContract =
  (process.env.AUDIT_FALLBACK_CONTRACT_ADDRESS as `0x${string}` | undefined) ||
  "0x1c755dE79A9bFd54Cf0c559C97FfeDC58BF1Fec6";

const transport = http(rpc, { timeout: 20000 });
const client = createPublicClient({ chain: avalancheFuji, transport });
const chainId = await client.getChainId();
if (chainId !== 43113) throw Error("Refusing to run: expected Fuji 43113");

const head = await client.getBlock();
const [onchainAgent, onchainSigner, nonce] = await Promise.all([
  client.readContract({ address: fuji.vault, abi: vaultAbi, functionName: "agent" }),
  client.readContract({ address: fuji.vault, abi: vaultAbi, functionName: "signer" }),
  client.readContract({ address: fuji.vault, abi: vaultAbi, functionName: "nonce" }),
]);
if (onchainAgent.toLowerCase() !== agent.address.toLowerCase())
  throw Error(`Agent key mismatch: expected ${onchainAgent}, got ${agent.address}`);
if (onchainSigner.toLowerCase() !== signer.address.toLowerCase())
  throw Error(`Signer key mismatch: expected ${onchainSigner}, got ${signer.address}`);

const usdcAbi = parseAbi([
  "function faucet()",
  "function balanceOf(address) view returns (uint256)",
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)",
]);

const agentWallet = createWalletClient({ account: agent, chain: avalancheFuji, transport });
const relayerWallet = createWalletClient({ account: relayer, chain: avalancheFuji, transport });
const reporterWallet = createWalletClient({ account: reporter, chain: avalancheFuji, transport });

// Step 1: Ensure agent has >= 5000 base units (0.005 mUSDC) for x402 fee
const agentUsdc = await client.readContract({
  address: fuji.token,
  abi: usdcAbi,
  functionName: "balanceOf",
  args: [agent.address],
});
if (agentUsdc < 5000n) {
  const fHash = await agentWallet.writeContract({
    address: fuji.token,
    abi: usdcAbi,
    functionName: "faucet",
  });
  await client.waitForTransactionReceipt({ hash: fHash });
  console.log("1a. Agent faucet tx:", fHash);
}

// Step 1b: Real EIP-3009 x402 micropayment (0.005 mUSDC) on Fuji
const payTo = (process.env.X402_PAY_TO as `0x${string}` | undefined) || fuji.owner;
const authNonce = keccak256(stringToHex("aegis-fuji-proof-" + head.timestamp));
const validAfter = head.timestamp - 60n;
const validBefore = head.timestamp + 600n;
const eip3009Sig = await agent.signTypedData({
  domain: {
    name: "Aegis Mock USDC",
    version: "1",
    chainId: 43113,
    verifyingContract: fuji.token,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from: agent.address,
    to: payTo,
    value: 5000n,
    validAfter,
    validBefore,
    nonce: authNonce,
  },
});
const { v, r, s } = parseSignature(eip3009Sig);
const x402Tx = await relayerWallet.writeContract({
  address: fuji.token,
  abi: usdcAbi,
  functionName: "transferWithAuthorization",
  args: [agent.address, payTo, 5000n, validAfter, validBefore, authNonce, Number(v), r, s],
});
const x402Rcpt = await client.waitForTransactionReceipt({ hash: x402Tx });
console.log("1. Fuji x402 EIP-3009 settlement:", x402Tx, x402Rcpt.status);

// Step 2: Real GuardVault.execute (1 mUSDC -> MockPartner) with EIP-712 SecurityClearance
const calldata = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [fuji.partner, 1_000_000n],
});
const deadline = head.timestamp + 300n;
const clearanceSig = await signer.signTypedData({
  domain: {
    name: "AegisAVAX GuardVault",
    version: "1",
    chainId: 43113,
    verifyingContract: fuji.vault,
  },
  types: {
    SecurityClearance: [
      { name: "vault", type: "address" },
      { name: "agent", type: "address" },
      { name: "target", type: "address" },
      { name: "calldataHash", type: "bytes32" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "SecurityClearance",
  message: {
    vault: fuji.vault,
    agent: agent.address,
    target: fuji.token,
    calldataHash: keccak256(calldata),
    value: 0n,
    nonce,
    deadline,
  },
});
const execTx = await agentWallet.writeContract({
  address: fuji.vault,
  abi: vaultAbi,
  functionName: "execute",
  args: [fuji.token, calldata, 0n, deadline, clearanceSig],
});
const execRcpt = await client.waitForTransactionReceipt({ hash: execTx });
console.log("2. Fuji GuardVault.execute (1 mUSDC):", execTx, execRcpt.status);

// Step 3: Real ThreatAuditLog.logThreat on Fuji
const threatId = keccak256(stringToHex("aegis-fuji-threat-proof-" + head.number));
const riskHash = keccak256(stringToHex('["CRITICAL",false,["UNLIMITED_APPROVAL","UNVERIFIED_OR_SCAM_CONTRACT"]]'));
const auditTx = await reporterWallet.writeContract({
  address: auditContract,
  abi: auditAbi,
  functionName: "logThreat",
  args: [threatId, riskHash, 2, head.timestamp],
});
const auditRcpt = await client.waitForTransactionReceipt({ hash: auditTx });
console.log("3. Fuji ThreatAuditLog.logThreat:", auditTx, auditRcpt.status);

console.log(
  JSON.stringify(
    {
      network: "Avalanche Fuji (43113)",
      x402SettlementTx: x402Tx,
      guardVaultExecuteTx: execTx,
      threatAuditLogTx: auditTx,
    },
    null,
    2,
  ),
);
