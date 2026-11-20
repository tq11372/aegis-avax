import {
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import {
  assetAbi,
  connect,
  fuji,
  isSame,
  type Balance,
  type Movement,
  type Scan,
  type Simulation,
} from "./fuji.ts";

const multicall = "0xcA11bde05977b3631167028862bE2a173976CA11";
const ethBalance = parseAbi([
  "function getEthBalance(address addr) view returns (uint256)",
]);
export function decode(scan: Scan) {
  try {
    return decodeFunctionData({ abi: assetAbi, data: scan.data });
  } catch {
    return undefined;
  }
}

export async function simulate(
  client: ReturnType<typeof connect>,
  block: bigint,
  scan: Scan,
): Promise<Simulation> {
  const call = {
    account: scan.from,
    to: scan.to,
    data: scan.data,
    value: BigInt(scan.value),
    gas: 3_000_000n,
  };
  const run = (
    calls: {
      to: Address;
      data: Hex;
      account?: Address;
      value?: bigint;
      gas?: bigint;
    }[],
  ) =>
    client.simulateBlocks({
      blockNumber: block,
      blocks: [{ calls }],
      validation: false,
      traceTransfers: true,
    });
  const tip = await client.getBlock({ blockNumber: block });
  const [discovery] = await run([call]);
  const first = discovery.calls[0];
  const events: Movement[] = [];
  const accounts = new Set<Address>([scan.from, scan.to]);
  const pairs = new Map<
    string,
    { asset: Address | "AVAX"; account: Address }
  >();
  const pair = (asset: Address | "AVAX", account: Address) =>
    pairs.set(asset + account, { asset, account });
  pair(fuji.token, scan.from);
  if (scan.minOutput) pair(scan.minOutput.token, scan.from);
  for (const log of first.logs ?? []) {
    let e;
    try {
      e = decodeEventLog({ abi: assetAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    let from: Address, to: Address, amount: bigint;
    if (e.eventName === "Transfer") {
      from = e.args.from;
      to = e.args.to;
      amount = e.args.value;
    } else if (e.eventName === "Approval") {
      from = e.args.owner;
      to = e.args.spender;
      amount = e.args.value;
    } else if (e.eventName === "ApprovalForAll") {
      from = e.args.owner;
      to = e.args.operator;
      amount = e.args.approved ? 1n : 0n;
    } else continue;
    const asset = getAddress(log.address);
    accounts.add(getAddress(from));
    accounts.add(getAddress(to));
    const native = isSame(asset, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    if (e.eventName === "Transfer" && !native) {
      pair(asset, getAddress(from));
      pair(asset, getAddress(to));
    }
    events.push({ name: e.eventName, asset, from, to, amount: String(amount) });
  }
  const decoded = decode(scan);
  if (decoded?.functionName === "transfer") {
    const recipient = decoded.args[0];
    accounts.add(recipient);
    pair(scan.to, scan.from);
    pair(scan.to, recipient);
  }
  for (const account of accounts) pair("AVAX", account);
  if (pairs.size > 64) throw Error("Too many affected balances for this scan");
  const watched = [...pairs.values()];
  const reads = watched.map<{ to: Address; data: Hex }>(({ asset, account }) =>
    asset === "AVAX"
      ? {
          to: multicall,
          data: encodeFunctionData({
            abi: ethBalance,
            functionName: "getEthBalance",
            args: [account],
          }),
        }
      : {
          to: asset,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          }),
        },
  );
  // Both sides are measured on the same immutable fork. All calls in a batch share state.
  const [measured] = await run([...reads, call, ...reads]);
  const executed = measured.calls[reads.length];
  if (executed.status !== first.status || executed.data !== first.data)
    throw Error("Inconsistent simulation");
  const read = (index: number) => {
    const r = measured.calls[index];
    if (r.status !== "success" || !r.data || r.data.length !== 66)
      throw Error("Balance could not be measured");
    return BigInt(r.data).toString();
  };
  const balances: Balance[] = watched.map((p, i) => ({
    ...p,
    before: read(i),
    after: read(reads.length + 1 + i),
  }));
  return {
    block: String(block),
    blockHash: tip.hash,
    reverted: executed.status !== "success",
    result: executed.data ?? "0x",
    balances,
    events,
  };
}
