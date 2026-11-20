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
| Bước 3 · Demo và đánh giá | Chờ Bước 2 | `frontend/` gồm Tx Firewall và AI Agent Sandbox. `evals/` dành cho 25–30 kịch bản và số liệu đo được. |
| Vòng 2 | Chờ Vòng 1 | Avalanche L1 cho audit log và `extension/` MV3 theo điều kiện thời gian trong đề bài. |

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

1. Ở gốc repo chạy `npm ci`, `npm run typecheck`, `npm test`. Chạy `forge build` trong `contracts/` trước khi chạy `npm run test:fork` từ gốc repo. Trên máy dự án, có thể đặt `ANVIL_BIN` thành đường dẫn tuyệt đối tới `../.aegis-tools/node_modules/@foundry-rs/anvil-win32-amd64/bin/anvil.exe`. Lệnh smoke dùng ví tạm và một model HTTP fixture.
2. Đã quan sát tại block Fuji `61380649`: thử chuyển 3 mUSDC trên fork làm số dư két 100 → 97 và MockPartner 0 → 3. Trong smoke test tích hợp, MCP đã trả qua x402: người nhận phí tăng đúng 5.000 đơn vị, két thử chuyển đúng 3 mUSDC, chữ ký thiếu bị từ chối với `InvalidSecurityClearance`. Đây là giao dịch trên Anvil; dùng giao dịch ở README cho bằng chứng triển khai công khai.
3. Người dùng chọn mô hình cục bộ và chỉ chạy giao dịch demo trên Anvil. Fuji là nguồn dữ liệu chỉ đọc. Qwen2.5-1.5B-Instruct Q4_K_M và llama.cpp b12572 đã cài ngoài repo. Để khởi động lại, dùng `npm run model:local` rồi `npm run test:fork:llm`. Lần chạy đạt có hash thanh toán Anvil `0xbc00ea57cf5d151b0b4aee135b0edaa7cfd748efc6c1fef7730825d13a1f5279` và hash thực thi Anvil `0x42fe331e3d2f793a8ceea5a1bb368a3faaab7a183a6efcd7a44e05863a59010b`. Ban đầu model ghi SAFE cho chênh lệch 7/3; mã đối chiếu ý định hiện chặn trường hợp đó trước khi ký.
4. Sau khi khép lại Bước 2, chuyển sang giao diện ở `frontend/` và bộ đánh giá ở `evals/`. Các biến môi trường có khóa chỉ lưu cục bộ.
