"use client";
import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  isAddressEqual,
  parseAbi,
  zeroAddress,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { avalancheFuji } from "viem/chains";
const vault = "0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F";
const agent = "0xa3128f3BcabcCE9c6BDc2186B586A39BDce9EdF1";
const abi = parseAbi([
  "function owner() view returns(address)",
  "function agent() view returns(address)",
  "function revokeAgent()",
  "function grantAgent(address)",
]);
export function OwnerKillSwitch() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [hash, setHash] = useState<Hex>();
  async function change(revoke: boolean) {
    setBusy(true);
    setHash(undefined);
    setMessage("Đang kết nối ví chủ két…");
    try {
      const host = window as Window & {
        avalanche?: EIP1193Provider;
        ethereum?: EIP1193Provider;
      };
      const provider = host.avalanche ?? host.ethereum;
      if (!provider) {
        setMessage("Hãy mở Core hoặc ví EVM có tài khoản owner.");
        return;
      }
      const transport = custom(provider, { retryCount: 0 });
      const wallet = createWalletClient({ chain: avalancheFuji, transport });
      const reader = createPublicClient({ chain: avalancheFuji, transport });
      const [account] = await wallet.requestAddresses();
      if ((await wallet.getChainId()) !== 43113)
        await wallet.switchChain({ id: 43113 });
      if ((await wallet.getChainId()) !== 43113)
        throw Error("Cần chọn Avalanche Fuji (43113).");
      const [owner, current] = await Promise.all([
        reader.readContract({ address: vault, abi, functionName: "owner" }),
        reader.readContract({ address: vault, abi, functionName: "agent" }),
      ]);
      if (!account || !isAddressEqual(account, owner)) {
        setMessage(
          "Ví đang chọn không phải owner. Chủ két Fuji là " + owner + ".",
        );
        return;
      }
      if (
        revoke
          ? !isAddressEqual(current, agent)
          : !isAddressEqual(current, zeroAddress)
      ) {
        setMessage(
          "Quyền hiện tại của agent đã thay đổi. Agent on-chain: " + current,
        );
        return;
      }
      const call = revoke
        ? ({ functionName: "revokeAgent", args: [] } as const)
        : ({ functionName: "grantAgent", args: [agent] } as const);
      const { request } = await reader.simulateContract({
        address: vault,
        abi,
        account,
        ...call,
      });
      setMessage("Xác nhận giao dịch Fuji trong ví.");
      const tx = await wallet.writeContract(request);
      setHash(tx);
      const start = performance.now();
      setMessage("Đã gửi · Đang chờ biên nhận Fuji…");
      const receipt = await reader.waitForTransactionReceipt({
        hash: tx,
        pollingInterval: 200,
        timeout: 90000,
      });
      const ms = Math.round(performance.now() - start);
      setMessage(
        receipt.status === "success"
          ? (revoke ? "Đã thu hồi quyền" : "Đã cấp lại quyền") +
              " · " +
              ms +
              " ms từ lúc ví trả hash."
          : "Giao dịch đã revert.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? ("shortMessage" in e ? String(e.shortMessage) : e.message).slice(
              0,
              230,
            )
          : "Chưa xác nhận được giao dịch.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel result" id="fuji-owner">
      <h2>Quyền agent trên Fuji</h2>
      <p>
        Hai thao tác này dùng ví chủ két và trả gas bằng AVAX testnet. Agent của
        dự án là <code>{agent}</code>.
      </p>
      <div className="scenario">
        <button className="danger" disabled={busy} onClick={() => change(true)}>
          Kill Switch on Fuji
        </button>
        <button disabled={busy} onClick={() => change(false)}>
          Cấp lại quyền trên Fuji
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {hash && (
        <a
          href={"https://testnet.snowtrace.io/tx/" + hash}
          target="_blank"
          rel="noreferrer"
        >
          Biên nhận Fuji · {hash}
        </a>
      )}
    </section>
  );
}
