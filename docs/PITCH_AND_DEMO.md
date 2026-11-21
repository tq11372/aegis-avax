# Dàn ý Slide Pitch, Kịch bản Video Demo & Q&A — AegisAVAX

Tài liệu chuẩn bị cho **Vòng loại trực tuyến (50đ kỹ thuật)** và **Vòng Chung kết Offline (50đ: 2 phút setup + 5 phút pitch tiếng Việt + 5 phút Q&A)** tại Team1 Vietnam UniHack 2026.

---

## 1. Dàn ý Slide Pitch (22 slide — tiếng Việt, hệ bố cục Slidev & Vercel Geist)

> **Link Google Slides công khai (22 trang):** [https://docs.google.com/presentation/d/1GbwWTIyI_WBsYoN1tf5dfELDGwLOYKd3yoCp3-T3uqU/edit?usp=sharing](https://docs.google.com/presentation/d/1GbwWTIyI_WBsYoN1tf5dfELDGwLOYKd3yoCp3-T3uqU/edit?usp=sharing)
>
> Bộ slide chuẩn hóa theo hệ thống bố cục mã nguồn mở **[Slidev](https://github.com/slidevjs/slidev)** (`cover`, `two-cols`, `fact`, `image-right`, `statement` 3 hàng đối chiếu, `four-step` pipeline) kết hợp ảnh chụp giao diện sản phẩm thiết kế theo **[`shadcn-ui/ui`](https://github.com/shadcn-ui/ui)** và **Vercel Geist Design System**. Toàn bộ 22 trang đồng nhất hệ lưới `16:9` (`13.333 × 7.5 in`), tiêu đề phụ hai thành phần (`NHÓM CHỦ ĐỀ  /  TIÊU ĐỀ PHỤ`), bảng màu tương phản cao (`#241B39`, `#FAF8F3`, `#EDE7FA`, `#613CAA`, `#ADF2D1`) và bộ đếm trang `01 / 22` .. `22 / 22`.

### Slide 01 / 22 — Trang bìa (`TEAM1 VIETNAM UNIHACK 2026`)
- **Tiêu đề:** `AegisAVAX`
- **Thông điệp cốt lõi:** *Kiểm tra giao dịch trước khi ký. Giới hạn số tiền AI được phép chi.*
- **Đội thi:** Đội `AI_hihi11` · `Trần Văn Quân · Trưởng đội` (thành viên duy nhất đăng ký trong hồ sơ đội).

### Slide 02 / 22 — Mở đầu Bài toán 1: Bức tranh tổng thể (`BÀI TOÁN  /  HAI ĐIỂM MÙ TRƯỚC KHI KÝ`)
- **Tiêu đề:** *Hai lý do khiến ví mất tiền trước khi lên chuỗi*
- **Điểm mù 1 — Người dùng ký mù trên ví (`Blind Signing`):** Ví tiêu chuẩn chỉ hiện chuỗi hex như `0x095ea7b3...ffff`. Nếu không mô phỏng trạng thái thật trước khi ký, người dùng không thấy hợp đồng sắp rút token hay xin quyền chi tiêu vô hạn (`approve(MAX_UINT256)`).
- **Điểm mù 2 — AI bị thao túng hóa đơn (`Indirect Prompt Injection & Tampered Invoices`):** Khi AI tự đọc hóa đơn hoặc trang web để thanh toán, dữ liệu bên ngoài có thể cài lệnh ẩn hoặc sửa số tiền. Giao thẳng khóa riêng (`EOA`) cho AI khiến một lần đọc sai cũng làm mất quỹ.
- **Điểm chốt:** *Cả hai rủi ro đều xảy ra ở bước chuẩn bị lệnh, trước khi blockchain kịp ghi nhận giao dịch.*

### Slide 03 / 22 — Mở đầu Bài toán 2: Tình huống cụ thể (`BÀI TOÁN  /  TÌNH HUỐNG THỰC TẾ`)
- **Tiêu đề:** *Cùng người nhận quen thuộc, sai số tiền*
- **Đối chiếu trực quan:**
  - **Lệnh gốc chủ két đã duyệt:** **`3 mUSDC`** (chuyển cho đối tác quen `MockPartner`, có thể ràng buộc bằng chữ ký `EIP-712 OwnerIntentApproval`).
  - **Hóa đơn gửi tới AI Agent:** **`4 mUSDC`** (cùng ghi người nhận `MockPartner`).
- **Điểm mù của bộ lọc tĩnh:** *Cả hai đều chuyển cho đối tác quen `MockPartner` và đều dưới trần `10 mUSDC`. Bộ lọc chỉ kiểm tra danh sách trắng hoặc hạn mức tĩnh sẽ bỏ lọt chênh lệch này.*

### Slide 04 / 22 — Mở đầu Bài toán 3: Khoảng trống hiện tại (`BÀI TOÁN  /  HẠN CHẾ CỦA CÁCH CŨ`)
- **Tiêu đề:** *Tại sao một lớp bảo vệ đơn lẻ không chặn đủ?*
- **Bảng đối chiếu 3 cách tiếp cận đơn lẻ:**
  1. **Chỉ dặn bằng System Prompt:** Hóa đơn bên ngoài có thể chèn lệnh ẩn làm AI bỏ qua chỉ dẫn ban đầu. Lời dặn trong prompt không có hiệu lực khóa tiền trên chuỗi.
  2. **Chỉ cài Whitelist & Trần tĩnh:** Hợp đồng chỉ biết người nhận hợp lệ và số tiền dưới trần `10 mUSDC`. Hợp đồng không biết lệnh gốc của chủ két chỉ duyệt `3 mUSDC`.
  3. **Chỉ cảnh báo trên màn hình:** Cảnh báo giao diện giúp người dùng tự bấm ví, nhưng không tự chặn được AI Agent gọi thẳng qua API nếu thiếu két hợp đồng trên chuỗi.

### Slide 05 / 22 — Tổng quan Giải pháp (`GIẢI PHÁP  /  KIẾN TRÚC HAI LỚP`)
- **Tiêu đề:** *Một giao dịch qua hai lớp kiểm tra*
- **Trước khi ký (Lớp 1 — Off-chain):** Anvil mô phỏng tác động lên số dư. Bộ quét áp 5 luật rủi ro tất định và đối chiếu bất biến quan hệ $\Phi(I, E)$ giữa kết quả mô phỏng với lệnh của người dùng.
- **Khi thực thi (Lớp 2 — On-chain):** `GuardVault` và `PolicyModule` kiểm tra chữ ký `EIP-712 Security Clearance`, người nhận và hạn mức ngay trên Avalanche Fuji (`43113`).
- **Phân định vai trò:** *Ví cá nhân nhận cảnh báo. Quyền chặn chi tiêu thuộc về két `GuardVault`.*

### Slide 06 / 22 — Luồng dữ liệu 4 bước (`LUỒNG DỮ LIỆU  /  TỪ AGENT ĐẾN KÉT`)
- **Tiêu đề:** *Một lệnh chuyển tiền đi đâu?*
- **Pipeline 4 chặng (`Dữ liệu vào` → `Lớp 1 / Mô phỏng và xác minh` → `Lớp 2 / Thực thi`):**
  1. **`Agent`:** Gửi lệnh chủ két đã ký và dữ liệu gọi hàm chuyển token.
  2. **`Anvil`:** Chạy thử giao dịch. Đọc số dư thay đổi và địa chỉ nhận.
  3. **`Bộ kiểm tra`:** So kết quả với lệnh gốc. Đạt kiểm tra mới cấp chữ ký.
  4. **`GuardVault`:** Kiểm chữ ký, đích và hạn mức rồi mới chuyển token.
- **Chốt chặn fail-closed:** *Nếu số tiền hoặc người nhận lệch lệnh gốc, quá trình dừng ở lớp 1.*

### Slide 07 / 22 — Ví dụ minh họa trên Anvil (`VÍ DỤ  /  MÔ PHỎNG TRÊN ANVIL`)
- **Tiêu đề:** *“Chuyển 3 mUSDC đến MockPartner”* (Két ban đầu có `50 mUSDC`, chủ két đã ký duyệt đúng lệnh trên).
- **`Agent đề xuất 3`:** Anvil dự báo két còn `47`. Đúng số tiền, đúng người nhận. Nếu đủ hạn mức, két chuyển `3 mUSDC`.
- **`Agent đề xuất 4`:** Anvil dự báo két còn `46`. Bộ đối chiếu thấy `4` khác `3` nên dừng cấp chữ ký. Két vẫn còn `50 mUSDC`.
- Liên kết kiểm chứng: [`backend/scripts/demo.ts`](../backend/scripts/demo.ts).

### Slide 08 / 22 — Sản phẩm Tab 1: Tường lửa giao dịch (`SẢN PHẨM  /  TX FIREWALL`)
- **Tiêu đề:** *Ví sắp cấp quyền gì?*
- **Nội dung:** Giao diện giải mã lệnh phê duyệt `approve(MAX_UINT256)` và hiển thị thay đổi dự kiến (`State Diff` + `Decoded Events: Approval Không giới hạn`) trước khi người dùng ký.
- **Ảnh minh chứng:** Ảnh chụp giao diện mới (chuẩn hóa theo `shadcn/ui` & Vercel Geist) trên Anvil fork từ Fuji, block `61420709`.

### Slide 09 / 22 — Chính sách hạn mức của két (`CHÍNH SÁCH  /  HẠN MỨC CHI TIÊU`)
- **Tiêu đề:** *Chủ két đặt giới hạn chi tiêu*
- **Số liệu cấu hình demo:** **`10` mUSDC mỗi lệnh** · **`25` mUSDC trong 24 giờ trượt**.
- **Chống lách hạn mức:** Trong cấu hình demo, đổi khóa phiên (`session key`) vẫn giữ nguyên số tiền đã chi trong cửa sổ 24 giờ (`spentInWindow()` tính ở mức két).

### Slide 10 / 22 — Sản phẩm Tab 2: Két bảo vệ AI Agent (`SẢN PHẨM  /  AI AGENT SANDBOX`)
- **Tiêu đề:** *Chủ két có thể thu hồi quyền*
- **Nội dung:** Trong tab Sandbox, chủ két thử 3 kịch bản (`Chuyển 3 mUSDC đến MockPartner`, `Kiểm tra hóa đơn sai số tiền`, `Mô phỏng lệnh thiếu chữ ký`), kiểm tra hạn mức, bật xác nhận lệnh bởi owner (`EIP-712`) và bấm **`Kill switch · Thu hồi session key`**.
- **Tham chiếu chéo:** *Ảnh demo cục bộ. Biên nhận công khai trên Fuji ở trang 13.*

### Slide 11 / 22 — Giao thức kinh tế Agent (`TÍCH HỢP AGENT  /  MCP VÀ x402`)
- **Tiêu đề:** *Phí cho một lượt quét*
- **Số liệu:** **`0,005` mUSDC trên Fuji testnet** (`5.000` đơn vị cơ sở, thanh toán qua `x402` + `EIP-3009 transferWithAuthorization`).
- **Bảo vệ ngân sách phí ở phía client:** Agent ký thanh toán qua `x402`. Bản demo giới hạn tổng phí được ký ở **`0,1 mUSDC mỗi phiên`** (`X402_SESSION_BUDGET_ATOMIC = 100000`, tối đa 20 lượt quét trả phí mỗi phiên MCP).

### Slide 12 / 22 — Bằng chứng thực thi trên Avalanche Fuji (`BẰNG CHỨNG  /  AVALANCHE FUJI`)
- **Tiêu đề:** *Một lần chuyển tiền đã xác nhận*
- **Số liệu on-chain:** **`100 → 99` mUSDC trong két** (block `61407365` → `61407405`). `MockPartner` nhận `1 mUSDC` tại giao dịch [`0x4eda603d...b361ed`](https://testnet.snowtrace.io/tx/0x4eda603dacb0636bd1845fc9f3357cd1442430c9210b6f4dc8cac65018b361ed) (block `61407383`). Agent trả phí quét riêng.

### Slide 13 / 22 — Bằng chứng thu hồi quyền trên Fuji (`BẰNG CHỨNG  /  THU HỒI QUYỀN`)
- **Tiêu đề:** *Sau khi chủ két thu hồi quyền, `AgentRevoked`*
- **Nội dung:** Đó là lỗi của lệnh chi kế tiếp trên Fuji ([`0xc73a7ca7...71cec01c`](https://testnet.snowtrace.io/tx/0xc73a7ca7d57e994fad2f624f4381c514812d4bc9be27edee77a3dc6571cec01c), block `61407396`) ngay sau giao dịch `revokeAgent` ở block `61407392`. Biên nhận ghi trạng thái `revert`; mã lỗi được đối chiếu bằng mô phỏng ở block trước.

### Slide 14 / 22 — Hạ tầng Avalanche L1 riêng (`HẠ TẦNG  /  AEGIS AUDIT`)
- **Tiêu đề:** *Dấu vết cảnh báo trên L1 riêng*
- **Số liệu:** **`99321`** — Chain ID của `Aegis Audit` (3 giao dịch P-Chain `CreateSubnetTx`, `CreateChainTx`, `ConvertSubnetToL1Tx` đã `Committed`).
- **Minh bạch vận hành:** Ba giao dịch triển khai hợp đồng, cấp quyền và ghi bằng chứng ở block `1–3`. Mạng có một validator (`NodeID-JfjZnbPTuMLnFuqT5gwcRChkBy23sPT8G`); RPC hiện truy cập từ máy vận hành. Xem [`docs/aegis-l1-proof.json`](aegis-l1-proof.json).

### Slide 15 / 22 — Đánh giá 500 mẫu (`ĐÁNH GIÁ  /  BỘ QUÉT 500 MẪU`)
- **Số liệu nổi bật:** **`496/500`** (`99,2%`) quyết định khớp nhãn của bộ mẫu nội bộ (`TP = 320, TN = 176, FP = 4, FN = 0`).
- **Ngữ cảnh minh bạch:** `4` cảnh báo nhầm, `0` ca bỏ sót. Đội tự xây dựng bộ mẫu 5 tầng (`T1–T5`). Kết quả đo quyết định quét trước khi ký tại block `61419926`. Xem [`docs/eval-benchmark-500.json`](eval-benchmark-500.json).

### Slide 16 / 22 — Phép thử đối chứng vai trò của Qwen (`ĐỐI CHỨNG  /  8 LỆNH CHUYỂN`)
- **Tiêu đề:** *Qwen giúp gì trong phép thử này?*
- **`4 lệnh đúng số tiền`:** Tắt Qwen (`Intent-No-LLM`), cả bốn nhận `MEDIUM`. Bật Qwen (`Full-with-Qwen`), cả bốn nhận `SAFE`.
- **`4 lệnh lệch 1 mUSDC`:** Bộ đối chiếu bất biến quan hệ $\Phi(I, E)$ chặn cả bốn ở cả hai chế độ. Mỗi lệnh đều chuyển tới `MockPartner`. Xem [`docs/operational-check.json`](operational-check.json) tại block `61420617`.

### Slide 17 / 22 — Kiểm thử tải đồng thời (`VẬN HÀNH  /  TẢI ĐỒNG THỜI`)
- **Tiêu đề:** *Khi bốn yêu cầu đến cùng lúc*
- **Số liệu:** **`9/12`** lượt quét khác nhau thành công (`p95 = 5.199 ms`) · **`12/12`** lượt quét giống nhau thành công (`p95 = 1.878 ms`).
- **Cơ chế backpressure:** Ba đợt trên máy demo tại block `61420566`. Ba yêu cầu khác nhau nhận `HTTP 429` khi bộ mô phỏng bận (không làm treo tiến trình). Xem [`docs/operational-check.json`](operational-check.json).

### Slide 18 / 22 — Đối tượng & Mô hình sử dụng (`ỨNG DỤNG  /  MÔ HÌNH SỬ DỤNG`)
- **Tiêu đề:** *Ai sẽ dùng AegisAVAX?*
- **`Người dùng ví` (B2C):** Quét giao dịch miễn phí trên web hoặc qua tiện ích Chrome MV3.
- **`Đội xây AI agent` (B2B / M2M):** Tích hợp MCP (`aegis-mcp`) để trả phí theo lượt quét (`x402`) và áp hạn mức chi cho agent qua `GuardVault`.
- **Tình trạng thực tế:** Bước tiếp theo là thử với một đội tích hợp và đo chi phí mỗi lượt. Hiện chưa có pilot bên ngoài.

### Slide 19 / 22 — Hướng dẫn giám khảo tự kiểm chứng (`KIỂM CHỨNG  /  HƯỚNG DẪN ĐỐI CHIẾU`)
- **Tiêu đề:** *Ba kết quả, ba cách đối chiếu*
  1. **[`Quyết định của bộ quét ↗`](eval-benchmark-500.json):** Mở 500 kết quả tại block `61419926`. So nhãn kỳ vọng với quyết định của API; 4 mẫu sạch bị cảnh báo nhầm.
  2. **[`Tiền đã chuyển trên Fuji ↗`](https://testnet.snowtrace.io/tx/0x4eda603dacb0636bd1845fc9f3357cd1442430c9210b6f4dc8cac65018b361ed):** Mở biên nhận và đọc sự kiện `Transfer` của `mUSDC`. Kiểm người gửi, người nhận và `1.000.000` đơn vị cơ sở (`= 1 mUSDC`).
  3. **[`Quyền đã bị thu hồi ↗`](fuji-live-proof.json):** Đối chiếu giao dịch thu hồi với lệnh chi kế tiếp bị `revert`. Mã `AgentRevoked` được kiểm bằng mô phỏng ở block trước.

### Slide 20 / 22 — Khung pháp lý Việt Nam 1 (`PHÁP LÝ VIỆT NAM  /  TÀI SẢN VÀ PHÍ DỊCH VỤ`)
- **Tiêu đề:** *Từ token thử đến dịch vụ có thu phí*
- **`Phạm vi bản thi`:** `mUSDC` là token thử trên Fuji. Phí `0,005 mUSDC` minh họa cơ chế `x402`. Chủ két giữ quyền rút tài sản (`non-custodial`).
- **`Nếu cung cấp dịch vụ thật`:** Cần xác định hoạt động có thuộc dịch vụ tài sản mã hóa phải cấp phép hay không. Trong cơ chế thí điểm, các hoạt động tại khoản 7 Điều 4 phải thực hiện bằng đồng Việt Nam.
- **Nguồn văn bản:** [Luật Công nghiệp công nghệ số 71/2025/QH15, Điều 46–47](https://vanban.chinhphu.vn/?docid=217003&pageid=27160) · [Nghị quyết 05/2025/NQ-CP, Điều 4 và 7](https://vanban.chinhphu.vn/?classid=509&docid=215249&pageid=27160).

### Slide 21 / 22 — Khung pháp lý Việt Nam 2 (`PHÁP LÝ VIỆT NAM  /  DỮ LIỆU CÁ NHÂN`)
- **Tiêu đề:** *Địa chỉ ví có thể gắn với một người*
- **`Dữ liệu đi đâu?`:** Backend nhận địa chỉ ví, nội dung lệnh và dữ liệu giao dịch. Hợp đồng nhật ký (`ThreatAuditLog`) chỉ ghi mã sự kiện, hash `keccak256`, mức rủi ro và thời điểm.
- **`Trước khi thử với khách hàng`:** Nếu thông tin giúp xác định một người, cần xác định mục đích xử lý, giới hạn dữ liệu thu thập và thời gian lưu. Một hash vẫn có thể liên kết với hồ sơ khác.
- **Nguồn văn bản:** [Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15, Điều 2–3](https://vanban.chinhphu.vn/?docid=214590&pageid=27160&typegroupid=3).

### Slide 22 / 22 — Tổng kết & Liên kết kiểm chứng (`AEGISAVAX  /  AI_hihi11`)
- **Tiêu đề:** *Kiểm chứng dự án*
- **3 liên kết trực tiếp:**
  - [Mã nguồn và hướng dẫn chạy](https://github.com/tq11372/aegis-avax)
  - [12 biên nhận minh chứng trên Fuji](../README.md#live-proof-on-fuji)
  - [Bản build và kết quả CI](https://github.com/tq11372/aegis-avax/actions/runs/44893869785)
- **Chân trang:** `Trần Văn Quân · Team1 Vietnam UniHack 2026`

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
| **1:25 – 2:05** | Về Tab `AI Agent Sandbox`. Bấm **`Kiểm tra hóa đơn sai số tiền`** → chỉ lý do từ chối cấp EIP-712. Sau đó bấm **`Mô phỏng lệnh thiếu chữ ký`** → chỉ rõ thông báo **`REVERT cứng: InvalidSecurityClearance()`**. Bấm nút đỏ **`Kill switch · Thu hồi session key`** → chỉ trạng thái `Agent đã khóa`. | *"Khi AI gặp hóa đơn độc hại bị Prompt Injection đổi người nhận hoặc số tiền, Lớp 1 phát hiện lệch ý định và từ chối ký clearance. Ngay cả khi agent cố tình bỏ qua Lớp 1 và gọi thẳng hợp đồng, GuardVault vẫn REVERT cứng với mã lỗi InvalidSecurityClearance(). Chủ ví chỉ cần bấm Kill Switch để thu hồi quyền agent khi giao dịch được xác nhận."* |
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
   - Aegis Audit (99321) có một validator tự vận hành. ThreatAuditLog đã ghi lại sự kiện T1 tại block 3 của L1. RPC chạy trên máy dự án. Chuyển dự phòng 12–15 ms được đo trên hai node Anvil cục bộ. Worker kiểm tra chain ID, quyền reporter và ID trùng trước khi ghi.

7. **Hỏi: Tại sao trong `foundry.toml` lại chốt `evm_version = "cancun"` và OpenZeppelin `v5.6.1`?**
   - **Trả lời:** Để tương thích tuyệt đối với Avalanche Fuji C-Chain — tránh các bản OpenZeppelin mới hơn có thể sinh opcode `CLZ` (Osaka) chưa được Fuji hỗ trợ, đảm bảo cả 7 hợp đồng biên dịch, triển khai và xác minh `exact_match` trơn tru.

8. **Hỏi: Khi triển khai trên môi trường thực, độ trễ Anvil fork cho từng yêu cầu có làm trải nghiệm chậm không?**
   - **Trả lời:** Demo dùng lại node Anvil và mô phỏng tại block được chỉ định. Độ trễ lượt kiểm toán tuần tự có p95 2.098 ms tại block nguồn 61419503. Chưa có SLA production.

9. **Hỏi: Dự án có phát hành token đầu cơ hay dính ranh giới pháp lý tại Việt Nam không?**
   - **Trả lời:** Không. AegisAVAX là công cụ phần mềm bảo mật phi lưu ký (`non-custodial`), không giữ hộ tiền của người dùng, không phát hành token đầu cơ hay huy động vốn, và hiện chỉ chạy thử nghiệm trên Testnet bằng token demo `mUSDC`.

10. **Hỏi: Làm sao Ban Giám Khảo có thể tự kiểm chứng lại toàn bộ hệ thống trên máy của mình?**
    - **Trả lời:** Toàn bộ 7 địa chỉ hợp đồng verified kèm link Snowtrace & Sourcify nằm ở cuối `README.md`. Chỉ cần `npm ci`, `cd contracts && npm ci && forge build`, chạy `forge test` (`27/27`), `npm test` (`10/10`), `npm run test:audit`, và khởi chạy 3 lệnh (`model:local`, `dev:demo`, `dev:web`) là tái lập được toàn bộ 2 tab giao diện và 500 ca Red-Team Eval đa tầng (`docs/eval-benchmark-500.json`) trên Anvil fork từ Fuji.
