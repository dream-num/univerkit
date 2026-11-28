import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { buildPackage } from "../../../scripts/package-build.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

/** Produce the complete iframe program before the host imports it as text. */
export async function buildIframeProgram(root = packageRoot) {
  const generated = join(root, ".generated");
  // A failed build must not leave a previous runtime available for the host build.
  await rm(generated, { recursive: true, force: true });
  const result = await build({
    root,
    configFile: false,
    envDir: false,
    logLevel: "warn",
    build: {
      write: false,
      copyPublicDir: false,
      sourcemap: false,
      target: "es2022",
      minify: "oxc",
      // Bundle dependencies here: the sandbox cannot resolve npm imports.
      lib: { entry: join(root, "src/iframe/entry.ts"), formats: ["iife"], name: "HtmlViewIframe" },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
  const [chunk] = outputs;
  if (
    outputs.length !== 1 ||
    chunk?.type !== "chunk" ||
    !chunk.code ||
    chunk.imports.length ||
    chunk.dynamicImports.length ||
    (chunk.referencedFiles?.length ?? 0)
  ) {
    throw new Error("HTML runtime must be one self-contained script without imports or assets.");
  }
  await mkdir(generated, { recursive: true });
  await writeFile(join(generated, "iframe.js"), chunk.code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--iframe-only")) {
    throw new Error("Usage: node scripts/build.mjs [--iframe-only]");
  }
  const iframeOnly = args[0] === "--iframe-only";
  if (!iframeOnly) await rm(join(packageRoot, "dist"), { recursive: true, force: true });
  await buildIframeProgram();
  if (!iframeOnly) await buildPackage(packageRoot);
}
