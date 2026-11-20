import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000/api/demo";
const initial = await (await fetch(base + "/state")).json();
assert.equal(initial.active, true);
assert.equal(initial.partnerAllowed, true);
async function act(
  action: string,
  extra: Record<string, string | boolean> = {},
) {
  const res = await fetch(base + "/action", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aegis-demo": "local",
      origin: "http://127.0.0.1:3000",
    },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json();
  assert.equal(res.ok, true, JSON.stringify(body));
  return body;
}
assert.match((await act("check")).message, /clearance/);
await act("mismatch");
assert.equal((await act("kill")).state.active, false);
assert.equal((await act("grant")).state.active, true);
assert.equal(
  (await act("partner", { partnerAllowed: false })).state.partnerAllowed,
  false,
);
await act("partner", { partnerAllowed: true });
assert.equal(
  (await act("limits", { txLimit: "4", dailyCap: "12" })).state.txLimit,
  "4",
);
await act("limits", { txLimit: initial.txLimit, dailyCap: initial.dailyCap });
const paid = await act("pay");
assert.equal(Number(paid.state.balance), Number(initial.balance) - 3);
for (const hash of [paid.hash, paid.payment]) {
  const r = await fetch(base + "/receipt/" + hash);
  assert.equal((await r.json()).status, "success");
}
console.log(
  "Local frontend proxy verified policy, session key, intent mismatch, clearance and both Anvil receipts.",
);
