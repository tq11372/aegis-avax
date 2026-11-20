"use client";
import { WalletSender } from "./wallet";
import { useEffect, useState } from "react";
import {
  Activity,
  Box,
  Check,
  Copy,
  ExternalLink,
  Fingerprint,
  FlaskConical,
  LockKeyhole,
  Pause,
  ScanLine,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  Wallet,
  Play,
} from "lucide-react";
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  parseUnits,
  maxUint256,
  type Address,
} from "viem";

type State = {
  vault: Address;
  token: Address;
  partner: Address;
  flagged: Address;
  block: string;
  balance: string;
  txLimit: string;
  dailyCap: string;
  spent: string;
  active: boolean;
  partnerAllowed: boolean;
};
type Report = {
  riskLevel: string;
  intentMatch: boolean;
  verifier: string;
  explanationVi: string;
  triggeredRules: string[];
  simulation: {
    block: string;
    reverted: boolean;
    balances: {
      asset: string;
      account: string;
      before: string;
      after: string;
    }[];
    events?: {
      name: "Transfer" | "Approval" | "ApprovalForAll";
      asset: string;
      from: string;
      to: string;
      amount: string;
    }[];
  };
};
type Entry = { message: string; hash?: string; payment?: string };
const short = (s: string) => s.slice(0, 8) + "…" + s.slice(-6);
const labels = [
  "Chuyển hợp lệ",
  "Phê duyệt vô hạn",
  "Địa chỉ gần giống",
  "Chuyển 90% số dư",
];
async function api(path: string, options?: RequestInit) {
  const r = await fetch(path, { cache: "no-store", ...options });
  const body = await r
    .json()
    .catch(() => ({ error: "Dịch vụ demo chưa sẵn sàng." }));
  if (!r.ok) throw Error(body.error ?? "HTTP " + r.status);
  return body;
}
function payload(s: State, index: number) {
  const near = (
    s.partner.slice(0, 8) +
    "0".repeat(28) +
    s.partner.slice(-6)
  ).toLowerCase() as Address;
  if (index === 1)
    return encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [s.flagged, maxUint256],
    });
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [
      index === 2 ? near : index === 3 ? s.flagged : s.partner,
      index === 3
        ? (parseUnits(s.balance, 6) * 9n) / 10n
        : 3000000n,
    ],
  });
}
export default function Home() {
  const [tab, setTab] = useState<"firewall" | "agent">("firewall"),
    [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [index, select] = useState(0);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [data, setData] = useState(""),
    [value, setValue] = useState("0"),
    [intent, setIntent] = useState("Chuyển 3 mUSDC đến MockPartner");
  const [report, setReport] = useState<Report | null>(null),
    [logs, setLogs] = useState<Entry[]>([]),
    [limit, setLimit] = useState(""),
    [cap, setCap] = useState("");
  function preset(s: State, i: number) {
    select(i);
    setFrom(s.vault);
    setTo(s.token);
    setValue("0");
    setData(payload(s, i));
    setIntent("Chuyển 3 mUSDC đến MockPartner");
    setReport(null);
  }
  async function reload() {
    try {
      setError("");
      const s: State = await api("/api/demo/state");
      setState(s);
      preset(s, 0);
      setLimit(s.txLimit);
      setCap(s.dailyCap);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  async function scan() {
    setBusy("scan");
    setError("");
    setReport(null);
    try {
      const transaction = { from, to, data, value, userIntent: intent };
      window.postMessage({ type: "aegis:scan-request", transaction }, location.origin);
      setReport(
        await api("/api/v1/web/verify-tx", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(transaction),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function action(kind: string) {
    setBusy(kind);
    setError("");
    try {
      const r = await api("/api/demo/action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aegis-demo": "local",
        },
        body: JSON.stringify({
          action: kind,
          txLimit: limit,
          dailyCap: cap,
          partnerAllowed: !state?.partnerAllowed,
        }),
      });
      setState(r.state);
      setLogs((prev) => [r, ...prev].slice(0, 12));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const locked = !!busy || !state;
  return (
    <>
      <header>
        <div className="brand">
          <span className="brandmark">
            <ShieldCheck />
          </span>
          Aegis<span>AVAX</span>
        </div>
        <span className="network">
          <i className={state ? "online" : ""} />
          {state ? "Anvil · Fuji fork" : "Đang kết nối"}
        </span>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1>
              {tab === "firewall" ? "Transaction Firewall" : "AI Agent Sandbox"}
            </h1>
            <p>
              {tab === "firewall"
                ? "Kiểm tra giao dịch và biến động số dư trước khi ký."
                : "Theo dõi quyền chi tiêu và thử chính sách bảo vệ két."}
            </p>
          </div>
          <div className="chain">
            <Box size={17} /> Avalanche Fuji <b>43113</b>
          </div>
        </div>
        <nav aria-label="Chế độ">
          <button
            aria-pressed={tab === "firewall"}
            onClick={() => setTab("firewall")}
          >
            <ScanLine />
            Tx Firewall
          </button>
          <button
            aria-pressed={tab === "agent"}
            onClick={() => setTab("agent")}
          >
            <Fingerprint />
            AI Agent Sandbox
          </button>
        </nav>
        {error && (
          <aside role="alert">
            {error} {!state && <button onClick={reload}>Kết nối lại</button>}
          </aside>
        )}
        <div className="grid">
          <section className="panel">
            <div className="panelhead">
              <span className="tile">
                {tab === "firewall" ? <ScanLine /> : <SlidersHorizontal />}
              </span>
              <h2>
                {tab === "firewall" ? "Mô phỏng giao dịch" : "Điều khiển agent"}
              </h2>
            </div>
            {tab === "firewall" ? (
              <>
                <label>
                  Kịch bản mẫu
                  <select
                    disabled={locked}
                    value={index}
                    onChange={(e) => state && preset(state, +e.target.value)}
                  >
                    {labels.map((l, i) => (
                      <option key={l} value={i}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="fields">
                  <label>
                    Ví gửi
                    <input
                      spellCheck={false}
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    Hợp đồng đích
                    <input
                      spellCheck={false}
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                </div>
                <WalletSender
                  onSelect={(addr) => {
                    setFrom(addr);
                    setReport(null);
                  }}
                />
                <label>
                  Calldata
                  <textarea
                    rows={3}
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    spellCheck={false}
                  />
                </label>
                <div className="fields amount">
                  <label>
                    Giá trị (wei)
                    <input
                      value={value}
                      inputMode="numeric"
                      onChange={(e) => setValue(e.target.value)}
                    />
                  </label>
                  <label>
                    Ý định của bạn
                    <input
                      value={intent}
                      onChange={(e) => setIntent(e.target.value)}
                    />
                  </label>
                </div>
                <button className="primary" disabled={locked} onClick={scan}>
                  <Play size={16} />
                  {busy === "scan" ? "Đang mô phỏng…" : "Mô phỏng giao dịch"}
                </button>
              </>
            ) : (
              <>
                <div className="scenario">
                  <button
                    disabled={locked || !state?.active}
                    onClick={() => action("pay")}
                  >
                    <Wallet />
                    Chuyển 3 mUSDC đến MockPartner
                  </button>
                  <button disabled={locked} onClick={() => action("mismatch")}>
                    <ShieldAlert />
                    Kiểm tra hóa đơn sai người nhận
                  </button>
                  <button
                    disabled={locked || !state?.active}
                    onClick={() => action("check")}
                  >
                    <LockKeyhole />
                    Kiểm tra lệnh thiếu chữ ký
                  </button>
                </div>
                <h3>Chính sách chi tiêu</h3>
                <div className="fields">
                  <label>
                    mUSDC / giao dịch
                    <input
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                    />
                  </label>
                  <label>
                    mUSDC / 24 giờ
                    <input
                      value={cap}
                      onChange={(e) => setCap(e.target.value)}
                    />
                  </label>
                </div>
                <button disabled={locked} onClick={() => action("limits")}>
                  Lưu hạn mức
                </button>
                <div className="split">
                  <div>
                    <strong>MockPartner</strong>
                    <small>
                      {state?.partnerAllowed
                        ? "Được phép nhận"
                        : "Đã chặn nhận"}
                    </small>
                  </div>
                  <button disabled={locked} onClick={() => action("partner")}>
                    {state?.partnerAllowed
                      ? "Chặn người nhận"
                      : "Cho phép nhận"}
                  </button>
                </div>
                <button
                  className="danger"
                  disabled={locked}
                  onClick={() => action(state?.active ? "kill" : "grant")}
                >
                  <Pause size={16} />
                  {state?.active
                    ? "Kill switch · Thu hồi session key"
                    : "Cấp lại session key"}
                </button>
                {busy && <small role="status">Đang xử lý trên Anvil…</small>}
              </>
            )}
          </section>
          <div className="rail">
            <section className="vault">
              <div className="vault-head">
                <Wallet />
                <strong>GuardVault</strong>
                <span>
                  {state?.active
                    ? "Agent hoạt động"
                    : state
                      ? "Agent đã khóa"
                      : "Đang tải"}
                </span>
              </div>
              <small>Số dư két trên Anvil</small>
              <div className="balance">
                {state?.balance ?? "—"} <em>mUSDC</em>
              </div>
              <div className="vaultfoot">
                <code>{state ? short(state.vault) : "—"}</code>
                {state && (
                  <button
                    title="Sao chép địa chỉ két"
                    onClick={() => navigator.clipboard.writeText(state.vault)}
                  >
                    <Copy size={14} />
                  </button>
                )}
              </div>
            </section>
            <section className="panel meta">
              <h2>
                <Activity /> Trạng thái phiên
              </h2>
              <dl>
                <dt>Block nguồn</dt>
                <dd>{state?.block ?? "—"}</dd>
                <dt>Đã chi trong 24 giờ</dt>
                <dd>{state?.spent ?? "—"} mUSDC</dd>
                <dt>Trần mỗi giao dịch</dt>
                <dd>{state?.txLimit ?? "—"} mUSDC</dd>
                <dt>Phí xác minh agent</dt>
                <dd>0,005 mUSDC</dd>
              </dl>
              <p>
                <FlaskConical size={16} /> Giao dịch demo chạy trên Anvil.
              </p>
            </section>
          </div>
        </div>
        {tab === "firewall" && report && (
          <section className="panel result" aria-live="polite">
            <div className="split">
              <h2>Kết quả mô phỏng</h2>
              <b className={"risk " + report.riskLevel}>{report.riskLevel}</b>
            </div>
            <p>{report.explanationVi}</p>
            <small>
              Block {report.simulation.block} ·{" "}
              {report.simulation.reverted ? "Đã revert" : "Thực thi được"} ·{" "}
              {report.verifier}
            </small>
            {report.triggeredRules.length > 0 && (
              <p className="rules">{report.triggeredRules.join(" · ")}</p>
            )}
            <div className="tablebox">
              <table>
                <thead>
                  <tr>
                    <th>Tài sản</th>
                    <th>Ví</th>
                    <th>Trước</th>
                    <th>Sau</th>
                  </tr>
                </thead>
                <tbody>
                  {report.simulation.balances.map((b) => {
                    const known =
                        b.asset.toLowerCase() === state?.token.toLowerCase(),
                      dec = known ? 6 : b.asset === "AVAX" ? 18 : 0;
                    return (
                      <tr key={b.asset + b.account}>
                        <td>
                          {known
                            ? "mUSDC"
                            : b.asset === "AVAX"
                              ? "AVAX"
                              : short(b.asset) + " (đơn vị gốc)"}
                        </td>
                        <td title={b.account}>{short(b.account)}</td>
                        <td>{formatUnits(BigInt(b.before), dec)}</td>
                        <td>{formatUnits(BigInt(b.after), dec)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {report.simulation.events && report.simulation.events.length > 0 && (
              <>
                <h3>Sự kiện giải mã (Decoded Events)</h3>
                <div className="tablebox">
                  <table>
                    <thead>
                      <tr>
                        <th>Sự kiện</th>
                        <th>Tài sản</th>
                        <th>Từ / Chủ sở hữu</th>
                        <th>Đến / Spender</th>
                        <th>Giá trị / Quyền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.simulation.events.map((ev, idx) => {
                        const isMusdc =
                          ev.asset.toLowerCase() === state?.token.toLowerCase();
                        const isNative =
                          ev.asset.toLowerCase() ===
                          "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
                        const rawAmt = BigInt(ev.amount);
                        const unlimited =
                          (ev.name === "Approval" && rawAmt >= 2n ** 128n) ||
                          (ev.name === "ApprovalForAll" && rawAmt === 1n);
                        const formatted =
                          ev.name === "ApprovalForAll"
                            ? rawAmt === 1n
                              ? "Toàn quyền (true)"
                              : "Thu hồi (false)"
                            : unlimited
                              ? "Không giới hạn (MAX_UINT256)"
                              : isMusdc
                                ? formatUnits(rawAmt, 6) + " mUSDC"
                                : isNative
                                  ? formatUnits(rawAmt, 18) + " AVAX"
                                  : ev.amount;
                        return (
                          <tr key={ev.name + ev.asset + idx}>
                            <td>
                              <b
                                className={
                                  unlimited ? "risk CRITICAL" : "risk SAFE"
                                }
                              >
                                {ev.name}
                              </b>
                            </td>
                            <td>
                              {isMusdc
                                ? "mUSDC"
                                : isNative
                                  ? "AVAX"
                                  : short(ev.asset)}
                            </td>
                            <td title={ev.from}>{short(ev.from)}</td>
                            <td title={ev.to}>{short(ev.to)}</td>
                            <td>
                              {unlimited ? (
                                <strong className="risk CRITICAL">
                                  {formatted}
                                </strong>
                              ) : (
                                formatted
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
        {tab === "agent" && logs.length > 0 && (
          <section className="panel result">
            <h2>Lịch sử phiên</h2>
            {logs.map((l, i) => (
              <div className="entry" key={i}>
                <Check size={17} />
                <div>
                  {l.message}{" "}
                  {l.hash && (
                    <a target="_blank" href={"/api/demo/receipt/" + l.hash}>
                      Biên nhận Anvil <ExternalLink size={13} />
                    </a>
                  )}{" "}
                  {l.payment && (
                    <a target="_blank" href={"/api/demo/receipt/" + l.payment}>
                      Thanh toán x402 <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
        <footer>
          <span>AegisAVAX · Team1 Vietnam UniHack 2026</span>
          <a
            href="https://testnet.snowtrace.io/address/0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F"
            target="_blank"
          >
            GuardVault trên Fuji Explorer <ExternalLink size={14} />
          </a>
        </footer>
      </main>
    </>
  );
}
