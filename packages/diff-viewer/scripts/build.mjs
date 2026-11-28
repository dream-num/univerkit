import { rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { dts } from "rolldown-plugin-dts";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

// Keep SDK, React, and runtime dependencies external: consumers supply their own instances.
const external = (id) => !id.startsWith(".") && !isAbsolute(id) && !id.startsWith("\0");

export async function buildComparisonViewer(root = packageRoot) {
  root = resolve(root);
  const entry = join(root, "src", "index.ts");
  const boundary = {
    name: "package-source-boundary",
    moduleParsed({ id }) {
      if (!isAbsolute(id)) return;
      const path = relative(root, id.split("?")[0]);
      if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
        throw new Error(`@univerkit/diff-viewer bundles source outside its package: ${id}`);
      }
    },
  };
  const common = {
    root,
    configFile: false,
    envDir: false,
    logLevel: "warn",
    build: {
      copyPublicDir: false,
      emptyOutDir: false,
      outDir: join(root, "dist"),
      sourcemap: false,
      target: "es2022",
    },
  };

  await rm(join(root, "dist"), { recursive: true, force: true });

  await build({
    ...common,
    plugins: [boundary],
    build: {
      ...common.build,
      minify: "oxc",
      lib: {
        entry,
        formats: ["es"],
        fileName: () => "index.js",
      },
      rolldownOptions: {
        external,
        output: {
          chunkFileNames: "chunks/[name]-[hash].js",
        },
      },
    },
  });

  await build({
    ...common,
    plugins: [
      boundary,
      dts({
        cwd: root,
        tsconfig: "tsconfig.build.json",
        emitDtsOnly: true,
        generator: "oxc",
        sourcemap: false,
        compilerOptions: { declarationMap: false, sourceMap: false, removeComments: true },
      }),
    ],
    oxc: { exclude: [/\.js$/u, /\.d\.[cm]?ts$/u] },
    build: {
      ...common.build,
      minify: false,
      lib: { entry: { index: entry }, formats: ["es"] },
      rolldownOptions: { external, output: { entryFileNames: "[name].js" } },
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildComparisonViewer();
}
