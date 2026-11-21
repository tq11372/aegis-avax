# Tra cứu ba biên nhận Aegis Audit

Aegis Audit là Avalanche L1 testnet có EVM chain ID **99321**. RPC trực tiếp của validator chạy trên máy đội. Trang này lưu ba header và biên nhận ở block 1–3 để giám khảo có thể mở từ GitHub cả khi máy đội tắt. [Đăng ký blockchain trên Avalanche](https://data-api.avax.network/v1/networks/fuji/blockchains/2NLmJSAC471YuC8Eyiyjp7FtrEdMuFWXeL2guuFKH2CyUm5NmF) · [Chuyển đổi trên Fuji P-Chain](https://build.avax.network/explorer/fuji/p-chain/tx/2FH3dGE7o2mz6VscxVvqUY5iwgeiNio7r1TG8ErHVYTGTBQbGR)

| Block | Thao tác | Hash và biên nhận gốc | Gas đã dùng |
| ---: | --- | --- | ---: |
| 1 | Triển khai ThreatAuditLog | [`0x2c9742c6a2…08d7b4`](https://github.com/tq11372/aegis-avax/blob/main/docs/l1-receipts.json#L55) | 325049 |
| 2 | Cấp quyền reporter | [`0x85b1f6530f…31841c`](https://github.com/tq11372/aegis-avax/blob/main/docs/l1-receipts.json#L119) | 47796 |
| 3 | Ghi sự kiện ThreatLogged | [`0x87a69ddfe6…e7db7d`](https://github.com/tq11372/aegis-avax/blob/main/docs/l1-receipts.json#L184) | 49529 |

Hợp đồng nhật ký ở `0x7620FaBA82e05bBb889f80F3E20429A81f2e7113` trên chain 99321. Sự kiện ở block 3 và sự kiện gốc trên Fuji có cùng ID, cùng `riskHash` và mức 2 (CRITICAL). [Biên nhận nguồn trên Fuji](https://testnet.snowtrace.io/tx/0xdbe110f7f8080a53b1ab157633eebf01a26f70c36d84cf39d7fd5df1896be59c) · [Snapshot RPC](l1-receipts.json) · [Manifest của lượt triển khai](aegis-l1-proof.json)

## Tự kiểm tra

Từ thư mục gốc, chạy `npm ci` rồi `npm run check:l1`. Mỗi block trong snapshot có đúng một giao dịch loại 2. Script mã hóa lại từng biên nhận, tính gốc cây biên nhận Ethereum và so với `receiptsRoot` trong header tương ứng. Nó kiểm liên kết giữa ba header, kết quả triển khai, quyền reporter và nội dung sự kiện trên hai chain. CI chạy phép kiểm tra offline này.

Chạy `npm run check:l1 -- --online` để đọc thêm đăng ký blockchain từ Avalanche Data API và sự kiện nguồn từ Fuji C-Chain. Việc khớp gốc biên nhận chứng minh bản lưu nhất quán với các header đội cung cấp. Sổ đăng ký P-Chain xác nhận blockchain được đăng ký. Muốn xác nhận độc lập các header EVM hoặc trạng thái mới nhất cần một node đồng bộ chain 99321. [Mã kiểm tra](../backend/scripts/check-l1-receipts.ts)
