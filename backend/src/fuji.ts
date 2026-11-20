import {
  createPublicClient,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { avalancheFuji } from "viem/chains";
import { z } from "zod";

export const fuji = {
  token: getAddress("0x7620FaBA82e05bBb889f80F3E20429A81f2e7113"),
  vault: getAddress(
    process.env.GUARD_VAULT_ADDRESS ||
      "0x4d0DA228a21F02c83ee3aF70E6702a489cD1019F",
  ),
  partner: getAddress("0x1C552a98A274FFc69230816b2Bf892543E1c9ee8"),
  flagged: getAddress("0xaD1873680DcE93CF40C1F2c72f7002b5E50134c9"),
  policy: getAddress(process.env.POLICY_MODULE_ADDRESS || "0x3b271117E6AC5e243686Bc61771CbC5C7F8Db436"),
  registry: getAddress("0x262289744140ccC1923F49cf9D01D3573bd2fCe2"),
  owner: getAddress("0xA233579CAee3BCF9dE050e66b75FfF06A6EB6270"),
};
export const rpc =
  process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
export const connect = (url: string) =>
  createPublicClient({
    chain: avalancheFuji,
    transport: http(url, { timeout: 12000, retryCount: 1 }),
    cacheTime: 0,
  });
export const vaultAbi = parseAbi([
  "function signer() view returns (address)",
  "function agent() view returns (address)",
  "function nonce() view returns (uint256)",
  "function paused() view returns (bool)",
  "function spentInWindow() view returns (uint256)",
  "function execute(address target, bytes data, uint256 value, uint256 deadline, bytes signature)",
  "error InvalidSecurityClearance()",
]);
export const policyAbi = parseAbi([
  "function targetWhitelist(address) view returns (bool)",
  "function check(address,address,uint256,uint256) view",
]);
export const registryAbi = parseAbi([
  "function isFlagged(address) view returns (bool)",
]);
export const assetAbi = [
  ...erc20Abi,
  ...parseAbi([
    "function setApprovalForAll(address operator,bool approved)",
    "event ApprovalForAll(address indexed owner,address indexed operator,bool approved)",
  ]),
] as const;
const address = z
  .string()
  .refine((v) => isAddress(v), "Invalid EVM address")
  .transform((v) => getAddress(v));
export const scanFields = {
  from: address,
  to: address,
  data: z
    .string()
    .max(16386)
    .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
    .transform((v) => v as Hex),
  value: z
    .string()
    .max(78)
    .regex(/^(0|[1-9][0-9]*)$/)
    .refine((v) => BigInt(v) < 2n ** 256n)
    .default("0"),
  userIntent: z.string().trim().min(1).max(800),
  knownRecipients: z.array(address).max(32).default([]),
  // Optional user expectation, expressed in base units of the output ERC-20.
  minOutput: z
    .object({
      token: address,
      amount: z
        .string()
        .max(78)
        .regex(/^[1-9][0-9]*$/),
    })
    .optional(),
};
export const scanSchema = z.object(scanFields).strict();
export type Scan = z.infer<typeof scanSchema>;
export type Balance = {
  asset: Address | "AVAX";
  account: Address;
  before: string;
  after: string;
};
export type Movement = {
  name: "Transfer" | "Approval" | "ApprovalForAll";
  asset: Address;
  from: Address;
  to: Address;
  amount: string;
};
export type Simulation = {
  block: string;
  blockHash: Hex;
  reverted: boolean;
  result: Hex;
  balances: Balance[];
  events: Movement[];
};
export const isSame = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
