import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createWalletClient,
  createTestClient,
  getAddress,
  erc20Abi,
  parseAbi,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { avalancheFuji } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { connect, fuji } from "../src/fuji.ts";

export async function seed(sandbox: ReturnType<typeof connect>) {
  const local = sandbox.transport.url;
  assert.ok(local && new URL(local).hostname === "127.0.0.1");
  const dev = createTestClient({
    chain: avalancheFuji,
    mode: "anvil",
    transport: http(local),
  });
  await dev.setAutomine(true);
  const keys = {
    relayer: generatePrivateKey(),
    agent: generatePrivateKey(),
    signer: generatePrivateKey(),
  };
  const account = privateKeyToAccount(keys.relayer),
    agent = privateKeyToAccount(keys.agent);
  const wallet = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(local),
  });
  await dev.setBalance({ address: account.address, value: 10n ** 18n });
  await dev.setBalance({ address: agent.address, value: 10n ** 18n });
  const receipt = (hash: Hex) =>
    sandbox.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  async function deploy(name: string, args: readonly unknown[]) {
    const artifact = JSON.parse(
      await readFile(
        new URL(
          "../../contracts/out/" + name + ".sol/" + name + ".json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const res = await receipt(
      await wallet.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
        args,
      }),
    );
    assert.equal(res.status, "success");
    return getAddress(res.contractAddress!);
  }
  async function write(
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    sender = account,
  ) {
    const hash = await wallet.writeContract({
      address,
      abi,
      functionName,
      args,
      account: sender,
    });
    assert.equal((await receipt(hash)).status, "success");
    return hash;
  }
  const policy = await deploy("PolicyModule", [
    account.address,
    fuji.token,
    10_000_000n,
    25_000_000n,
  ]);
  const vault = await deploy("GuardVault", [
    account.address,
    policy,
    privateKeyToAccount(keys.signer).address,
  ]);
  await write(
    policy,
    parseAbi(["function setTargetAllowed(address,bool)"]),
    "setTargetAllowed",
    [fuji.partner, true],
  );
  await write(vault, parseAbi(["function grantAgent(address)"]), "grantAgent", [
    agent.address,
  ]);
  await write(fuji.token, parseAbi(["function faucet()"]), "faucet", [], agent);
  await write(fuji.token, erc20Abi, "transfer", [vault, 50_000_000n], agent);
  return { keys, agent, vault, policy, local, write, receipt };
}
