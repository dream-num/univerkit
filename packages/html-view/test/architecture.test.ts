import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

it("keeps host and iframe implementations separate, sharing only neutral modules", () => {
  const violations: string[] = [];
  for (const side of ["host", "iframe", "shared"]) {
    const folder = resolve(sourceRoot, side);
    for (const name of readdirSync(folder).filter((name) => name.endsWith(".ts"))) {
      const path = resolve(folder, name);
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const check = (node: ts.Node) => {
        const specifier =
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
            ? node.moduleSpecifier
            : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? node.arguments[0]
              : undefined;
        if (specifier && ts.isStringLiteral(specifier)) {
          const value = specifier.text;
          if (value.startsWith(".")) {
            const target = relative(sourceRoot, resolve(dirname(path), value));
            const allowed = target.startsWith(`${side}/`) || target.startsWith("shared/");
            // Host embeds the built iframe program as inert text, never imports its implementation.
            const embedded =
              side === "host" && name === "render.ts" && target === "../.generated/iframe.js?raw";
            if (!allowed && !embedded) violations.push(`${side}/${name} → ${value}`);
          } else if (
            (side === "iframe" || side === "shared") &&
            value !== "@univerkit/html-view-parser"
          ) {
            const typeOnly = ts.isImportDeclaration(node) && node.importClause?.isTypeOnly;
            if (!typeOnly) violations.push(`${side}/${name} executes external dependency ${value}`);
          }
        }
        ts.forEachChild(node, check);
      };
      check(source);
    }
  }
  expect(violations).toEqual([]);
});
