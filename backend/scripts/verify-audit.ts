import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  parseAbi,
} from "viem";
function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw Error("Missing " + name);
  return value;
}
const url = required("AUDIT_L1_RPC_URL"),
  expected = Number(required("AUDIT_L1_CHAIN_ID"));
assert.ok(
  Number.isSafeInteger(expected) &&
    expected > 0 &&
    ![1, 43113, 43114].includes(expected),
  "Expected a dedicated test network",
);
const address = getAddress(required("AUDIT_LOG_CONTRACT_ADDRESS"));
const reporter = getAddress(required("AUDIT_REPORTER_ADDRESS"));
const admin = getAddress(required("DEPLOYER_ADDRESS"));
const client = createPublicClient({
  transport: http(url, { retryCount: 0, timeout: 10000 }),
});
assert.equal(await client.getChainId(), expected, "Unexpected RPC chain");
const block = await client.getBlock();
const abi = parseAbi([
  "function owner() view returns (address)",
  "function reporters(address) view returns (bool)",
]);
const [code, owner, allowed] = await Promise.all([
  client.getCode({ address, blockNumber: block.number }),
  client.readContract({
    address,
    abi,
    functionName: "owner",
    blockNumber: block.number,
  }),
  client.readContract({
    address,
    abi,
    functionName: "reporters",
    args: [reporter],
    blockNumber: block.number,
  }),
]);
const artifact = JSON.parse(
  await readFile(
    new URL(
      "../../contracts/out/ThreatAuditLog.sol/ThreatAuditLog.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
assert.ok(code && code !== "0x", "Missing audit contract");
assert.equal(
  keccak256(code),
  keccak256(artifact.deployedBytecode.object),
  "Runtime bytecode differs from local build",
);
assert.equal(getAddress(owner), admin, "Unexpected owner");
assert.equal(allowed, true, "Reporter is not authorized");
console.log(
  JSON.stringify(
    {
      chainId: expected,
      block: String(block.number),
      blockHash: block.hash,
      contract: address,
      runtimeHash: keccak256(code),
      owner,
      authorizedReporter: reporter,
    },
    null,
    2,
  ),
);
