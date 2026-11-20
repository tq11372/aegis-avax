import { formatUnits, type Address } from "viem";
import {
  connect,
  fuji,
  isSame,
  policyAbi,
  registryAbi,
  type Scan,
  type Simulation,
} from "./fuji.ts";
import { decode } from "./simulation.ts";

export type Reason =
  | "UNLIMITED_APPROVAL"
  | "DRAIN_PATTERN"
  | "ADDRESS_POISONING"
  | "UNVERIFIED_OR_SCAM_CONTRACT"
  | "ABNORMAL_SLIPPAGE_OR_DANGEROUS_CALL";
export type Reputation = {
  address: Address;
  allowed: boolean;
  flagged: boolean;
  verified: boolean | null;
};
const verifiedCache = new Map<string, number>();
async function verified(address: Address) {
  if ((verifiedCache.get(address) ?? 0) > Date.now()) return true;
  const urls = [
    "https://build.avax.network/api/verify/43113/api",
    "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api",
  ];
  let answered = false;
  for (const url of urls) {
    try {
      const response = await fetch(
        url + "?module=contract&action=getsourcecode&address=" + address,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) continue;
      const body = await response.json();
      if (!Array.isArray(body.result) || !body.result[0]) continue;
      answered = true;
      if (body.result[0].SourceCode) {
        verifiedCache.set(address, Date.now() + 300000);
        return true;
      }
    } catch {
      /* Try the second Fuji explorer. */
    }
  }
  if (!answered) throw Error("Explorer verification unavailable");
  return false;
}

export async function reputation(
  client: ReturnType<typeof connect>,
  block: bigint,
  scan: Scan,
  sim: Simulation,
) {
  const decoded = decode(scan);
  const involved = new Set<Address>([scan.to]);
  if (
    decoded &&
    ["transfer", "approve", "setApprovalForAll"].includes(decoded.functionName)
  )
    involved.add(decoded.args[0] as Address);
  for (const e of sim.events) {
    involved.add(e.to);
    if (
      e.name === "Transfer" &&
      !isSame(e.asset, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")
    )
      involved.add(e.asset);
  }
  return Promise.all(
    [...involved].map(async (address) => {
      const [allowed, flagged, code] = await Promise.all([
        client.readContract({
          address: fuji.policy,
          abi: policyAbi,
          functionName: "targetWhitelist",
          args: [address],
          blockNumber: block,
        }),
        client.readContract({
          address: fuji.registry,
          abi: registryAbi,
          functionName: "isFlagged",
          args: [address],
          blockNumber: block,
        }),
        client.getCode({ address, blockNumber: block }),
      ]);
      return {
        address,
        allowed,
        flagged,
        verified: code && code !== "0x" ? await verified(address) : null,
      };
    }),
  );
}

export function review(scan: Scan, sim: Simulation, targets: Reputation[]) {
  const reasons = new Map<Reason, string>();
  const decoded = decode(scan);
  const add = (code: Reason, msg: string) => reasons.set(code, msg);
  if (targets.some((t) => t.flagged || t.verified === false))
    add(
      "UNVERIFIED_OR_SCAM_CONTRACT",
      "Có địa chỉ bị gắn cờ hoặc hợp đồng chưa xác minh.",
    );
  const approvals = sim.events.filter((e) => e.name !== "Transfer");
  if (
    approvals.some((e) =>
      e.name === "ApprovalForAll"
        ? e.amount === "1"
        : BigInt(e.amount) >= 2n ** 128n,
    ) ||
    (decoded?.functionName === "approve" && decoded.args[1] >= 2n ** 128n) ||
    (decoded?.functionName === "setApprovalForAll" && decoded.args[1])
  )
    add("UNLIMITED_APPROVAL", "Quyền chi tiêu hoặc quản lý tài sản quá rộng.");

  for (const balance of sim.balances.filter((b) =>
    isSame(b.account, scan.from),
  )) {
    const lost = BigInt(balance.before) - BigInt(balance.after);
    if (lost * 100n <= BigInt(balance.before) * 80n) continue;
    const destinations = sim.events
      .filter(
        (e) =>
          e.name === "Transfer" &&
          isSame(e.from, scan.from) &&
          (balance.asset === "AVAX"
            ? isSame(e.asset, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")
            : isSame(e.asset, balance.asset)),
      )
      .map((e) => e.to);
    if (
      !destinations.length ||
      destinations.some(
        (addr) => !targets.some((t) => t.allowed && isSame(t.address, addr)),
      )
    )
      add(
        "DRAIN_PATTERN",
        "Hơn 80% số dư của một tài sản sẽ rời ví tới đích chưa được duyệt.",
      );
  }
  for (const t of targets) {
    const dst = t.address.toLowerCase();
    if (
      [fuji.partner, ...scan.knownRecipients].some((a) => {
        const old = a.toLowerCase();
        return (
          old !== dst &&
          old.slice(2, 6) === dst.slice(2, 6) &&
          old.slice(-4) === dst.slice(-4)
        );
      })
    ) {
      add(
        "ADDRESS_POISONING",
        "Địa chỉ có phần đầu và cuối giống người nhận quen nhưng khác phần giữa.",
      );
    }
  }
  if (scan.minOutput) {
    const { token, amount } = scan.minOutput;
    const output = sim.balances.find(
      (b) => isSame(b.account, scan.from) && isSame(b.asset, token),
    );
    if (
      !output ||
      BigInt(output.after) - BigInt(output.before) < BigInt(amount)
    )
      add(
        "ABNORMAL_SLIPPAGE_OR_DANGEROUS_CALL",
        "Số token nhận được thấp hơn mức tối thiểu yêu cầu.",
      );
  }
  if (
    sim.reverted ||
    (scan.data !== "0x" && decoded?.functionName !== "transfer")
  )
    add(
      "ABNORMAL_SLIPPAGE_OR_DANGEROUS_CALL",
      sim.reverted
        ? "Lệnh mô phỏng đã revert."
        : "Calldata yêu cầu thao tác ngoài chuyển token.",
    );
  return {
    triggeredRules: [...reasons.keys()],
    explanationVi: [...reasons.values()].join(" "),
    decodedFunction:
      decoded?.functionName ??
      (scan.data === "0x" ? "nativeTransfer" : "unknown"),
  };
}

export function confirmedTransfer(scan: Scan, sim: Simulation) {
  const d = decode(scan);
  if (
    d?.functionName !== "transfer" ||
    !isSame(scan.to, fuji.token) ||
    !isSame(scan.from, fuji.vault) ||
    scan.value !== "0" ||
    sim.reverted ||
    scan.data.length !== 138
  )
    return;
  const [recipient, amount] = d.args;
  const delta = (who: Address) => {
    const b = sim.balances.find(
      (b) => isSame(b.asset, fuji.token) && isSame(b.account, who),
    );
    return b ? BigInt(b.after) - BigInt(b.before) : 0n;
  };
  if (
    amount <= 0n ||
    delta(fuji.vault) !== -amount ||
    delta(recipient) !== amount ||
    sim.events.length !== 1
  )
    return;
  return {
    recipient,
    amount: amount.toString(),
    display: formatUnits(amount, 6),
  };
}
