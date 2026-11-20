# AegisAVAX
AegisAVAX • Team1 Vietnam UniHack 2026. Mục tiêu của dự án là mô phỏng giao dịch trước khi ký và dùng hợp đồng thông minh để giới hạn quyền chi tiêu của AI agent trên Avalanche Fuji.

Bảy hợp đồng đã triển khai và xác minh trên **Avalanche Fuji C-Chain**. [Địa chỉ, giao dịch và bằng chứng xác minh](#verified-contract-addresses)

## What it does

Bước 1 triển khai két `GuardVault` và bộ quy tắc `PolicyModule`. Chủ két nạp token bằng ERC-20 transfer, cấp session key và chọn người nhận. Agent chỉ được chuyển token thanh toán đã duyệt. Két đọc địa chỉ người nhận và số tiền trực tiếp từ calldata, kiểm tra hạn mức rồi xác thực chữ ký EIP-712 trước khi chuyển. Hạn mức ngày tính trên 24 giờ gần nhất và tiếp tục áp dụng khi đổi session key.

| Thành phần | Vai trò trong bản thử nghiệm |
| --- | --- |
| GuardVault, PolicyModule | Hạn mức mặc định 10 mUSDC/lệnh và 25 mUSDC/24 giờ. Chỉ chủ két được rút AVAX hoặc token. Chủ két có thể thu hồi agent hoặc tạm dừng két. |
| MockUSDC | Token 6 chữ số thập phân, faucet 100 mUSDC/lần. Hỗ trợ chuyển, nhận và hủy ủy quyền EIP-3009. |
| MockPartner, MockDrainer | Hai địa chỉ mẫu để phân biệt người nhận được phép và địa chỉ bị gắn cờ. MockDrainer chỉ đóng vai địa chỉ thử nghiệm. |
| ScamRegistry, ThreatAuditLog | Chủ registry quản lý cờ rủi ro. Reporter được cấp quyền ghi hash bằng chứng và mã giao dịch vào event; mỗi mã chỉ ghi một lần. |

**Vì sao kiểm tra on-chain?** Nếu agent đề xuất sai người nhận hoặc số tiền, hợp đồng có thể từ chối ngay cả khi agent có session key hợp lệ. Thu hồi quyền có hiệu lực từ lúc giao dịch thu hồi được mạng xác nhận.

**Vì sao chọn Avalanche?** Fuji C-Chain cho phép thử cùng một luồng ký, thực thi EVM và kiểm tra biên nhận trên explorer bằng AVAX testnet. Độ trễ thu hồi quyền trên Fuji cần được đo trong bản demo.

**Mô hình sử dụng.** Thiết kế dành cho cá nhân kiểm tra miễn phí và dịch vụ x402 thu 0,005 USDC/lần kiểm tra của agent. Bước 1 kiểm thử lớp ủy quyền thanh toán với 5.000 đơn vị mUSDC. API thu phí, trình mô phỏng và giao diện thuộc các bước sau. Phạm vi demo là testnet, dùng token thử nghiệm.

## How to run

Cần Node.js/npm và Foundry (`forge`, `cast`). Tại thư mục gốc của repo, chạy:

```sh
cd contracts
npm ci
forge test -vv
```

Foundry dùng Solidity 0.8.30, EVM Cancun và OpenZeppelin Contracts 5.6.1. Lần biên dịch đầu tiên cần tải solc. Có thể dùng `forge test -vv --use <đường-dẫn-solc-0.8.30>` với compiler cài sẵn.

| Bộ kiểm thử | Kết quả trên máy |
| --- | --- |
| GuardVault | 20/20, gồm 256 lần fuzz cho số tiền giao dịch |
| MockUSDC | 5/5 |
| ScamRegistry và ThreatAuditLog | 2/2 |
| Diễn tập DeployFuji trên Anvil | 7 hợp đồng có bytecode, 13/13 giao dịch có biên nhận thành công |

### Tích hợp chữ ký

Két dùng domain EIP-712 có `name = AegisAVAX GuardVault`, `version = 1`, chain ID của mạng và `verifyingContract` là địa chỉ két. Backend đọc `agent()` và `nonce()` ngay trước khi ký. Trong struct bên dưới, `target` là địa chỉ hợp đồng mUSDC. Người nhận được mã hóa trong calldata của `transfer(recipient, amount)`. `value` bằng 0, `deadline` tính bằng giây Unix.

```text
SecurityClearance(address vault,address agent,address target,bytes32 calldataHash,uint256 value,uint256 nonce,uint256 deadline)
```

Sau khi nhận chữ ký, session key gọi `execute(target, data, 0, deadline, signature)`. Hợp đồng tự tính `keccak256(data)` và tiêu thụ nonce khi giao dịch thành công. Backend có thể đối chiếu digest bằng `clearanceDigest(...)`. MockUSDC có domain riêng với tên `Aegis Mock USDC`, phiên bản `1` và địa chỉ token.

### Triển khai trên Fuji

Chuẩn bị ba địa chỉ riêng cho chủ két, backend ký clearance và agent. Chủ két cần AVAX testnet để trả gas. Từ thư mục `contracts`, nhập khóa của ví triển khai vào keystore mã hóa qua prompt của Foundry:

```powershell
cast wallet import aegis-fuji --interactive
$env:DEPLOYER_ADDRESS = (cast wallet address --account aegis-fuji).Trim()
$env:AEGIS_SIGNER_ADDRESS = Read-Host 'Địa chỉ công khai của backend signer'
$env:AGENT_ADDRESS = Read-Host 'Địa chỉ công khai của agent'
$env:FUJI_RPC_URL = 'https://api.avax-test.network/ext/bc/C/rpc'
cast chain-id --rpc-url $env:FUJI_RPC_URL
```

Kiểm tra kết quả là `43113`. Chạy mô phỏng để xem ước tính gas, sau đó gửi giao dịch và yêu cầu xác minh mã nguồn:

```powershell
forge script script/DeployFuji.s.sol:DeployFuji --rpc-url $env:FUJI_RPC_URL --sender $env:DEPLOYER_ADDRESS
forge script script/DeployFuji.s.sol:DeployFuji --rpc-url $env:FUJI_RPC_URL --sender $env:DEPLOYER_ADDRESS --account aegis-fuji --broadcast --verify --verifier custom --verifier-url https://build.avax.network/api/verify/43113/api
```

Script tạo bảy hợp đồng, cấu hình whitelist, đánh dấu địa chỉ mẫu, cấp quyền reporter và agent, rồi nạp 100 mUSDC vào két. Sau khi gửi thật lên Fuji, dùng manifest của **chính lần chạy đó** để lấy địa chỉ:

```powershell
$run = Get-Content -Raw broadcast/DeployFuji.s.sol/43113/run-latest.json | ConvertFrom-Json
$run.transactions | Where-Object transactionType -eq 'CREATE' | Select-Object contractName,contractAddress,hash
```

Nếu các giao dịch đã xác nhận nhưng bước xác minh bị gián đoạn, chạy `forge build --build-info` với cùng cấu hình. Trên trang địa chỉ từng hợp đồng, chọn **Contract → Verify contract**, tải build-info trong `out/build-info/` và chọn đúng tên contract. [Hướng dẫn xác minh của Avalanche](https://build.avax.network/docs/tooling/contract-verification)

## Verified Contract Addresses

Ngày 20/11/2026, Fuji (chain ID `43113`) xác nhận 13 giao dịch từ block `61380106` đến `61380179`. Bảy hợp đồng có kết quả xác minh bytecode `exact_match`. Tổng phí của cả lượt triển khai và cấu hình là **0,00000000070361181 AVAX testnet**.

| Hợp đồng | Địa chỉ trên Fuji | Xác minh | Biên nhận |
| --- | --- | --- | --- |
| GuardVault | [`0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F`](https://testnet.snowtrace.io/address/0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F) | [Sourcify](https://repo.sourcify.dev/43113/0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F) | [Giao dịch tạo](https://testnet.snowtrace.io/tx/0xade098b6607a5176434abd93a837568d7928f4b21dffef8e7c924f9d4ec79097) |
| PolicyModule | [`0x3b271117E6AC5e243686Bc61771CbC5C7F8Db436`](https://testnet.snowtrace.io/address/0x3b271117E6AC5e243686Bc61771CbC5C7F8Db436) | [Avalanche Builder Hub](https://build.avax.network/api/verify/sourcify/v2/contract/43113/0x3b271117E6AC5e243686Bc61771CbC5C7F8Db436) | [Giao dịch tạo](https://testnet.snowtrace.io/tx/0x5557f876209c4631d5d62974697f9dae858f39c005dfe8b869b6deeef0ab184e) |
| MockUSDC | [`0x7620FaBA82e05bBb889f80F3E20429A81f2e7113`](https://testnet.snowtrace.io/address/0x7620FaBA82e05bBb889f80F3E20429A81f2e7113) | [Sourcify](https://repo.sourcify.dev/43113/0x7620FaBA82e05bBb889f80F3E20429A81f2e7113) | [Giao dịch tạo](https://testnet.snowtrace.io/tx/0x34eec2a19458ee02bba32ff71a4b149378c272bbcdb732a392386eec8d7a827b) |
| MockPartner | [`0x1C552a98A274FFc69230816b2Bf892543E1c9ee8`](https://testnet.snowtrace.io/address/0x1C552a98A274FFc69230816b2Bf892543E1c9ee8) | [Avalanche Builder Hub](https://build.avax.network/api/verify/sourcify/v2/contract/43113/0x1C552a98A274FFc69230816b2Bf892543E1c9ee8) | [Giao dịch tạo](https://testnet.snowtrace.io/tx/0x1f3496d3b1fbf5cda5b3644c66bfd8243cc4665895cd4af68901e1495f20b7af) |
| MockDrainer | [`0xaD1873680DcE93CF40C1F2c72f7002b5E50134c9`](https://testnet.snowtrace.io/address/0xaD1873680DcE93CF40C1F2c72f7002b5E50134c9) | [Avalanche Builder Hub](https://build.avax.network/api/verify/sourcify/v2/contract/43113/0xaD1873680DcE93CF40C1F2c72f7002b5E50134c9) | [Giao dịch tạo](https://testnet.snowtrace.io/tx/0xf873244a887655f62eeb7fd63dedc88150668a110af0acd4912f4379964f80b6) |
| ScamRegistry | [`0x262289744140ccC1923F49cf9D01D3573bd2fCe2`](https://testnet.snowtrace.io/address/0x262289744140ccC1923F49cf9D01D3573bd2fCe2) | [Avalanche Builder Hub](https://build.avax.network/api/verify/sourcify/v2/contract/43113/0x262289744140ccC1923F49cf9D01D3573bd2fCe2) | [Giao dịch tạo](https://testnet.snowtrace.io/tx/0x85cd067faefafc0f7a3cd44aacc1583b2e9eb152eb05dfb2b25ab3abefbf2e67) |
| ThreatAuditLog | [`0x1c755dE79A9bFd54Cf0c559C97FfeDC58BF1Fec6`](https://testnet.snowtrace.io/address/0x1c755dE79A9bFd54Cf0c559C97FfeDC58BF1Fec6) | [Avalanche Builder Hub](https://build.avax.network/api/verify/sourcify/v2/contract/43113/0x1c755dE79A9bFd54Cf0c559C97FfeDC58BF1Fec6) | [Giao dịch tạo](https://testnet.snowtrace.io/tx/0xe80d998b763eac04d524baf4af711a7469955d68aeca2b106f364769154eefb1) |

Tại block `61380210`, két giữ **100 mUSDC**, đang hoạt động và yêu cầu chữ ký clearance. Hạn mức là **10 mUSDC/giao dịch** và **25 mUSDC/24 giờ**. MockPartner nằm trong danh sách người nhận được phép. MockDrainer đã được gắn cờ và không có quyền nhận từ agent. [Biên nhận nạp két](https://testnet.snowtrace.io/tx/0x99e3a10babd08e6c17ffbb43021956e12426bb25347b686e0078221ea4cf231f)
