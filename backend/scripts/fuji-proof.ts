import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isAddressEqual,
  keccak256,
  parseAbi,
  parseEther,
  parseSignature,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { analyze } from "../src/server.ts";
import { auditAbi, evidence } from "../src/audit.ts";
import {
  connect,
  fuji,
  rpc,
  scanSchema,
  vaultAbi,
  policyAbi,
} from "../src/fuji.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const local = resolve(root, ".fuji-proof"),
  journalFile = resolve(local, "run.json");
const docs = resolve(root, "docs"),
  web = resolve(root, "frontend/public");
const output = resolve(docs, "fuji-live-proof.json");
const ownerAbi = parseAbi([
  "function owner() view returns(address)",
  "function policy() view returns(address)",
  "function revokeAgent()",
  "function grantAgent(address)",
]);
const limits = parseAbi([
  "function dailyCap() view returns(uint256)",
  "function requireClearance() view returns(bool)",
]);
const tokenAbi = parseAbi([
  "function faucet()",
  "function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
]);
const audit = getAddress("0x1c755dE79A9bFd54Cf0c559C97FfeDC58BF1Fec6");
const chain = connect(rpc);
type Status = "success" | "reverted";
type Row = {
  step: string;
  title: string;
  expected: Status;
  observedError: string | null;
  status: Status;
  hash: Hex;
  block: string;
  gasUsed: string;
  latencyMs: number;
  explorer: string;
};
type Pending = {
  raw: Hex;
  hash: Hex;
  title: string;
  expected: Status;
  observedError: string | null;
  startedAt: number;
};
type Run = {
  vault: Address;
  agent: Address;
  before: {
    block: string;
    nonce: string;
    balance: string;
    partnerBalance: string;
  };
  rows: Row[];
  pending: Record<string, Pending>;
  notes: string[];
};
function save(path: string, value: string) {
  writeFileSync(path + ".tmp", value);
  renameSync(path + ".tmp", path);
}
function account(key: string, fallback?: PrivateKeyAccount) {
  const value = process.env[key];
  if (!value && fallback) return fallback;
  assert.ok(value && /^0x[0-9a-f]{64}$/i.test(value), "Missing " + key);
  return privateKeyToAccount(value as Hex);
}
function transfer(to: Address, amount: bigint) {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
}
const transferData = transfer(fuji.partner, 1_000_000n);
const one = 1_000_000n;
const bal = (who: Address, blockNumber?: bigint) =>
  chain.readContract({
    address: fuji.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
    blockNumber,
  });
const readVault = <
  N extends "agent" | "nonce" | "paused" | "signer" | "spentInWindow",
>(
  functionName: N,
  blockNumber?: bigint,
) =>
  chain.readContract({
    address: fuji.vault,
    abi: vaultAbi,
    functionName,
    blockNumber,
  });
const snapshot = async (blockNumber: bigint) => ({
  block: String(blockNumber),
  nonce: String(await readVault("nonce", blockNumber)),
  balance: String(await bal(fuji.vault, blockNumber)),
  partnerBalance: String(await bal(fuji.partner, blockNumber)),
});
function publish<T extends { rows: Row[] }>(report: T) {
  mkdirSync(web, { recursive: true });
  const json = JSON.stringify(report, null, 2) + "\n";
  save(output, json);
  save(resolve(web, "fuji-live-proof.json"), json);
  const table = [
    "| Bước | Trạng thái | Lỗi khi mô phỏng | Block | Gas | Xác nhận (ms) | Biên nhận |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
    ...report.rows.map(
      (r) =>
        "| " +
        [
          r.title,
          r.status,
          r.observedError ?? "—",
          r.block,
          r.gasUsed,
          r.latencyMs,
          "[" + r.hash.slice(0, 12) + "…](" + r.explorer + ")",
        ].join(" | ") +
        " |",
    ),
  ].join("\n");
  save(resolve(docs, "fuji-live-proof.md"), table + "\n");
}
async function main() {
  assert.equal(await chain.getChainId(), 43113, "Fuji chain ID required");
  assert.equal(
    new URL(rpc).origin,
    "https://api.avax-test.network",
    "Use canonical public Fuji RPC for published evidence",
  );
  assert.equal(
    fuji.vault,
    getAddress("0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F"),
  );
  if (existsSync(output)) {
    const prior = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(prior.chainId, 43113);
    assert.ok(prior.completed && prior.rows.length >= 8);
    for (const r of prior.rows) {
      const receipt = await chain.getTransactionReceipt({ hash: r.hash });
      assert.equal(receipt.status, r.expected);
      assert.equal(String(receipt.blockNumber), r.block);
    }
    publish(prior);
    console.log("Existing completed proof verified; no new transactions.");
    return;
  }
  const owner = account("OWNER_PRIVATE_KEY"),
    signer = account("AEGIS_SIGNER_PRIVATE_KEY"),
    agent = account("AGENT_SESSION_PRIVATE_KEY"),
    relayer = account("RELAYER_PRIVATE_KEY", signer),
    reporter = account("AUDIT_REPORTER_PRIVATE_KEY", signer);
  const existing: Run | undefined = existsSync(journalFile)
    ? JSON.parse(readFileSync(journalFile, "utf8"))
    : undefined;
  const head = await chain.getBlock();
  const at = head.number;
  const [
    admin,
    policy,
    current,
    signing,
    paused,
    allowed,
    cap,
    spent,
    requireClearance,
    reporterAllowed,
  ] = await Promise.all([
    chain.readContract({
      address: fuji.vault,
      abi: ownerAbi,
      functionName: "owner",
      blockNumber: at,
    }),
    chain.readContract({
      address: fuji.vault,
      abi: ownerAbi,
      functionName: "policy",
      blockNumber: at,
    }),
    readVault("agent", at),
    readVault("signer", at),
    readVault("paused", at),
    chain.readContract({
      address: fuji.policy,
      abi: policyAbi,
      functionName: "targetWhitelist",
      args: [fuji.partner],
      blockNumber: at,
    }),
    chain.readContract({
      address: fuji.policy,
      abi: limits,
      functionName: "dailyCap",
      blockNumber: at,
    }),
    readVault("spentInWindow", at),
    chain.readContract({
      address: fuji.policy,
      abi: limits,
      functionName: "requireClearance",
      blockNumber: at,
    }),
    chain.readContract({
      address: audit,
      abi: auditAbi,
      functionName: "reporters",
      args: [reporter.address],
      blockNumber: at,
    }),
  ]);
  assert.ok(
    isAddressEqual(admin, owner.address) &&
      isAddressEqual(admin, fuji.owner) &&
      isAddressEqual(signing, signer.address) &&
      isAddressEqual(policy, fuji.policy),
    "On-chain roles or policy mismatch",
  );
  assert.ok(
    isAddressEqual(current, agent.address) ||
      (existing &&
        isAddressEqual(current, zeroAddress) &&
        (existing.pending.revoke ||
          existing.rows.some((r) => r.step === "revoke"))),
    "Agent mismatch",
  );
  assert.ok(!paused && allowed && requireClearance, "Unexpected vault policy");
  if (!existing?.rows.some((r) => r.step === "execute"))
    assert.ok(spent + one <= cap, "Daily cap");
  for (const who of [owner, agent, relayer])
    assert.ok(
      (await chain.getBalance({ address: who.address, blockNumber: at })) >=
        parseEther("0.01"),
      "Gas below 0.01 AVAX: " + who.address,
    );
  const run: Run = existing ?? {
    vault: fuji.vault,
    agent: agent.address,
    before: await snapshot(at),
    rows: [],
    pending: {},
    notes: [],
  };
  assert.equal(run.agent, agent.address);
  assert.equal(run.vault, fuji.vault);
  const persist = () => save(journalFile, JSON.stringify(run, null, 2));
  const done = (id: string) => run.rows.find((r) => r.step === id);
  const scan = scanSchema.parse({
    from: fuji.vault,
    to: fuji.token,
    data: transferData,
    value: "0",
    userIntent: "Chuyển 1 mUSDC đến MockPartner",
  });
  type Call = { to: Address; data: Hex; observedError?: string };
  async function send(
    id: string,
    title: string,
    who: PrivateKeyAccount,
    expected: Status,
    build: () => Promise<Call>,
  ) {
    if (done(id)) {
      assert.equal(done(id)!.status, expected);
      return;
    }
    let p = run.pending[id];
    if (!p) {
      const call = await build();
      const wallet = createWalletClient({
        account: who,
        chain: avalancheFuji,
        transport: http(rpc),
      });
      const gas =
        expected === "reverted"
          ? 300000n
          : await chain.estimateGas({
              account: who.address,
              to: call.to,
              data: call.data,
            });
      const req = await wallet.prepareTransactionRequest({
        type: "eip1559",
        to: call.to,
        data: call.data,
        gas: expected === "reverted" ? gas : (gas * 12n) / 10n,
      });
      const raw = await who.signTransaction(req);
      p = {
        hash: keccak256(raw),
        raw,
        title,
        expected,
        observedError: call.observedError ?? null,
        startedAt: Date.now(),
      };
      run.pending[id] = p;
      persist();
    }
    const known = await chain
      .getTransaction({ hash: p.hash })
      .catch(() => null);
    if (!known)
      await chain.sendRawTransaction({ serializedTransaction: p.raw });
    const receipt = await chain.waitForTransactionReceipt({
      hash: p.hash,
      pollingInterval: 150,
      timeout: 90000,
    });
    const row: Row = {
      step: id,
      title: p.title,
      expected: p.expected,
      observedError: p.observedError,
      status: receipt.status,
      hash: p.hash,
      block: String(receipt.blockNumber),
      gasUsed: String(receipt.gasUsed),
      latencyMs: Date.now() - p.startedAt,
      explorer: "https://testnet.snowtrace.io/tx/" + p.hash,
    };
    run.rows.push(row);
    delete run.pending[id];
    persist();
    console.log(id, row.status, row.hash, row.latencyMs + "ms");
    assert.equal(row.status, expected);
  }
  async function reject(id: string, title: string, data: Hex, code: string) {
    await send(id, title, agent, "reverted", async () => {
      const deadline = (await chain.getBlock()).timestamp + 120n;
      const args = [fuji.token, data, 0n, deadline, "0x"] as const;
      let observedError: string | undefined;
      try {
        await chain.simulateContract({
          account: agent.address,
          address: fuji.vault,
          abi: vaultAbi,
          functionName: "execute",
          args,
        });
      } catch (e) {
        const revert =
          e instanceof BaseError
            ? e.walk((err) => err instanceof ContractFunctionRevertedError)
            : undefined;
        if (revert instanceof ContractFunctionRevertedError)
          observedError = revert.data?.errorName;
      }
      assert.equal(
        observedError,
        code,
        "Preflight must decode the expected error",
      );
      return {
        to: fuji.vault,
        data: encodeFunctionData({
          abi: vaultAbi,
          functionName: "execute",
          args,
        }),
        observedError,
      };
    });
  }
  if (!done("execute")) {
    const validated = await analyze(scan, true);
    assert.ok(
      validated.verifier === "model" &&
        validated.riskLevel === "SAFE" &&
        validated.clearance,
      "Real model clearance required",
    );
  }
  if (
    run.pending.faucet ||
    (!done("fee") && (await bal(agent.address)) < 5000n)
  )
    await send(
      "faucet",
      "Faucet mUSDC cho agent",
      agent,
      "success",
      async () => ({
        to: fuji.token,
        data: encodeFunctionData({ abi: tokenAbi, functionName: "faucet" }),
      }),
    );
  await send("fee", "Phí x402 · 0,005 mUSDC", relayer, "success", async () => {
    const now = (await chain.getBlock()).timestamp;
    const nonce = keccak256(
      stringToHex("aegis-fuji-proof-v2-" + run.before.block),
    );
    const payTo = getAddress(process.env.X402_PAY_TO || fuji.owner);
    assert.ok(isAddressEqual(payTo, fuji.owner));
    const message = {
      from: agent.address,
      to: payTo,
      value: 5000n,
      validAfter: now - 60n,
      validBefore: now + 600n,
      nonce,
    };
    const signature = await agent.signTypedData({
      domain: {
        name: "Aegis Mock USDC",
        version: "1",
        chainId: 43113,
        verifyingContract: fuji.token,
      },
      primaryType: "TransferWithAuthorization",
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
      message,
    });
    const { r, s, yParity } = parseSignature(signature);
    return {
      to: fuji.token,
      data: encodeFunctionData({
        abi: tokenAbi,
        functionName: "transferWithAuthorization",
        args: [
          message.from,
          message.to,
          message.value,
          message.validAfter,
          message.validBefore,
          nonce,
          27 + Number(yParity),
          r,
          s,
        ],
      }),
    };
  });
  await send(
    "execute",
    "Két chuyển 1 mUSDC đến MockPartner",
    agent,
    "success",
    async () => {
      const report = await analyze(scan, true);
      assert.ok(
        report.verifier === "model" &&
          report.riskLevel === "SAFE" &&
          report.intentMatch &&
          report.clearance,
        "Real model did not authorize transfer",
      );
      return {
        to: fuji.vault,
        data: encodeFunctionData({
          abi: vaultAbi,
          functionName: "execute",
          args: [
            fuji.token,
            transferData,
            0n,
            BigInt(report.clearance.deadline),
            report.clearance.signature,
          ],
        }),
      };
    },
  );
  await reject(
    "unsigned",
    "Thiếu clearance",
    transferData,
    "InvalidSecurityClearance",
  );
  await reject(
    "limit",
    "Chuyển vượt hạn mức",
    transfer(fuji.partner, 15n * one),
    "TxLimitExceeded",
  );
  await reject(
    "recipient",
    "Người nhận ngoài danh sách",
    transfer(fuji.flagged, one),
    "TargetNotWhitelisted",
  );
  await send(
    "revoke",
    "Chủ két thu hồi quyền agent",
    owner,
    "success",
    async () => ({
      to: fuji.vault,
      data: encodeFunctionData({ abi: ownerAbi, functionName: "revokeAgent" }),
    }),
  );
  try {
    await reject(
      "revoked",
      "Agent thử chi sau thu hồi",
      transferData,
      "AgentRevoked",
    );
  } finally {
    await send(
      "grant",
      "Chủ két cấp lại quyền agent",
      owner,
      "success",
      async () => ({
        to: fuji.vault,
        data: encodeFunctionData({
          abi: ownerAbi,
          functionName: "grantAgent",
          args: [agent.address],
        }),
      }),
    );
  }
  if (reporterAllowed)
    await send(
      "audit",
      "Ghi bằng chứng cảnh báo",
      reporter,
      "success",
      async () => {
        const blocked = { ...scan, data: transfer(fuji.flagged, one) };
        const report = await analyze(blocked, false);
        const item = evidence(blocked, report);
        assert.ok(item && item.level === 2);
        const now = (await chain.getBlock()).timestamp;
        return {
          to: audit,
          data: encodeFunctionData({
            abi: auditAbi,
            functionName: "logThreat",
            args: [item.id, item.hash, item.level, now],
          }),
        };
      },
    );
  else run.notes = ["Bỏ qua logThreat vì ví reporter chưa được cấp quyền."];
  const last = BigInt(run.rows.at(-1)!.block);
  const after = await snapshot(last);
  assert.equal(BigInt(run.before.balance) - BigInt(after.balance), one);
  assert.equal(
    BigInt(after.partnerBalance) - BigInt(run.before.partnerBalance),
    one,
  );
  assert.equal(BigInt(after.nonce) - BigInt(run.before.nonce), 3n);
  assert.ok(isAddressEqual(await readVault("agent", last), agent.address));
  const receipt = await chain.getTransactionReceipt({
    hash: done("execute")!.hash,
  });
  const transferEvent = receipt.logs
    .filter((l) => isAddressEqual(l.address, fuji.token))
    .map((log) => decodeEventLog({ abi: erc20Abi, ...log }))
    .find((l) => l.eventName === "Transfer");
  assert.ok(
    transferEvent?.eventName === "Transfer" &&
      isAddressEqual(transferEvent.args.from, fuji.vault) &&
      isAddressEqual(transferEvent.args.to, fuji.partner) &&
      transferEvent.args.value === one,
  );
  publish({
    chainId: 43113,
    completed: true,
    vault: run.vault,
    agent: run.agent,
    before: run.before,
    after,
    notes: run.notes,
    rows: run.rows,
  });
}
mkdirSync(local, { recursive: true });
const lock = resolve(local, "run.lock");
const fd = openSync(lock, "wx");
try {
  await main();
} catch (e) {
  console.error(
    (e instanceof Error ? e.message : "Fuji proof failed")
      .split("\n")
      .slice(0, 3)
      .join("\n")
      .replace(/0x[a-fA-F0-9]{64,}/g, "[hex]"),
  );
  process.exitCode = 1;
} finally {
  closeSync(fd);
  unlinkSync(lock);
}
