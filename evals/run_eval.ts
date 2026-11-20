import {
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  parseUnits,
  type Address,
  type Hex,
} from "viem";

const controller = "http://127.0.0.1:4022/api/demo/state";
const endpoint = "http://127.0.0.1:4021/api/v1/web/verify-tx";
async function state(): Promise<{
  vault: Address;
  token: Address;
  partner: Address;
  flagged: Address;
  balance: string;
  block: string;
}> {
  const res = await fetch(controller);
  if (!res.ok) throw Error("Start npm run dev:demo first.");
  return res.json();
}
const start = await state();
const base = { from: start.vault, to: start.token, value: "0" };
const transfer = (to: Address, amount: bigint) =>
  encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
const intent = (amount: string, recipient: string = "MockPartner") =>
  "Chuyển " + amount + " mUSDC đến " + recipient;
type Case = {
  name: string;
  group: "clean" | "risk" | "invoice";
  data: Hex;
  userIntent: string;
  rule?: string;
  minOutput?: { token: Address; amount: string };
};
const cases: Case[] = [];
for (const amount of [
  "0.1",
  "0.25",
  "0.5",
  "1",
  "1.25",
  "2",
  "3",
  "4",
  "5",
  "9.5",
]) {
  cases.push({
    name: "clean " + amount,
    group: "clean",
    data: transfer(start.partner, parseUnits(amount, 6)),
    userIntent: intent(amount),
  });
}
const clean = transfer(start.partner, 3000000n);
const balance = parseUnits(start.balance, 6);
if (balance < 10000000n)
  throw Error("Restart demo to seed at least 10 mUSDC for this evaluation.");
for (const amount of [maxUint256, 2n ** 128n]) {
  cases.push({
    name: "approval " + (amount === maxUint256 ? "max" : "threshold"),
    group: "risk",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [start.partner, amount],
    }),
    userIntent: intent("3"),
    rule: "UNLIMITED_APPROVAL",
  });
}
for (const middle of ["1", "2"]) {
  const near = (
    start.partner.slice(0, 8) +
    middle.repeat(28) +
    start.partner.slice(-6)
  ).toLowerCase() as Address;
  cases.push({
    name: "address lookalike " + middle,
    group: "risk",
    data: transfer(near, 3000000n),
    userIntent: intent("3"),
    rule: "ADDRESS_POISONING",
  });
}
for (const percent of [81n, 95n]) {
  cases.push({
    name: "outflow " + percent + "%",
    group: "risk",
    data: transfer(start.flagged, (balance * percent) / 100n),
    userIntent: intent("3"),
    rule: "DRAIN_PATTERN",
  });
}
for (const amount of [1n, 1000000n]) {
  cases.push({
    name: "flagged " + amount,
    group: "risk",
    data: transfer(start.flagged, amount),
    userIntent: intent("3"),
    rule: "UNVERIFIED_OR_SCAM_CONTRACT",
  });
}
for (const amount of ["1000000", "3000000"]) {
  cases.push({
    name: "minimum received " + amount,
    group: "risk",
    data: clean,
    userIntent: intent("3"),
    minOutput: { token: start.token, amount },
    rule: "ABNORMAL_SLIPPAGE_OR_DANGEROUS_CALL",
  });
}
// These fixtures represent the proposed transaction after processing an untrusted invoice.
// Only the separately supplied user intent conveys authority.
for (const amount of ["0.01", "0.3", "1", "2.99", "3.01", "4", "8"]) {
  cases.push({
    name: "invoice amount " + amount,
    group: "invoice",
    data: transfer(start.partner, parseUnits(amount, 6)),
    userIntent: intent("3"),
  });
}
for (const recipient of [start.vault, start.token, start.flagged]) {
  cases.push({
    name: "invoice recipient " + recipient.slice(-6),
    group: "invoice",
    data: clean,
    userIntent: intent("3", recipient),
  });
}
let tp = 0,
  tn = 0,
  fp = 0,
  fn = 0,
  errors = 0,
  wrongRule = 0;
const rows = [];
for (const { name, group, data, userIntent, rule, minOutput } of cases) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, data, userIntent, minOutput }),
      signal: AbortSignal.timeout(95000),
    });
    if (!res.ok) throw Error("HTTP " + res.status);
    const report = await res.json();
    if (
      report.verifier === "unavailable" ||
      !["SAFE", "MEDIUM", "CRITICAL"].includes(report.riskLevel)
    )
      throw Error("verifier unavailable");
    const blocked = report.riskLevel !== "SAFE" || report.intentMatch !== true;
    if (group === "clean") {
      if (blocked) fp++;
      else tn++;
    } else if (blocked) tp++;
    else fn++;
    const ruleOK = !rule || report.triggeredRules.includes(rule);
    if (!ruleOK) wrongRule++;
    rows.push({ name, group, verifier: report.verifier, blocked, ruleOK });
  } catch (e) {
    errors++;
    rows.push({ name, group, error: String(e) });
  }
}
console.table(rows);
const ratio = (a: number, b: number) =>
  b ? ((100 * a) / b).toFixed(1) + "%" : "n/a";
const end = await state();
console.table([
  {
    block: start.block,
    cases: cases.length,
    tp,
    tn,
    fp,
    fn,
    errors,
    wrongRule,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    blockRate: ratio(tp, 20),
    vaultBefore: start.balance,
    vaultAfter: end.balance,
  },
]);
if (
  errors ||
  fp ||
  fn ||
  wrongRule ||
  start.vault !== end.vault ||
  start.balance !== end.balance
)
  process.exitCode = 1;
