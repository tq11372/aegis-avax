"use client";
import { useState } from "react";
import {
  createWalletClient,
  custom,
  type Address,
  type EIP1193Provider,
} from "viem";
import { Wallet } from "lucide-react";
export function WalletSender({
  onSelect,
}: {
  onSelect: (address: Address) => void;
}) {
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  async function connect() {
    setPending(true);
    try {
      const host = window as Window & {
        avalanche?: EIP1193Provider;
        ethereum?: EIP1193Provider;
      };
      const provider = host.avalanche ?? host.ethereum;
      if (!provider) {
        setMessage(
          "Trình duyệt chưa có Core hoặc ví EVM. Bạn có thể dán địa chỉ ví gửi.",
        );
        return;
      }
      const [addr] = await createWalletClient({
        transport: custom(provider),
      }).requestAddresses();
      if (!addr) throw Error("No account");
      onSelect(addr);
      setMessage("Đã điền địa chỉ ví gửi để mô phỏng.");
    } catch {
      setMessage("Ví chưa chia sẻ địa chỉ. Bạn có thể dán địa chỉ ví gửi.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-3">
      <button type="button" disabled={pending} onClick={connect}>
        <Wallet size={15} />
        Dùng địa chỉ từ ví
      </button>
      {message && (
        <small className="mt-2" role="status">
          {message}
        </small>
      )}
    </div>
  );
}
