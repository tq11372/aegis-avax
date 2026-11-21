import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const out = new URL("../dist-live/", import.meta.url);
await mkdir(out, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ["app.js"],
  outdir: fileURLToPath(out),
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
  define: { "process.env.NODE_ENV": '"production"' },
});
for (const file of ["index.html", "style.css"])
  await copyFile(new URL(file, import.meta.url), new URL(file, out));
