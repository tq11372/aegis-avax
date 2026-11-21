# Dàn ý Slide Pitch, Kịch bản Video Demo & Q&A — AegisAVAX

Tài liệu chuẩn bị cho **Vòng loại trực tuyến (50đ kỹ thuật)** và **Vòng Chung kết Offline (50đ: 2 phút setup + 5 phút pitch tiếng Việt + 5 phút Q&A)** tại Team1 Vietnam UniHack 2026.

---

## 1. Dàn ý Slide Pitch (11 slide — tiếng Việt)

> Thiết kế trên Canva hoặc Google Slides, bật **Anyone with the link can view** trước khi nộp.

### Slide 1 — Trang bìa
- **Tiêu đề:** `AegisAVAX` — Tường lửa giao dịch trước khi ký & Két bảo vệ AI Agent trên Avalanche.
- **Thông điệp 1 câu:** *Mô phỏng State Diff thật trước khi ký — Khóa cứng quyền chi tiêu của AI Agent bằng Smart Contract.*
- **Thông tin:** Team1 Vietnam UniHack 2026 · Repo GitHub công khai · 7 hợp đồng đã xác minh trên Avalanche Fuji (`43113`).

### Slide 2 — Bài toán thực tế (Tại sao không thể "hỏi ChatGPT/Google"?)
- **Vấn đề 1 (Người dùng Web3):** Calldata hex như `approve(spender, MAX_UINT256)` hay phishing drainer không thể đọc bằng mắt thường hay hỏi chatbot tĩnh — bắt buộc phải chạy giả lập trên **trạng thái blockchain hiện tại** để đọc **`State Diff`** thực tế.
- **Vấn đề 2 (AI Agent tự động):** Khi trao ví cho AI Agent (LLM + tool calling), chỉ cần dính **Prompt Injection** ẩn trong hóa đơn/website hoặc ảo giác, AI có thể chuyển nhầm tiền hoặc rút sạch ví. Dặn AI qua System Prompt luôn có thể bị jailbreak.

### Slide 3 — Giải pháp: Kiến trúc phòng thủ 2 lớp của AegisAVAX
- **Lớp 1 — Pre-Execution Firewall (Off-chain):**
  - Fork trạng thái thật của Avalanche Fuji bằng **Anvil** cho từng yêu cầu, trích xuất `Before / After Balance Diff` và decoded events (`Transfer`, `Approval`, `ApprovalForAll`).
  - **5 luật rủi ro tất định bằng code thuần** (không phụ thuộc LLM): `UNLIMITED_APPROVAL`, `DRAIN_PATTERN`, `ADDRESS_POISONING`, `UNVERIFIED_OR_SCAM_CONTRACT`, `ABNORMAL_SLIPPAGE_OR_DANGEROUS_CALL`.
  - **AI Intent-vs-Execution Verifier** trả JSON + giải thích tiếng Việt; thiết kế **fail-closed** (lỗi model / lệch số tiền hoặc người nhận → chặn ký).
  - Chỉ cấp chữ ký **EIP-712 Security Clearance** khi `SAFE` và `intentMatch === true`.
  - Bộ lọc prompt injection dùng biểu thức chính quy là lớp heuristic. Trước khi ký, backend đối chiếu số tiền và người nhận với calldata bằng quy tắc tất định. Khi thực thi, két kiểm tra chữ ký, hạn mức và danh sách cho phép.
- **Lớp 2 — Cryptographic Guardrails (On-chain):**
  - Két phi lưu ký `GuardVault.sol` + `PolicyModule.sol`: ví AI Agent không giữ quỹ, chỉ dùng `Session Key`.
  - Khóa cứng on-chain: `txLimit`, `dailyCap` (cửa sổ trượt 24 giờ, giữ nguyên kể cả khi xoay session key), `tokenWhitelist`, `targetWhitelist`, kiểm tra chữ ký EIP-712 + `nonce` + `deadline`, và **Kill Switch** (`revokeAgent()` / `pause()`).

### Slide 4 — Trả lời Câu hỏi 1: *Why on-chain?*
- Prompt / off-chain guardrails có thể bị vượt qua nếu AI bị Prompt Injection hoặc API key bị lộ.
- Chỉ **Smart Contract on-chain** (`GuardVault` + `PolicyModule`) mới chặn cứng bằng mật mã ngay tại tầng thực thi EVM: dù kẻ tấn công gửi thẳng lệnh bỏ qua Lớp 1, hợp đồng vẫn **`REVERT`** với mã lỗi minh bạch (`InvalidSecurityClearance`, `TargetNotWhitelisted`, `TxLimitExceeded`, `DailyCapExceeded`, `AgentRevoked`).
- Toàn bộ hành vi chi tiêu (`AgentExecuted`), thu hồi (`AgentRevoked`) và bằng chứng chặn mối đe dọa (`ThreatAuditLog`) đều công khai, kiểm chứng được.

### Slide 5 — Trả lời Câu hỏi 2: *Why Avalanche?*
- Giao dịch Kill Switch trên Fuji mất 3168 ms đến khi máy chạy thử nhận biên nhận. Lệnh sau đó của agent bị từ chối với `AgentRevoked`.
- Agent đã thanh toán 0,005 mUSDC trên testnet bằng EIP-3009.
- Aegis Audit đã tạo Subnet và Chain trên Fuji P-Chain. Mạng chưa có validator do dịch vụ Managed Node báo lỗi 500/502. ThreatAuditLog hiện ghi trên Fuji C-Chain.

### Slide 6 — Giao thức kinh tế Agent (`x402` + `aegis-mcp`) & Tiện ích Chrome MV3
- **B2B / M2M `x402` (`POST /api/v1/agent/verify-tx`):** Trả `HTTP 402 Payment Required` (`5,000` đơn vị = `0.005 mUSDC`, `eip155:43113`), xác thực & thanh toán bằng **EIP-3009 (`transferWithAuthorization`)** qua header `PAYMENT-SIGNATURE` không cần tạo tài khoản hay trả phí theo tháng.
- **MCP Server (`aegis-mcp`):** Đóng gói tool `simulate_and_verify_tx` theo chuẩn `@modelcontextprotocol/sdk` để bất kỳ AI Agent nào cũng tự gọi kiểm tra giao dịch và thanh toán `x402`.
- **Chrome Extension MV3 (`extension/`):** Khiên cảnh báo góc màn hình + Popup kiểm tra tên miền chống phishing (dùng blocklist MetaMask có bản dự phòng cục bộ) mà **không can thiệp `window.ethereum`**.

### Slide 7 — Kiến trúc Smart Contracts & Xác minh công khai trên Fuji
- Hiển thị bảng **7 hợp đồng đã triển khai & xác minh `exact_match`** trên Avalanche Fuji (`43113`):
  - `GuardVault` (`0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F`)
  - `PolicyModule` (`0x3b271117E6AC5e243686Bc61771CbC5C7F8Db436`)
  - `MockUSDC` (`0x7620FaBA82e05bBb889f80F3E20429A81f2e7113`)
  - `MockPartner`, `MockDrainer`, `ScamRegistry`, `ThreatAuditLog`
- Nhấn mạnh kỹ thuật: `evm_version = "cancun"`, OpenZeppelin `v5.6.1`, `spentInWindow()` tìm kiếm nhị phân $O(\log n)$.

### Slide 8 — Kết quả Kiểm thử & Red-Team Evaluation (Số liệu đo thực tế)
- **Foundry Unit + Fuzz Tests:** **27/27 pass** (20 `GuardVault` gồm 256 lần fuzz, 5 `MockUSDC` EIP-3009, 2 `ScamRegistry`/`ThreatAuditLog`).
- **Backend & MCP Tests:** **9/9 pass** + kiểm thử đầu cuối với mô hình thật `Qwen2.5-1.5B-Instruct` trên Anvil fork.
- **Bộ Red-Team Eval 36 ca (block Fuji `61391624`):**
  - Kết quả chỉ áp dụng cho bộ 36 ca do nhóm tự xây dựng. Nhóm chưa đánh giá trên dữ liệu tấn công thực tế.
  - 13/13 lệnh sạch duyệt đúng (gồm 2 câu tiếng Việt tự nhiên & 1 lệnh `approve` hạn mức nhỏ 5 mUSDC — 0 false positive) · 10/10 giao dịch rủi ro (phủ đủ 5 luật) bị chặn · 13/13 ca Prompt Injection, Jailbreak EOA lạ & lệch tài sản (`AVAX` vs `mUSDC`) bị chặn.
  - **Precision 100% · Recall 100% · Block Rate 100% · 0 lỗi dịch vụ · Số dư két giữ nguyên `50 → 50 mUSDC`**.
- Extension MV3 đã chạy trên Chromium. Phép thử chuyển dự phòng 12–15 ms dùng hai node Anvil cục bộ.

### Slide 9 — Trả lời Câu hỏi 3: *Mô hình doanh thu & Ranh giới pháp lý tại Việt Nam*
- **Where does the money come from?**
  - **Người dùng cá nhân (B2C):** Quét giao dịch trên Web UI & Chrome Extension **miễn phí** (tạo độ phủ và dữ liệu mẫu mối đe dọa).
  - **AI Agent / dApp / Ví đối tác (B2B & M2M):** Thu phí vi mô **`0.005 mUSDC trên testnet / lượt quét`** qua giao thức **`x402`** trước mỗi lần AI tự động ký giao dịch, cộng gói chính sách bảo mật doanh nghiệp.
- **Tuân thủ ranh giới pháp lý tại Việt Nam:**
  - Công cụ phần mềm bảo mật **phi lưu ký (`non-custodial`)** — AegisAVAX không giữ tài sản, không trung gian thanh toán tiền pháp định.
  - **Không phát hành token đầu cơ**, không gọi vốn bán token.
  - Toàn bộ bản demo hiện vận hành trong phạm vi **Testnet (Avalanche Fuji & Anvil fork cục bộ)** với token thử nghiệm (`mUSDC`).

### Slide 10 — Demo thực tế (Điểm nhấn 3 luồng)
- **Luồng 1 (Lệnh sạch):** AI Agent chuyển `3 mUSDC` cho `MockPartner` → tự trả phí `0.005 mUSDC` qua `x402` → Anvil + Qwen duyệt `SAFE` → cấp EIP-712 → `GuardVault` thực thi thành công.
- **Luồng 2 (Phishing & Prompt Injection):** `approve(MAX_UINT256)` kích hoạt cờ đỏ `UNLIMITED_APPROVAL`; hóa đơn sai người nhận/số tiền bị chặn trước khi ký.
- **Luồng 3 (Bypass Lớp 1 & Kill Switch):** Gửi lệnh thiếu chữ ký thẳng vào `GuardVault` → hợp đồng **`REVERT` (`InvalidSecurityClearance`)** → bấm **`KILL SWITCH`** thu hồi quyền agent khi giao dịch được xác nhận.

### Slide 11 — Lộ trình phát triển & Tổng kết
- **Đã hoàn thành:** 7 hợp đồng verified trên Fuji, Anvil Fork + 5 Rules + Qwen Verifier + x402 + `aegis-mcp`, Web UI 2 tab, Eval 36 ca, Chrome Extension MV3, `ThreatAuditLog` failover, và đăng ký `CreateSubnetTx` / `CreateChainTx` cho mạng riêng `Aegis Audit` (`99321`) trên Fuji P-Chain. Mạng chưa có validator.
- **Hướng mở rộng sau cuộc thi:** Hoàn tất validator của Aegis Audit cho mạng lưới ghi nhật ký đe dọa phân tán, tích hợp đa ví (Core/Safe), và kết nối cảnh báo liên chuỗi qua ICM/Teleporter.
- **Kêu gọi:** Link GitHub Repo + QR Code mở thẳng `GuardVault` trên Fuji Explorer.

---

## 2. Kịch bản quay Video Demo (2 phút 45 giây — tối đa 3 phút)

### Chuẩn bị trước khi bấm quay (Checklist bắt buộc)
1. Khởi động mới 3 terminal từ thư mục `aegis-avax/` để số dư két sạch ở **`50 mUSDC`**:
   - Terminal 1: `npm run model:local` (Qwen ở cổng `8091`)
   - Terminal 2: `npm run dev:demo` (Anvil fork từ Fuji + backend `4021` + controller `4022`)
   - Terminal 3: `npm run dev:web` (hoặc production `npm run start -w frontend`, cổng `3000`)
2. Mở sẵn 3 tab Chrome (không quay bằng camera điện thoại, không để phụ đề che ô input/kết quả):
   - **Tab 1:** `http://127.0.0.1:3000` (AegisAVAX Demo — cài sẵn Extension MV3 nếu muốn hiện khiên góc trang).
   - **Tab 2:** `GuardVault` đã xác minh trên [Avalanche Fuji Snowtrace](https://testnet.snowtrace.io/address/0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F).
   - **Tab 3:** Mở README tại [Live proof on Fuji](../README.md#live-proof-on-fuji).

### Diễn biến từng giây

| Mốc thời gian | Thao tác trên màn hình | Lời thuyết minh (ngắn gọn, rõ ràng) |
| --- | --- | --- |
| **0:00 – 0:25** | Đứng tại Tab `Tx Firewall` của AegisAVAX. | *"Khi bạn ký một giao dịch Web3 hay trao ví cho AI Agent tự động, làm sao chắc chắn chuỗi calldata hex đó trả đúng người, đúng số tiền? Chỉ nhắc AI bằng prompt có thể bị Prompt Injection. AegisAVAX giải quyết bằng hai lớp: mô phỏng trạng thái thật trước khi ký và khóa cứng hạn mức bằng Smart Contract trên Avalanche."* |
| **0:25 – 0:55** | Chuyển sang Tab `AI Agent Sandbox`. Chỉ vào số dư đầu `50 mUSDC`, hạn mức `10/lệnh`, `25/24h`. Bấm nút **`Chuyển 3 mUSDC đến MockPartner`**. Khi xong, mở 2 liên kết `Biên nhận Anvil` và `Thanh toán x402` trong `Lịch sử phiên`. | *"Ở luồng hợp lệ, AI Agent muốn chuyển 3 mUSDC cho MockPartner. Agent tự thanh toán vi mô 0.005 mUSDC qua giao thức x402 bằng EIP-3009. Aegis chạy giả lập trên Anvil fork từ Fuji, đối chiếu ý định bằng Qwen cục bộ rồi cấp chữ ký EIP-712. GuardVault xác thực chữ ký và chuyển đúng 3 mUSDC — phí quét của agent và quỹ trong két tách biệt hoàn toàn."* |
| **0:55 – 1:25** | Chuyển qua Tab `Tx Firewall`. Chọn kịch bản mẫu **`Phê duyệt vô hạn`** rồi bấm **`Mô phỏng giao dịch`**. Chỉ vào cờ đỏ `UNLIMITED_APPROVAL`, bảng `Trước / Sau`, bảng **`Sự kiện giải mã (Decoded Events)`** hiện **`Approval · Không giới hạn (MAX_UINT256)`** và giải thích tiếng Việt (cùng khiên Extension nếu bật). | *"Với người dùng cá nhân, tab Tx Firewall miễn phí giúp bóc trần giao dịch lừa đảo trước khi ký. Khi mô phỏng lệnh approve vô hạn, số dư hiện tại chưa đổi nhưng bộ 5 luật tất định lập tức gắn cờ CRITICAL UNLIMITED_APPROVAL và bảng Sự kiện giải mã hiện rõ quyền Approval Không giới hạn (MAX_UINT256) gửi tới hợp đồng Drainer."* |
| **1:25 – 2:05** | Về Tab `AI Agent Sandbox`. Bấm **`Kiểm tra hóa đơn sai người nhận`** → chỉ lý do từ chối cấp EIP-712. Sau đó bấm **`Kiểm tra lệnh thiếu chữ ký`** → chỉ rõ thông báo **`REVERT cứng: InvalidSecurityClearance()`**. Bấm nút đỏ **`Kill switch · Thu hồi session key`** → chỉ trạng thái `Agent đã khóa`. | *"Khi AI gặp hóa đơn độc hại bị Prompt Injection đổi người nhận hoặc số tiền, Lớp 1 phát hiện lệch ý định và từ chối ký clearance. Ngay cả khi agent cố tình bỏ qua Lớp 1 và gọi thẳng hợp đồng, GuardVault vẫn REVERT cứng với mã lỗi InvalidSecurityClearance(). Chủ ví chỉ cần bấm Kill Switch để thu hồi quyền agent khi giao dịch được xác nhận."* |
| **2:05 – 2:35** | Mở bảng [Live proof on Fuji](../README.md#live-proof-on-fuji), rồi mở ba biên nhận Snowtrace trong bảng, lần lượt là chuyển 1 mUSDC thành công, `InvalidSecurityClearance` và `AgentRevoked`. | “Một giao dịch đã chuyển đúng 1 mUSDC cho MockPartner. Hai giao dịch tiếp theo trên màn hình bị két từ chối vì thiếu chữ ký hoặc vì agent đã mất quyền. Cả ba biên nhận đều kiểm tra được trên Fuji.” |
| **2:35 – 2:45** | Hiện tiêu đề AegisAVAX và đường dẫn GitHub `github.com/tq11372/aegis-avax`. | *"AegisAVAX — công cụ bảo mật phi lưu ký cho kỷ nguyên AI Agent trên Avalanche. Toàn bộ mã nguồn và hướng dẫn tái lập nằm công khai trên GitHub. Cảm ơn Ban Giám Khảo."* |

---

## 3. Bộ 10 câu hỏi Q&A kỹ thuật dự kiến & Gợi ý trả lời

1. **Hỏi: Nếu LLM (`Qwen`) bị ảo giác hoặc sập dịch vụ thì có ký nhầm giao dịch xấu thành `SAFE` không?**
   - **Trả lời:** Không. Hệ thống có 2 tầng chốt an toàn trước khi gọi hoặc nhận kết quả từ LLM: (1) 5 luật tất định trong `backend/src/risk.ts` có quyền **veto cứng** — nếu dính bất kỳ luật nào là chặn ngay không phụ thuộc LLM; (2) bộ đối chiếu ý định (`intent.ts`) kiểm tra số tiền và địa chỉ rõ ràng độc lập với LLM, và khi model vắng mặt hoặc trả JSON sai định dạng, hệ thống **fail-closed** (`MEDIUM`, `clearance: null`).

2. **Hỏi: Kẻ tấn công lấy được chữ ký EIP-712 cũ rồi gửi lại (replay attack) hoặc dùng trên mạng khác thì sao?**
   - **Trả lời:** Không được. `CLEARANCE_TYPEHASH` trong `GuardVault.sol` ràng buộc đầy đủ `vault`, `agent`, `target`, `calldataHash = keccak256(data)`, `value`, `nonce`, `deadline`, cộng thêm `chainId` và `verifyingContract` trong EIP-712 domain. Mỗi lần `execute()`, `grantAgent()`, `revokeAgent()`, hay `pause()` đều tăng `nonce`, vô hiệu hóa toàn bộ chữ ký cũ ngay lập tức.

3. **Hỏi: Nếu chủ két thu hồi session key cũ và cấp session key mới cho Agent, hạn mức 24 giờ (`dailyCap`) có bị reset để lách luật không?**
   - **Trả lời:** Không. `GuardVault.sol` lưu mảng `Checkpoint[] history` ở cấp két (không theo từng địa chỉ agent) và tính `spentInWindow()` bằng **tìm kiếm nhị phân** trong cửa sổ trượt `(now - 24h, now]`, nên đổi session key vẫn giữ nguyên tổng chi trong 24 giờ gần nhất.

4. **Hỏi: Tại sao lại chọn `x402` + `EIP-3009` thay vì bắt người dùng trả phí API bằng thẻ tín dụng hay đăng ký gói tháng?**
   - **Trả lời:** Vì AI Agent không có thẻ tín dụng hay tài khoản KYC để mua gói SaaS. Với `x402` (HTTP 402 + `transferWithAuthorization` EIP-3009 trên Avalanche), Agent chỉ cần ký ủy quyền trả đúng `0.005 mUSDC` ngay trong header `PAYMENT-SIGNATURE` cho từng lượt quét, tách biệt hoàn toàn với quỹ của `GuardVault`.

5. **Hỏi: Tại sao Chrome Extension MV3 không ghi đè `window.ethereum` của Core Wallet hay MetaMask?**
   - **Trả lời:** Ghi đè `window.ethereum` dễ xung đột với chuẩn EIP-6963, CSP của trang web và rủi ro bảo mật khóa ví. Extension của AegisAVAX hoạt động ở chế độ Popup / Floating Shield độc lập, không chạm tới khóa ký của ví, đồng thời so khớp tên miền với blocklist MetaMask có bản dự phòng cục bộ.

6. **Hỏi: Phần tích hợp L1 riêng Aegis Audit hiện đang ở mức nào và nếu RPC L1 chết khi vận hành thì sao?**
   - Aegis Audit đã tạo Subnet và Chain trên Fuji P-Chain. Mạng chưa có validator do dịch vụ Managed Node báo lỗi 500/502. ThreatAuditLog hiện ghi trên Fuji C-Chain. Chuyển dự phòng 12–15 ms được đo trên hai node Anvil cục bộ. Worker kiểm tra chain ID, quyền reporter và ID trùng trước khi ghi.

7. **Hỏi: Tại sao trong `foundry.toml` lại chốt `evm_version = "cancun"` và OpenZeppelin `v5.6.1`?**
   - **Trả lời:** Để tương thích tuyệt đối với Avalanche Fuji C-Chain — tránh các bản OpenZeppelin mới hơn có thể sinh opcode `CLZ` (Osaka) chưa được Fuji hỗ trợ, đảm bảo cả 7 hợp đồng biên dịch, triển khai và xác minh `exact_match` trơn tru.

8. **Hỏi: Khi triển khai trên môi trường thực, độ trễ Anvil fork cho từng yêu cầu có làm trải nghiệm chậm không?**
   - **Trả lời:** Trong bản MVP này, mỗi yêu cầu mở fork cô lập để đảm bảo không nhiễm trạng thái giữa các lần mô phỏng. Khi lên production có thể dùng pool node archive/RPC gần người dùng hoặc `eth_call` state override / fork snapshot dùng lại theo block mới nhất trên Avalanche (block time ~1–2 giây) để đưa độ trễ xuống dưới vài trăm mili-giây.

9. **Hỏi: Dự án có phát hành token đầu cơ hay dính ranh giới pháp lý tại Việt Nam không?**
   - **Trả lời:** Không. AegisAVAX là công cụ phần mềm bảo mật phi lưu ký (`non-custodial`), không giữ hộ tiền của người dùng, không phát hành token đầu cơ hay huy động vốn, và hiện chỉ chạy thử nghiệm trên Testnet bằng token demo `mUSDC`.

10. **Hỏi: Làm sao Ban Giám Khảo có thể tự kiểm chứng lại toàn bộ hệ thống trên máy của mình?**
    - **Trả lời:** Toàn bộ 7 địa chỉ hợp đồng verified kèm link Snowtrace & Sourcify nằm ở cuối `README.md`. Chỉ cần `npm ci`, `cd contracts && npm ci && forge build`, chạy `forge test` (`27/27`), `npm test` (`9/9`), `npm run test:audit`, và khởi chạy 3 lệnh (`model:local`, `dev:demo`, `dev:web`) là tái lập được toàn bộ 2 tab giao diện và 36 ca Red-Team Eval trên Anvil fork từ Fuji.
