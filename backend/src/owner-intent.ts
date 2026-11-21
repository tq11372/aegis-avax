import { type Address } from "viem";

export function ownerPayment(vault: Address, agent: Address, token: Address,
  recipient: Address, amount: bigint, nonce: bigint, validUntil: bigint) {
  return {
    domain: {name: "Aegis Payment Intent", version: "1", chainId: 43113, verifyingContract: vault},
    types: { Payment: [
      {name: "agent", type: "address"}, {name: "token", type: "address"},
      {name: "recipient", type: "address"}, {name: "amount", type: "uint256"},
      {name: "nonce", type: "uint256"}, {name: "validUntil", type: "uint256"},
    ]},
    primaryType: "Payment", message: {agent, token, recipient, amount, nonce, validUntil},
  } as const;
}
