import { copyFile, readFile, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { dts } from "rolldown-plugin-dts";

// Keep SDK dependencies external: each consumer supplies its own Univer instance.
const external = (id) => !id.startsWith(".") && !isAbsolute(id) && !id.startsWith("\0");

export async function buildPackage(root = process.cwd()) {
  root = resolve(root);
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  await rm(join(root, "dist"), { recursive: true, force: true });
  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    const name = subpath === "." ? "index" : subpath.slice(2);
    const source = join(root, "src", `${name}.ts`);
    const boundary = {
      name: "package-source-boundary",
      moduleParsed({ id }) {
        if (!isAbsolute(id)) return;
        const path = relative(root, id.split("?")[0]);
        if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
          throw new Error(`${manifest.name} bundles source outside its package: ${id}`);
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
    await build({
      ...common,
      plugins: [boundary],
      build: {
        ...common.build,
        minify: "oxc",
        lib: {
          entry: source,
          formats: entry.require ? ["es", "cjs"] : ["es"],
          fileName: (format) => `${name}.${format === "cjs" ? "cjs" : "js"}`,
        },
        rolldownOptions: { external },
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
        lib: { entry: { [name]: source }, formats: ["es"] },
        rolldownOptions: { external, output: { entryFileNames: "[name].js" } },
      },
    });
    if (entry.require) {
      await copyFile(join(root, "dist", `${name}.d.ts`), join(root, "dist", `${name}.d.cts`));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildPackage();
}
