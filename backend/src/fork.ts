import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { connect, rpc } from "./fuji.ts";

export async function withFork<T>(
  work: (client: ReturnType<typeof connect>, block: bigint) => Promise<T>,
) {
  const upstream = connect(rpc);
  if ((await upstream.getChainId()) !== 43113)
    throw Error("Expected Avalanche Fuji");
  const head = await upstream.getBlock();
  const child = spawn(
    process.env.ANVIL_BIN || "anvil",
    [
      "--fork-url",
      rpc,
      "--fork-block-number",
      String(head.number),
      "--host",
      "127.0.0.1",
      "--port",
      "0",
      "--accounts",
      "0",
      "--no-mining",
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Anvil startup timeout")),
        30000,
      );
      const done = () => clearTimeout(timer);
      child.once("error", (e) => {
        done();
        reject(e);
      });
      child.once("exit", () => {
        done();
        reject(Error("Anvil exited"));
      });
      lines.on("line", (line) => {
        const match = line.match(/Listening on 127\.0\.0\.1:(\d+)/);
        if (match) {
          done();
          resolve(Number(match[1]));
        }
      });
    });
    const fork = connect("http://127.0.0.1:" + port);
    const tip = await fork.getBlock();
    if (tip.number !== head.number || tip.hash !== head.hash)
      throw Error("Fork head mismatch");
    return await work(fork, head.number);
  } finally {
    lines.close();
    child.kill();
  }
}

export async function withReadOnlyFork<T>(
  work: (client: ReturnType<typeof connect>, block: bigint) => Promise<T>,
) {
  try {
    const host = new URL(rpc).hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      const local = connect(rpc);
      if ((await local.getChainId()) === 43113) {
        const head = await local.getBlock();
        return await work(local, head.number);
      }
    }
  } catch {
    /* Fall back to spawning an isolated Anvil fork process. */
  }
  return withFork(work);
}
