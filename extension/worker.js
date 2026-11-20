const api = "http://127.0.0.1:4021/api/v1/web/verify-tx";
const feed =
  "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json";
const demoOrigins = new Set(["http://127.0.0.1:3000", "http://localhost:3000"]);
let domainList;
async function domains() {
  const cache = await caches.open("aegis-domain-list-v1");
  const previous = await cache.match(feed);
  const age = Date.now() - Number(previous?.headers.get("x-fetched-at") || 0);
  if (previous && age < 86400000)
    return { text: await previous.text(), stale: false };
  try {
    const r = await fetch(feed, {
      credentials: "omit",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw Error("Feed unavailable");
    const text = await r.text();
    const config = JSON.parse(text);
    if (
      !Array.isArray(config.blacklist) ||
      !config.blacklist.length ||
      !Array.isArray(config.whitelist)
    )
      throw Error("Invalid feed");
    await cache.put(
      feed,
      new Response(text, { headers: { "x-fetched-at": String(Date.now()) } }),
    );
    return { text, stale: false };
  } catch {
    if (previous) return { text: await previous.text(), stale: true };
    // Initial offline snapshot from MetaMask/eth-phishing-detect, commit
    // 1567ec1f1d32f5a8880cdd5622584958f479772d. See data/LICENSE.metamask.
    const bundled = await fetch(chrome.runtime.getURL("data/metamask.json.gz"));
    if (!bundled.ok || !bundled.body) throw Error("Missing bundled blocklist");
    const text = await new Response(
      bundled.body.pipeThrough(new DecompressionStream("gzip")),
    ).text();
    return { text, stale: true };
  }
}
async function domainStatus(url) {
  const site = new URL(url);
  if (!["http:", "https:"].includes(site.protocol))
    return "Trang nội bộ của trình duyệt.";
  if (demoOrigins.has(site.origin)) return "Trang demo AegisAVAX trên máy.";
  if (!domainList || domainList.expires < Date.now()) {
    const list = await domains();
    const config = JSON.parse(list.text);
    domainList = {
      names: new Set(config.blacklist),
      allowed: new Set(config.whitelist),
      stale: list.stale,
      expires: Date.now() + (list.stale ? 60000 : 3600000),
    };
  }
  const parts = site.hostname.toLowerCase().replace(/\.$/, "").split(".");
  const suffixes = parts.map((_, index) => parts.slice(index).join("."));
  const blocked =
    !suffixes.some((name) => domainList.allowed.has(name)) &&
    suffixes.some((name) => domainList.names.has(name));
  return (
    (blocked
      ? "CẢNH BÁO · Tên miền nằm trong danh sách của MetaMask."
      : "Chưa thấy tên miền trong danh sách của MetaMask.") +
    (domainList.stale ? " Đang dùng danh sách lưu trên máy." : "")
  );
}
async function verify(input) {
  const r = await fetch(api, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "omit",
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw Error("Backend trả HTTP " + r.status);
  const result = await r.json();
  if (
    !["CRITICAL", "SAFE", "MEDIUM"].includes(result.riskLevel) ||
    typeof result.intentMatch !== "boolean"
  )
    throw Error("Phản hồi chưa hợp lệ.");
  return {
    level: result.riskLevel,
    match: result.intentMatch,
    detail: result.explanationVi,
  };
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const popup = sender.url === chrome.runtime.getURL("popup.html");
  const demo =
    sender.frameId === 0 && sender.tab && demoOrigins.has(sender.origin);
  if (sender.id !== chrome.runtime.id || (!popup && !demo)) return;
  let work;
  if (msg?.action === "domain" && popup) work = domainStatus(msg.url);
  else if (
    msg?.action === "verify" &&
    msg.input &&
    JSON.stringify(msg.input).length <= 32768
  )
    work = verify(msg.input);
  else return;
  work.then(
    (value) => reply({ value }),
    (error) => reply({ error: error.message }),
  );
  return true;
});
