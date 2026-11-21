import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  concatHex,
  decodeEventLog,
  keccak256,
  numberToHex,
  parseAbi,
  toRlp,
  type Hex,
} from "viem";

type Log = { address: Hex; topics: [Hex, ...Hex[]]; data: Hex };
type Receipt = {
  transactionHash: Hex;
  blockHash: Hex;
  blockNumber: Hex;
  transactionIndex: Hex;
  status: Hex;
  type: Hex;
  cumulativeGasUsed: Hex;
  logsBloom: Hex;
  logs: Log[];
  contractAddress: Hex | null;
  from: Hex;
  to: Hex | null;
};
type Header = {
  hash: Hex;
  parentHash: Hex;
  receiptsRoot: Hex;
  number: Hex;
  transactions: Hex[];
};
async function read(name: string) {
  return JSON.parse(
    await readFile(new URL("../../docs/" + name, import.meta.url), "utf8"),
  );
}
const snapshot: {
  chainId: number;
  blockchainID: string;
  blocks: { header: Header; receipt: Receipt }[];
  fujiSourceReceipt: Receipt;
} = await read("l1-receipts.json");
const manifest = await read("aegis-l1-proof.json");
const audit = manifest.l1Audit;
assert.equal(snapshot.chainId, 99321);
assert.equal(snapshot.blockchainID, audit.blockchainID);
assert.equal(snapshot.blocks.length, 3);
const abi = parseAbi([
  "event ReporterUpdated(address indexed reporter,bool allowed)",
  "event ThreatLogged(bytes32 indexed id, bytes32 indexed riskHash, uint8 level, uint256 observedAt)",
]);
function decode(
  receipt: Receipt,
  address: string,
  name: "ReporterUpdated" | "ThreatLogged",
) {
  const matches = receipt.logs
    .filter((log) => log.address.toLowerCase() === address.toLowerCase())
    .flatMap((log) => {
      const event = decodeEventLog({ abi, topics: log.topics, data: log.data });
      return event.eventName === name ? [event] : [];
    });
  assert.equal(matches.length, 1);
  return matches[0];
}
// Each of these three blocks contains exactly one transaction.
// RLP(transaction index 0) = 0x80. Its hex-prefix leaf path is 0x2080.
for (const [i, { header, receipt }] of snapshot.blocks.entries()) {
  assert.equal(header.number, numberToHex(i + 1));
  assert.deepEqual(header.transactions, [audit.rows[i].hash]);
  assert.equal(receipt.transactionHash, header.transactions[0]);
  assert.equal(receipt.blockHash, header.hash);
  assert.equal(receipt.blockNumber, header.number);
  assert.equal(receipt.transactionIndex, "0x0");
  assert.equal(receipt.status, "0x1");
  assert.equal(receipt.type, "0x2");
  if (i > 0)
    assert.equal(header.parentHash, snapshot.blocks[i - 1].header.hash);
  const payload = toRlp([
    "0x01",
    numberToHex(BigInt(receipt.cumulativeGasUsed)),
    receipt.logsBloom,
    receipt.logs.map((log) => [log.address, log.topics, log.data]),
  ]);
  const typedReceipt = concatHex(["0x02", payload]);
  assert.equal(
    keccak256(toRlp(["0x2080", typedReceipt])),
    header.receiptsRoot,
    "Receipt root mismatch",
  );
}
assert.equal(snapshot.blocks.at(-1)?.header.hash, manifest.verifiedBlockHash);
const [deploy, grant, write] = snapshot.blocks.map((x) => x.receipt);
assert.equal(
  deploy.contractAddress?.toLowerCase(),
  audit.contract.toLowerCase(),
);
assert.equal(deploy.from.toLowerCase(), audit.owner.toLowerCase());
assert.equal(grant.from.toLowerCase(), audit.owner.toLowerCase());
assert.equal(write.from.toLowerCase(), audit.reporter.toLowerCase());
const authorization = decode(grant, audit.contract, "ReporterUpdated");
assert.ok(
  authorization.eventName === "ReporterUpdated" && authorization.args.allowed,
);
assert.equal(
  authorization.args.reporter.toLowerCase(),
  audit.reporter.toLowerCase(),
);
function threat(receipt: Receipt, address: string) {
  const event = decode(receipt, address, "ThreatLogged");
  assert.equal(event.eventName, "ThreatLogged");
  return event.args;
}
const sourceContract = "0x1c755dE79A9bFd54Cf0c559C97FfeDC58BF1Fec6";
const source = threat(snapshot.fujiSourceReceipt, sourceContract);
const logged = threat(write, audit.contract);
assert.equal(snapshot.fujiSourceReceipt.transactionHash, audit.sourceHash);
assert.equal(logged.id, audit.evidenceId);
assert.equal(logged.level, 2);
assert.deepEqual(
  [logged.id, logged.riskHash, logged.level],
  [source.id, source.riskHash, source.level],
);
if (process.argv.includes("--online")) {
  const url =
    "https://data-api.avax.network/v1/networks/fuji/blockchains/" +
    snapshot.blockchainID;
  const registry = await fetch(url);
  assert.ok(registry.ok);
  const record = await registry.json();
  assert.equal(record.blockchainId, snapshot.blockchainID);
  assert.equal(record.subnetId, manifest.pChain.subnetID);
  const response = await fetch("https://api.avax-test.network/ext/bc/C/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [audit.sourceHash],
    }),
  });
  assert.ok(response.ok);
  const live: Receipt = (await response.json()).result;
  assert.equal(live.status, "0x1");
  assert.equal(live.transactionHash, audit.sourceHash);
  assert.deepEqual(threat(live, sourceContract), source);
  console.log("Avalanche public registry and Fuji source event verified.");
}
console.log(
  "3 receipt roots verified against the archived L1 headers; reporter grant and cross-chain evidence match.",
);
