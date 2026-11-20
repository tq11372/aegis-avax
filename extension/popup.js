const domain = document.querySelector("#domain"),
  form = document.querySelector("form"),
  result = document.querySelector("#result");
async function inspectTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) throw Error();
  const reply = await chrome.runtime.sendMessage({
    action: "domain",
    url: tab.url,
  });
  domain.textContent = reply.value ?? "Chưa tải được danh sách tên miền.";
}
inspectTab().catch(() => {
  domain.textContent = "Chưa đọc được tên miền.";
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  result.removeAttribute("data-level");
  result.textContent = "Đang mô phỏng…";
  try {
    const input = JSON.parse(document.querySelector("#input").value);
    const reply = await chrome.runtime.sendMessage({ action: "verify", input });
    if (!reply?.value) throw Error(reply?.error ?? "Dịch vụ chưa sẵn sàng.");
    result.dataset.level = reply.value.level;
    result.textContent = reply.value.level + " · " + reply.value.detail;
  } catch (error) {
    result.textContent = "Chưa xác minh. " + error.message;
  } finally {
    button.disabled = false;
  }
});
