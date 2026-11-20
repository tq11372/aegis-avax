import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const model = process.env.LLM_GGUF_PATH;
if (!model || !existsSync(model))
  throw Error("Set LLM_GGUF_PATH to your downloaded GGUF file in .env");
const url = new URL(process.env.LLM_BASE_URL || "http://127.0.0.1:8091/v1");
if (url.hostname !== "127.0.0.1" || !url.port)
  throw Error("Select a loopback endpoint with an explicit port");
const child = spawn(
  process.env.LLAMA_SERVER_BIN || "llama-server",
  [
    "-m",
    model,
    "--alias",
    process.env.LLM_MODEL || "aegis-local",
    "--host",
    "127.0.0.1",
    "--port",
    url.port,
    "--ctx-size",
    "4096",
    "--parallel",
    "1",
    "--n-gpu-layers",
    "0",
    "--threads",
    "4",
  ],
  { windowsHide: true, stdio: "inherit" },
);
child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.once("SIGINT", () => child.kill());
process.once("SIGTERM", () => child.kill());
