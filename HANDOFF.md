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
| Bước 2 · Backend và MCP | Đang triển khai | Bắt đầu với mô phỏng chỉ đọc trên Anvil fork và kiểm thử state diff trước khi nối dịch vụ ký hoặc thanh toán. |
| Bước 3 · Demo và đánh giá | Chờ Bước 2 | `frontend/` gồm Tx Firewall và AI Agent Sandbox. `evals/` dành cho 25–30 kịch bản và số liệu đo được. |
| Vòng 2 | Chờ Vòng 1 | Avalanche L1 cho audit log và `extension/` MV3 theo điều kiện thời gian trong đề bài. |

## Quyết định cần giữ

- Bố cục của repo gồm `contracts/`, `backend/`, `mcp-server/`, `frontend/`, `evals/`, `extension/`. Tạo thư mục khi bắt đầu phần tương ứng.
- Chuỗi Fuji 43113, token demo mUSDC 6 chữ số thập phân, Solidity 0.8.30, Cancun, OpenZeppelin 5.6.1. MockDrainer là địa chỉ mẫu thụ động đã gắn cờ.
- GuardVault chỉ hỗ trợ ERC-20 transfer của token thanh toán. Chữ ký ràng buộc vault, agent, target (token), hash calldata, value, nonce, deadline. Đọc nonce và quyền hiện hành trước khi ký. Mô phỏng trả phí dự kiến 5.000 đơn vị mUSDC qua x402.
- Hạn khóa tính năng 17:00 ngày 21/11/2026 (GMT+7). Mục tiêu nộp 22:30, hạn cuối 23:59 cùng ngày. Chỉ ghi hash, địa chỉ, kết quả và thời gian đã quan sát thực tế.

## Cách cập nhật

Sau mỗi mốc hoặc trước khi dừng, cập nhật bảng trên cùng mục tiếp tục bên dưới. Ghi lệnh đã chạy, kết quả, lỗi còn mở và việc cần làm ngay sau đó. Đẩy bản bàn giao cùng mã đã kiểm thử lên GitHub. Khi mất phiên giữa chừng, đối chiếu bảng với working tree trước khi làm tiếp.

## Tiếp tục từ đây

Bắt đầu Bước 2 trong `backend/`. Cần kiểm tra giao dịch sạch 3 mUSDC từ két đến MockPartner trên bản fork, chứng minh số dư trước/sau và xác nhận RPC Fuji không thay đổi. Tiếp theo là năm luật rủi ro, đối chiếu ý định, xác minh thanh toán, ký clearance và tool MCP. Tách rõ phép thử local/fork với biên nhận từ Fuji công khai.
