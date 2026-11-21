import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import {
  HTTPFacilitatorClient,
  type FacilitatorClient,
} from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactEvmScheme as ServerScheme } from "@x402/evm/exact/server";
import { ExactEvmScheme as FacilitatorScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import {
  createWalletClient,
  getAddress,
  http,
  publicActions,
  type Hex,
  type TypedData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { fuji, rpc } from "./fuji.ts";

export const network = "eip155:43113";
export const paidPath = "/api/v1/agent/verify-tx";
export const payTo = getAddress(process.env.X402_PAY_TO || fuji.owner);
export const price = {
  amount: "5000",
  asset: fuji.token,
  extra: {
    name: "Aegis Mock USDC",
    version: "1",
    assetTransferMethod: "eip3009",
  },
};

export function facilitator(feeLimits?: {
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}): FacilitatorClient {
  if (process.env.X402_FACILITATOR_URL)
    return new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL });
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!key)
    return {
      getSupported: async () => ({
        kinds: [{ network, scheme: "exact", x402Version: 2 }],
        extensions: [],
        signers: {},
      }),
      verify: async () => {
        throw Error("Configure a Fuji facilitator");
      },
      settle: async () => {
        throw Error("Configure a Fuji facilitator");
      },
    };
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(rpc),
  }).extend(publicActions);
  const signer = toFacilitatorEvmSigner({
    address: account.address,
    getCode: (args) => wallet.getCode(args),
    readContract: (args) => wallet.readContract(args),
    verifyTypedData: (args) =>
      wallet.verifyTypedData({ ...args, types: args.types as TypedData }),
    writeContract: (args) => {
      if (
        getAddress(args.address) !== fuji.token ||
        args.functionName !== "transferWithAuthorization"
      )
        throw Error("Unsupported settlement");
      return wallet.writeContract({ ...args, ...feeLimits });
    },
    sendTransaction: async () => {
      throw Error("Only EIP-3009 settlement is enabled");
    },
    waitForTransactionReceipt: (args) => wallet.waitForTransactionReceipt(args),
  });
  const service = new x402Facilitator().register(
    network,
    new FacilitatorScheme(signer),
  );
  return {
    getSupported: async () => ({
      ...service.getSupported(),
      kinds: [{ network, scheme: "exact", x402Version: 2 }],
    }),
    verify: (payload, requirement) => service.verify(payload, requirement),
    settle: (payload, requirement) => service.settle(payload, requirement),
  };
}

export function paymentGate(client = facilitator()) {
  const server = new x402ResourceServer(client).register(
    network,
    new ServerScheme(),
  );
  return paymentMiddleware(
    {
      ["POST " + paidPath]: {
        accepts: { scheme: "exact", price, network, payTo },
        description: "Simulate and verify a Fuji transaction",
        mimeType: "application/json",
      },
    },
    server,
  );
}
