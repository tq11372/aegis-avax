"use client";
import { useEffect, useState } from "react";
type Receipt = {
  step: string;
  title: string;
  status: "reverted" | "success";
  observedError: string | null;
  latencyMs: number;
  hash: string;
};
type Proof = {
  chainId: number;
  completed: boolean;
  before: { balance: string; nonce: string };
  after: { balance: string; nonce: string };
  rows: Receipt[];
};
import { formatUnits } from "viem";
export function LiveProof() {
  const [proof, setProof] = useState<Proof>(),
    [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const res = await fetch("/fuji-live-proof.json", {
        signal: controller.signal,
      });
      if (!res.ok) throw Error();
      const value: Proof = await res.json();
      if (
        value.chainId !== 43113 ||
        !value.completed ||
        !Array.isArray(value.rows)
      )
        throw Error();
      setProof(value);
    }
    load().catch(() => {
      if (!controller.signal.aborted) setUnavailable(true);
    });
    return () => controller.abort();
  }, []);
  return (
    <section
      id="fuji-proof"
      className="panel result"
      aria-labelledby="proof-title"
    >
      <h2 id="proof-title">Bằng chứng on-chain trên Avalanche Fuji</h2>
      {proof ? (
        <>
          <p>
            Két {formatUnits(BigInt(proof.before.balance), 6)} →{" "}
            {formatUnits(BigInt(proof.after.balance), 6)} mUSDC · Nonce{" "}
            {proof.before.nonce} → {proof.after.nonce}
          </p>
          <div className="tablebox">
            <table>
              <thead>
                <tr>
                  <th>Giao dịch</th>
                  <th>Kết quả</th>
                  <th>Xác nhận</th>
                  <th>Snowtrace</th>
                </tr>
              </thead>
              <tbody>
                {proof.rows.map((r) => (
                  <tr key={r.step}>
                    <td>{r.title}</td>
                    <td>
                      {r.status === "success"
                        ? "✅ Thành công"
                        : "⛔ " + (r.observedError ?? "Revert")}
                    </td>
                    <td>{r.latencyMs.toLocaleString("vi-VN")} ms</td>
                    <td>
                      <a
                        href={"https://testnet.snowtrace.io/tx/" + r.hash}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.hash.slice(0, 10)}…{r.hash.slice(-6)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p role="status">
          {unavailable
            ? "Chưa tải được tệp biên nhận Fuji."
            : "Đang đọc biên nhận Fuji…"}
        </p>
      )}
    </section>
  );
}
