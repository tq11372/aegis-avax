# Bàn giao AegisAVAX

Cập nhật ngày 20/11/2026, giờ Việt Nam. Dự án Team1 Vietnam UniHack 2026 kết hợp kiểm tra giao dịch trước khi ký với két giới hạn quyền chi tiêu của agent trên Avalanche Fuji.

## Đọc khi đổi tài khoản

1. Mở repo `tq11372/aegis-avax`, nhánh `main`. Trên máy đang làm, repo nằm trong thư mục `aegis-avax/` cạnh tệp yêu cầu gốc `doc.md`. Tệp yêu cầu gốc chứa thông tin cá nhân và được giữ trên máy.
2. Đọc tài liệu này, kiểm tra `git status --short --branch` và `git log -4 --oneline`. Giữ lại các thay đổi đang làm trên máy. Nếu dùng máy khác, clone repo và cài lại phụ thuộc từ lockfile.
3. Xem README để lấy địa chỉ triển khai thật, bằng chứng xác minh và hướng dẫn chạy. Các giao dịch triển khai đã hoàn tất. Dùng các hợp đồng hiện hữu khi tiếp tục.
4. Bàn giao qua Git gồm mã nguồn, địa chỉ công khai, kết quả test và việc còn lại. Keystore của ba vai trò thuộc người dùng Windows đã tạo chúng. Đổi tài khoản Codex trên cùng máy vẫn dùng thư mục dự án đó. Chuyển máy cần chủ ví thiết lập lại quyền ký cục bộ.

## Các mốc

| Mốc | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Bước 1 · Hợp đồng và Foundry | Hoàn thành | Commit `6d0856d`. 27/27 test đạt, gồm 256 lần fuzz cho một bài. |
| Bước 1 · Triển khai Fuji | Hoàn thành | Commit `581595c`. Chain 43113, bảy hợp đồng đã xác minh, 13/13 biên nhận thành công. Tại block 61380210, két có 100 mUSDC, hạn mức 10/lệnh và 25/24 giờ. |
| Bước 2 · Backend và MCP | Đã chạy với Qwen thật trên Anvil | Commit nền `334376f`. Lệnh sạch qua MCP, EIP-3009, EIP-712 và GuardVault thành công; ý định lệch số tiền, approval không giới hạn và lệnh thiếu chữ ký bị chặn. |
| Bước 3 · Demo và đánh giá | Đã chạy hai tab trên Chrome và 30 ca trên Anvil | `frontend/` gồm Tx Firewall và AI Agent Sandbox. `evals/run_eval.ts` in kết quả từng ca, precision, recall, block rate và số dư két. Xem kết quả theo phiên ở README. |
| Vòng 2 | Đang thực hiện | Mốc Vòng 1 đã đẩy là `d576a8f`. Đã viết extension MV3, script deploy ThreatAuditLog và bộ ghi nhật ký có fallback. Đã xác minh sự kiện trên hai Anvil riêng. Đang kết nối ví và chuẩn bị Own L1 trên Fuji. |

## Quyết định cần giữ

- Bố cục của repo gồm `contracts/`, `backend/`, `mcp-server/`, `frontend/`, `evals/`, `extension/`. Tạo thư mục khi bắt đầu phần tương ứng.
- Chuỗi Fuji 43113, token demo mUSDC 6 chữ số thập phân, Solidity 0.8.30, Cancun, OpenZeppelin 5.6.1. MockDrainer là địa chỉ mẫu thụ động đã gắn cờ.
- GuardVault chỉ hỗ trợ ERC-20 transfer của token thanh toán. Chữ ký ràng buộc vault, agent, target (token), hash calldata, value, nonce, deadline. Đọc nonce và quyền hiện hành trước khi ký. Mô phỏng trả phí dự kiến 5.000 đơn vị mUSDC qua x402.
- Hạn khóa tính năng 17:00 ngày 21/11/2026 (GMT+7). Mục tiêu nộp 22:30, hạn cuối 23:59 cùng ngày. Chỉ ghi hash, địa chỉ, kết quả và thời gian đã quan sát thực tế.

## Cách cập nhật

Sau mỗi mốc hoặc trước khi dừng, cập nhật bảng trên cùng mục tiếp tục bên dưới. Ghi lệnh đã chạy, kết quả, lỗi còn mở và việc cần làm ngay sau đó. Đẩy bản bàn giao cùng mã đã kiểm thử lên GitHub. Khi mất phiên giữa chừng, đối chiếu bảng với working tree trước khi làm tiếp.

Khi một trong hai cửa sổ hạn mức Codex còn 8% hoặc thấp hơn, lưu mốc, hướng dẫn người dùng chuyển giao và dừng. Trong Codex có thể đọc hạn mức bằng công cụ `get_usage_limits`. Tỷ lệ còn lại bằng 100 trừ `usedPercent`. Tránh lưu mã tài khoản hay thông tin xác thực vào Git.

Trong chat mới, mở thư mục repo rồi gửi: “Đọc HANDOFF.md và README.md ở gốc repo, đối chiếu git status với mốc mới nhất, sau đó tiếp tục từ mục Tiếp tục từ đây. Cập nhật HANDOFF.md sau mỗi mốc. Kiểm tra hạn mức và dừng khi một trong hai cửa sổ còn 8%.”

## Tiếp tục từ đây

**Triển khai công khai đang chạy.** Ví Console đã kết nối Fuji. Người dùng đã xác nhận tạo Aegis Audit (AEGIS), Proof of Authority, owner 0x181C7d53A5885c08D9aF5e9ed93220Ed5e98df92. Builder Hub đã trả [CreateSubnetTx trên Fuji P-Chain](https://build.avax.network/explorer/fuji/p-chain/tx/2ZCC26UT9PzMkHRBUhD7N5EfiAV26cXHDUYiLcnrskRSEdiy5f). Theo dõi wizard hiện có; tránh tạo một subnet khác. Chỉ ghi nhận hoàn tất khi có RPC hoạt động và biên nhận hợp đồng audit.

**Kết quả wizard.** Builder Hub báo Deployment failed ở bước 6/8, Converting Subnet to L1. Lỗi UTXO thiếu 242451283 đơn vị nhỏ nhất, tương đương 0,242451283 AVAX testnet nếu tính theo nAVAX. RPC Fuji xác nhận giao dịch tạo subnet, owner P-Chain ghi trong CreateSubnetTx là P-fuji1yehhlfydqnld249akhl6w6afn7gqpns8c4q6xq. Trước khi cấp vốn cần xác định đúng tài khoản trả phí (wizard managed có thể dùng tài khoản khác ví Console). Bắt đầu ở My L1 Dashboard và Transaction Activity để tiếp tục subnet hiện có. Chưa xác nhận RPC Own L1 hoặc triển khai ThreatAuditLog trên L1.

**Vòng 2 đang làm.** Console Wallet là ví riêng cho L1. Trước khi tạo thêm ví hoặc gửi giao dịch triển khai, đối chiếu trạng thái trong Builder Hub và biên nhận đã có. Lưu RPC, chain ID, địa chỉ hợp đồng và hash giao dịch khi đã xác nhận. Test chạy cục bộ bằng `npm run test:audit`. Lần đầu xác nhận sự kiện trên cả hai Anvil, phát hiện ID đã ghi và chuyển sang mạng dự phòng trong 15 ms khi endpoint chính từ chối kết nối. Bản demo Anvil luôn tắt ghi audit công khai.

**Mốc kiểm thử Vòng 2 ngày 20/11.** Chrome for Testing đã chạy đạt khiên SAFE/CRITICAL từ trang web, popup CRITICAL và hai trường hợp tên miền. Extension dùng blocklist MetaMask, có bản dự phòng đóng gói tại commit nguồn 1567ec1f1d32f5a8880cdd5622584958f479772d. Lượt npm run test:audit sau cùng xác nhận bytecode, owner, reporter, ghi sự kiện, chặn ghi lặp và chuyển dự phòng 13 ms trên hai Anvil. Đã mở biểu mẫu tạo ví trong Builder Hub. Bước công khai kế tiếp là hoàn tất ví, kiểm tra nguồn gas P-Chain, tạo và xác minh Own L1. Slide, video và hồ sơ nộp còn mở.

**Chốt kỹ thuật Vòng 1 ngày 20/11.** Chạy lại từ commit `7f31aa0` trước khi mở Vòng 2: 27/27 Foundry, 6/6 Node, typecheck đạt. Lượt `npm run eval` trên cùng fork 61382536 có 10/10 lệnh sạch, 20/20 ca chặn đúng, 0 lỗi dịch vụ, số dư 47 → 47 mUSDC. Bốn dịch vụ Qwen, web, backend và demo trả HTTP 200. Người dùng đã cho làm Vòng 2 sớm và để việc nộp bài đến sau Vòng 2.

**Kết quả lượt demo Vòng 1 ban đầu.** Hai tab đã hiển thị trên Chrome. Bản build production và bộ 30 ca đánh giá đạt ở block nguồn 61382536. Qwen đã duyệt 10/10 lệnh sạch, các lớp kiểm tra chặn 20/20 đề xuất rủi ro, két giữ 50 mUSDC trong phép đo. Nhóm hóa đơn kiểm tra giao dịch đầu ra sau khi đọc tài liệu. Nếu làm tiếp phần dự thi, ưu tiên slide tiếng Việt và video 2–3 phút theo `../doc.md`. Phần thu giọng, xuất bản video, liên kết slide và nộp bài còn mở. Người dùng đã cho bắt đầu Vòng 2 sớm. Giữ toàn bộ thao tác demo trên Anvil theo lựa chọn của người dùng.

1. Ở gốc repo chạy `npm ci`, `npm run typecheck`, `npm test`. Chạy `forge build` trong `contracts/` trước khi chạy `npm run test:fork` từ gốc repo. Trên máy dự án, có thể đặt `ANVIL_BIN` thành đường dẫn tuyệt đối tới `../.aegis-tools/node_modules/@foundry-rs/anvil-win32-amd64/bin/anvil.exe`. Lệnh smoke dùng ví tạm và một model HTTP fixture.
2. Đã quan sát tại block Fuji `61380649`: thử chuyển 3 mUSDC trên fork làm số dư két 100 → 97 và MockPartner 0 → 3. Trong smoke test tích hợp, MCP đã trả qua x402: người nhận phí tăng đúng 5.000 đơn vị, két thử chuyển đúng 3 mUSDC, chữ ký thiếu bị từ chối với `InvalidSecurityClearance`. Đây là giao dịch trên Anvil; dùng giao dịch ở README cho bằng chứng triển khai công khai.
3. Người dùng chọn mô hình cục bộ và chỉ chạy giao dịch demo trên Anvil. Fuji là nguồn dữ liệu chỉ đọc. Qwen2.5-1.5B-Instruct Q4_K_M và llama.cpp b12572 đã cài ngoài repo. Để khởi động lại, dùng `npm run model:local` rồi `npm run test:fork:llm`. Lần chạy đạt có hash thanh toán Anvil `0xbc00ea57cf5d151b0b4aee135b0edaa7cfd748efc6c1fef7730825d13a1f5279` và hash thực thi Anvil `0x42fe331e3d2f793a8ceea5a1bb368a3faaab7a183a6efcd7a44e05863a59010b`. Ban đầu model ghi SAFE cho chênh lệch 7/3; mã đối chiếu ý định hiện chặn trường hợp đó trước khi ký.
4. Mở ba terminal ở thư mục repo. Chạy lần lượt `npm run model:local`, `npm run dev:demo` và `npm run dev:web` nếu dịch vụ tương ứng chưa chạy. Mở http://127.0.0.1:3000. Phiên demo mới tạo két Anvil có 50 mUSDC và agent tạm. Backend dùng cổng 4021, bộ điều khiển dùng 4022. Chạy `npm run eval` khi két rảnh. Lệnh `node backend/test/demo-controls.ts` thử hạn mức, whitelist, khóa/mở agent, từ chối lệnh thiếu chữ ký và hai biên nhận qua giao diện HTTP. Phép thử này chi 3 mUSDC từ két cục bộ và phí 0,005 mUSDC từ agent.
5. Giao dịch demo chỉ trên Anvil. Đọc biên nhận Anvil ngay trong phiên đang chạy. Explorer ở chân trang mở địa chỉ GuardVault công khai của Bước 1. Các biến môi trường có khóa chỉ lưu cục bộ. Trên máy khác cần chuẩn bị lại Node, Foundry, runtime và model theo README.

## Chuẩn bị quay video 2 phút 45 giây

Kiểm tra bàn giao trên máy ngày 20/11: giao diện production trả HTTP 200, có nút dùng địa chỉ ví, két còn 47 mUSDC sau phép thử có thực thi, agent đang hoạt động, hạn mức 10/25. Trong `contracts/`, lệnh PowerShell bên dưới chạy bộ hợp đồng bằng compiler có sẵn trên máy. Lần kiểm tra lại đạt 27/27.

```powershell
& ../../.aegis-tools/node_modules/@foundry-rs/forge-win32-amd64/bin/forge.exe test --offline --use ../../.aegis-tools/solc-0.8.30.exe
```

Mốc mã nguồn đã kiểm tra là `156bb12`. Production build, typecheck và 6/6 kiểm thử Node đạt. Kiểm thử MCP cuối cùng quan sát hash thanh toán Anvil `0x52c7886f08ac0f9b64e6f10c00064903db6a372ed8305908d0eb3322076d5102`, hash thực thi Anvil `0x03fa548ea9cfab5841ea3c092b47f7b9a0fff1e4dcde1425dac1e0d9304cc0f9`. Kiểm thử qua proxy của frontend cũng đạt sau khi cập nhật kịch bản hóa đơn và kiểm tra đúng lỗi `InvalidSecurityClearance`. Phiên giao diện đã chi thử 3 mUSDC. Muốn quay từ số dư 50, khởi động lại `dev:demo` và tải lại trang.

| Thời gian | Thao tác trên màn hình và lời thuyết minh |
| --- | --- |
| 0:00–0:25 | Mở Tx Firewall. “Khi giao tiền cho AI, làm sao biết giao dịch nó ký thực sự trả đúng người, đúng số tiền? AegisAVAX mô phỏng trước khi ký. Hợp đồng két kiểm tra thêm một lần ngay lúc chi.” |
| 0:25–0:55 | Mở AI Agent Sandbox, chỉ số dư đầu. Bấm chuyển 3 mUSDC. Mở hai biên nhận Anvil trong lịch sử. Chỉ rõ phí 0,005 mUSDC từ agent và 3 mUSDC từ két là hai khoản riêng. |
| 0:55–1:25 | Qua Tx Firewall, chọn phê duyệt vô hạn rồi mô phỏng. Chỉ vào cờ `UNLIMITED_APPROVAL`. Giải thích một approval có thể cấp quyền rộng dù số dư hiện tại chưa đổi. |
| 1:25–2:05 | Qua tab agent, bấm kiểm tra hóa đơn sai người nhận. Đọc ý định, số tiền đề xuất và lý do từ chối. Bấm kiểm tra lệnh thiếu chữ ký để cho thấy két từ chối ở lớp hợp đồng. Bấm Kill switch và chỉ trạng thái agent đã khóa. |
| 2:05–2:35 | Mở GuardVault trên Fuji Explorer bằng liên kết ở chân trang. Phân biệt địa chỉ triển khai thật và biên nhận demo cục bộ. Mở bảng 30 ca ở README, nói rõ phạm vi đo và số dư 50 → 50 trong lượt mô phỏng. |
| 2:35–2:45 | Hiện tên AegisAVAX và địa chỉ GitHub. “Bạn có thể chạy lại cả luồng này trên máy với Anvil và Qwen.” |

Chuẩn bị trước một tab README tại mục đánh giá và một tab hợp đồng công khai. Khi quay, giữ từng kết quả đủ lâu để đọc. Liên kết xem video và slide được bổ sung sau khi chủ dự án duyệt bản ghi và quyền chia sẻ.
