(() => {
  if (
    !["http://localhost:3000", "http://127.0.0.1:3000"].includes(
      location.origin,
    )
  )
    return;
  let generation = 0,
    holder;
  function show(message, color) {
    if (!holder?.isConnected) {
      holder = document.createElement("div");
      holder.setAttribute("data-aegis-shield", "");
      const root = holder.attachShadow({ mode: "open" });
      const badge = document.createElement("output");
      badge.setAttribute("role", "status");
      badge.style.cssText =
        "position:fixed;right:16px;top:12px;max-width:min(400px,80vw);z-index:2147483646;font:600 14px/1.45 system-ui;padding:10px 14px;color:white;border-radius:8px;box-shadow:0 2px 8px #0003;pointer-events:none";
      root.append(badge);
      document.documentElement.append(holder);
    }
    const badge = holder.shadowRoot.querySelector("output");
    badge.textContent = message;
    badge.style.background = color;
  }
  window.addEventListener("message", async (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.type !== "aegis:scan-request"
    )
      return;
    const input = event.data.transaction;
    if (!input || typeof input.data !== "string" || input.data.length > 16386)
      return;
    const id = ++generation;
    show("Aegis · Đang mô phỏng…", "#334456");
    try {
      const { value, error } = await chrome.runtime.sendMessage({
        action: "verify",
        input,
      });
      if (id !== generation) return;
      if (error) throw Error(error);
      show(
        "Aegis · " + value.level + " · " + value.detail,
        value.level === "SAFE" && value.match
          ? "#126149"
          : value.level === "CRITICAL"
            ? "#9b2838"
            : "#785213",
      );
    } catch {
      if (id === generation)
        show("Aegis · Chưa xác minh được giao dịch.", "#785213");
    }
  });
})();
