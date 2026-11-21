import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  isAddressEqual,
  maxUint256,
  parseAbi,
  parseEventLogs,
  parseUnits,
  zeroAddress,
} from "viem";
import { avalancheFuji } from "viem/chains";
import proof from "../../docs/fuji-mcp-proof.json";

const client = createPublicClient({
  chain: avalancheFuji,
  transport: http("https://api.avax-test.network/ext/bc/C/rpc", {
    timeout: 10000,
    retryCount: 1,
  }),
  batch: { multicall: true },
});
const vaultAbi = parseAbi([
  "function policy() view returns(address)",
  "function paused() view returns(bool)",
  "function agent() view returns(address)",
  "function spentInWindow() view returns(uint256)",
]);
const policyAbi = parseAbi([
  "function txLimit() view returns(uint256)",
  "function dailyCap() view returns(uint256)",
  "function requireClearance() view returns(bool)",
  "function check(address token,address recipient,uint256 amount,uint256 spent) view",
  "error TxLimitExceeded()",
  "error DailyCapExceeded()",
  "error TokenNotWhitelisted()",
  "error TargetNotWhitelisted()",
  "error InvalidPolicy()",
]);
const why = {
  TxLimitExceeded: "Số tiền vượt trần mỗi lệnh.",
  DailyCapExceeded: "Lệnh vượt phần hạn mức 24 giờ còn lại.",
  TokenNotWhitelisted: "Token chưa được phép.",
  TargetNotWhitelisted: "Người nhận chưa được chủ két cho phép.",
};
const $ = (id) => document.getElementById(id);
const format = (n) => formatUnits(n, 6).replace(".", ",");
for (const [id, hash] of [
  ["fee-link", proof.feeHash],
  ["spend-link", proof.executeHash],
])
  $(id).href = "https://testnet.snowtrace.io/tx/" + hash;
async function snapshot() {
  const chainId = await client.getChainId();
  if (chainId !== 43113) throw Error("RPC trả sai mạng.");
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const read = (address, abi, functionName, args) =>
    client.readContract({ address, abi, functionName, args, blockNumber });
  const [policy, balance, spent, agent, paused] = await Promise.all([
    read(proof.vault, vaultAbi, "policy"),
    read(proof.token, erc20Abi, "balanceOf", [proof.vault]),
    read(proof.vault, vaultAbi, "spentInWindow"),
    read(proof.vault, vaultAbi, "agent"),
    read(proof.vault, vaultAbi, "paused"),
  ]);
  const [limit, cap, clearance] = await Promise.all(
    ["txLimit", "dailyCap", "requireClearance"].map((n) =>
      read(policy, policyAbi, n),
    ),
  );
  return {
    blockNumber,
    policy,
    balance,
    spent,
    agent,
    paused,
    limit,
    cap,
    clearance,
  };
}
function paint(s) {
  $("sync").textContent = "Đã đọc Fuji";
  $("balance").textContent = format(s.balance);
  $("block").textContent = String(s.blockNumber);
  $("limit").textContent = format(s.limit) + " mUSDC";
  $("daily").textContent = format(s.spent) + " / " + format(s.cap) + " mUSDC";
  $("active").textContent = s.paused
    ? "Két tạm dừng"
    : s.agent === zeroAddress
      ? "Đã thu hồi"
      : "Hoạt động";
  $("clearance").textContent = s.clearance ? "Bắt buộc" : "Tùy chọn";
}
function unavailable() {
  $("sync").textContent = "Lỗi RPC · thử làm mới";
  for (const id of [
    "balance",
    "block",
    "limit",
    "daily",
    "active",
    "clearance",
  ])
    $(id).textContent = "—";
}
function result(kind, title, details) {
  const el = $("result"),
    heading = document.createElement("strong"),
    body = document.createElement("p");
  heading.textContent = title;
  body.textContent = details;
  el.replaceChildren(heading, body);
  el.dataset.kind = kind;
  el.hidden = false;
}
function controls(locked) {
  for (const id of [
    "check",
    "refresh",
    "recipient",
    "amount",
    "approved",
    "custom",
  ])
    $(id).disabled = locked;
}
function amountValue(id) {
  const s = $(id).value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(s))
    throw Error("Nhập số tiền dương, tối đa 6 chữ số sau dấu phẩy.");
  const value = parseUnits(s, 6);
  if (value <= 0n || value > maxUint256)
    throw Error("Số tiền ngoài phạm vi mUSDC.");
  return value;
}
async function refresh() {
  controls(true);
  $("result").hidden = true;
  try {
    paint(await snapshot());
  } catch {
    unavailable();
  } finally {
    controls(false);
  }
}
$("refresh").addEventListener("click", refresh);
$("recipient").addEventListener("change", () => {
  $("custom-row").hidden = $("recipient").value !== "custom";
  $("custom").required = !$("custom-row").hidden;
});
$("form").addEventListener("input", () => {
  $("result").hidden = true;
});
$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let amount, approved, recipient;
  try {
    amount = amountValue("amount");
    approved = amountValue("approved");
    recipient = getAddress(
      $("recipient").value === "custom"
        ? $("custom").value.trim()
        : $("recipient").value === "partner"
          ? proof.partner
          : "0xaD1873680DcE93CF40C1F2c72f7002b5E50134c9",
    );
  } catch (e) {
    result(
      "stop",
      "Kiểm tra lại dữ liệu",
      String(e.message).startsWith("Address")
        ? "Địa chỉ EVM chưa hợp lệ."
        : e.message,
    );
    return;
  }
  controls(true);
  result("wait", "Đang mô phỏng…", "Đang đọc hợp đồng trên Fuji.");
  let current;
  try {
    current = await snapshot();
    paint(current);
    const { blockNumber } = current;
    const block = "Block " + blockNumber + ". ";
    if (current.paused || current.agent === zeroAddress) {
      result("stop", "Két đang khóa", block + "Agent hiện không thể chi.");
      return;
    }
    await client.readContract({
      address: current.policy,
      abi: policyAbi,
      functionName: "check",
      args: [proof.token, recipient, amount, current.spent],
      blockNumber,
    });
    if (approved !== amount) {
      result(
        "stop",
        "Lệch số tiền trong lệnh gốc",
        block +
          "Policy cho phép số tiền này, nhưng đề xuất " +
          format(amount) +
          " mUSDC khác mức " +
          format(approved) +
          " mUSDC bạn đã nhập.",
      );
      return;
    }
    const simulation = await client.simulateContract({
      account: proof.vault,
      address: proof.token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, amount],
      blockNumber,
    });
    if (simulation.result !== true) {
      result(
        "stop",
        "Token chưa xác nhận chuyển",
        block + "Hàm transfer không trả true.",
      );
      return;
    }
    result(
      "pass",
      "Qua kiểm tra policy và token",
      block +
        "Hai số tiền khớp. PolicyModule.check cho phép người nhận và hạn mức. Lệnh ERC-20 transfer chạy thử thành công. " +
        (current.clearance
          ? "Để chi thật, agent vẫn cần chữ ký clearance."
          : "Đây là kết quả mô phỏng."),
    );
  } catch (e) {
    if (!current) unavailable();
    const err =
      e instanceof BaseError
        ? e.walk((x) => x instanceof ContractFunctionRevertedError)
        : null;
    if (current && err instanceof ContractFunctionRevertedError) {
      const name = err.data?.errorName;
      result(
        "stop",
        "Hợp đồng từ chối",
        "Block " +
          current.blockNumber +
          ". " +
          (why[name] ?? "Lệnh mô phỏng bị revert.") +
          (name ? " (" + name + ")" : ""),
      );
    } else
      result(
        "wait",
        "Chưa lấy được kết quả",
        "RPC Fuji chưa trả đủ dữ liệu. Hãy thử lại.",
      );
  } finally {
    controls(false);
  }
});
$("verify").addEventListener("click", async () => {
  $("verify").disabled = true;
  $("receipt-status").textContent = "Đang đọc hai biên nhận…";
  try {
    if ((await client.getChainId()) !== 43113) throw Error();
    const receipts = await Promise.all(
      [proof.feeHash, proof.executeHash].map((hash) =>
        client.getTransactionReceipt({ hash }),
      ),
    );
    const expected = [
      [
        proof.agent,
        proof.payTo,
        BigInt(proof.feeAtomic),
        proof.relayer,
        proof.token,
      ],
      [
        proof.vault,
        proof.partner,
        BigInt(proof.amountAtomic),
        proof.agent,
        proof.vault,
      ],
    ];
    for (const [i, r] of receipts.entries()) {
      const [from, to, value, sender, contract] = expected[i];
      const logs = parseEventLogs({
        abi: erc20Abi,
        eventName: "Transfer",
        logs: r.logs.filter((l) => isAddressEqual(l.address, proof.token)),
      });
      if (
        r.status !== "success" ||
        !r.to ||
        !isAddressEqual(r.to, contract) ||
        !isAddressEqual(r.from, sender) ||
        logs.length !== 1
      )
        throw Error();
      const ev = logs[0].args;
      if (
        !isAddressEqual(ev.from, from) ||
        !isAddressEqual(ev.to, to) ||
        ev.value !== value
      )
        throw Error();
    }
    $("receipt-status").textContent =
      "Đã đối chiếu sự kiện Transfer. Phí 0,005 mUSDC ở block " +
      receipts[0].blockNumber +
      " và khoản chi 1 mUSDC ở block " +
      receipts[1].blockNumber +
      ".";
  } catch {
    $("receipt-status").textContent =
      "Chưa xác minh được cả hai biên nhận. Hãy thử lại hoặc mở liên kết explorer.";
  } finally {
    $("verify").disabled = false;
  }
});
void refresh();
