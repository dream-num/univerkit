import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { buildIframeProgram } from "./build.mjs";

test("builds current dependencies without old dist and removes stale runtime after a failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "html-runtime-build-"));
  const artifact = join(root, ".generated/iframe.js");
  try {
    await mkdir(join(root, "src/iframe"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "iframe-build-fixture", type: "module" }),
    );
    await writeFile(
      join(root, "src/iframe/entry.ts"),
      'import { value } from "./value"; globalThis.result = value;',
    );
    const dependency = join(root, "src/iframe/value.ts");
    await writeFile(dependency, "export const value: number = 1;");
    await buildIframeProgram(root);
    const first = await readFile(artifact, "utf8");
    const initial = {};
    runInNewContext(first, initial);
    assert.equal(initial.result, 1);

    await writeFile(dependency, "export const value: number = 2;");
    await buildIframeProgram(root);
    const second = await readFile(artifact, "utf8");
    const changed = {};
    runInNewContext(second, changed);
    assert.equal(changed.result, 2);
    assert.notEqual(second, first);

    await rm(dependency);
    await assert.rejects(buildIframeProgram(root));
    await assert.rejects(readFile(artifact), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a runtime that would require a separately deployed CSS asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "html-runtime-asset-"));
  try {
    await mkdir(join(root, "src/iframe"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "iframe-build-fixture", type: "module" }),
    );
    await writeFile(
      join(root, "src/iframe/entry.ts"),
      'import "./style.css"; globalThis.result = 1;',
    );
    await writeFile(join(root, "src/iframe/style.css"), "body { color: red; }");
    await assert.rejects(buildIframeProgram(root), /one self-contained script/);
    await assert.rejects(readFile(join(root, ".generated/iframe.js")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
