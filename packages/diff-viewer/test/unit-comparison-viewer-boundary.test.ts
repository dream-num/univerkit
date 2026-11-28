import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const comparisonRoot = resolve(import.meta.dirname, "../src");

describe("UnitComparisonViewer dependency boundary", () => {
  it("declares Univer SDK and React packages as peers without private workspace dependencies", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(comparisonRoot, "../package.json"), "utf8"),
    ) as {
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly devDependencies?: Readonly<Record<string, string>>;
      readonly peerDependencies?: Readonly<Record<string, string>>;
    };
    const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
    expect(
      runtimeDependencies.filter(
        (name) =>
          name.startsWith("@univerjs/") ||
          name.startsWith("@univerjs-pro/") ||
          name === "react" ||
          name === "react-dom",
      ),
    ).toEqual([]);

    const declaredDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };
    expect(Object.keys(declaredDependencies).filter((name) => name.startsWith("@univer/"))).toEqual(
      [],
    );
    expect(Object.values(declaredDependencies)).not.toContain("workspace:*");

    const styles = await readFile(resolve(comparisonRoot, "../styles.css"), "utf8");
    expect(styles).toContain('@source "./dist";');
  });

  it("keeps workflow, transport decoding, and host composition outside comparison", async () => {
    const sources = await readSources(comparisonRoot);
    const combined = sources.join("\n");
    expect(combined).not.toMatch(/(?:AppSnapshot|WorktreeControlClient|createUnitComparison)/u);
    expect(combined).not.toMatch(/@univer\/render-preset/u);
    expect(combined).not.toMatch(/@univer\/collab-gateway-contract/u);
    expect(combined).not.toMatch(/collab-web/u);
    expect(combined).not.toMatch(/decodeComparisonUnitData|createPreviewViewer/u);
    expect(combined).not.toMatch(/(?:sheetBlocks|changesets)/u);
    expect(combined).not.toContain("comparisonKey");
    const paneSource = await readFile(resolve(comparisonRoot, "native/comparison-pane.ts"), "utf8");
    expect(paneSource).not.toMatch(/\bsnapshot\b/u);
  });

  it("exposes only decoded UnitData, presentation inputs, and the narrow factory", async () => {
    const source = await readFile(resolve(comparisonRoot, "comparison-types.ts"), "utf8");
    expect(source).toContain("readonly unitData: TData | null");
    expect(source).toContain("readonly createUniver: UnitComparisonUniverFactory");
    expect(source).toContain("readonly leftHeaderControl?: ReactNode");
    expect(source).not.toContain("present:");
    expect(source).not.toContain("comparisonKey");
    expect(source).not.toMatch(/sheetBlocks|changesets/u);
  });
});

async function readSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents: string[] = [];
  for (const entry of entries) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) contents.push(...(await readSources(target)));
    else if (/\.(?:ts|tsx)$/u.test(entry.name)) contents.push(await readFile(target, "utf8"));
  }
  return contents;
}
