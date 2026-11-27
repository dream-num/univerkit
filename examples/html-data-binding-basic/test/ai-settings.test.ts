import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, expect, it } from "vitest";
import { createAiSettings } from "../server/ai-settings.js";

const dirs: string[] = [];
function envFile() {
  const dir = mkdtempSync(join(tmpdir(), "binding-ai-settings-"));
  dirs.push(dir);
  return join(dir, ".env");
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

it("saves to .env, takes effect immediately and reloads replacement and cleared keys", () => {
  const path = envFile();
  const environment = { DEEPSEEK_API_KEY: "environment-key" };
  const settings = createAiSettings(path, environment);
  expect(settings.getApiKey()).toBe("environment-key");
  settings.setApiKey(" first-key ");
  expect(environment.DEEPSEEK_API_KEY).toBe("first-key");
  settings.setApiKey("replacement-key");
  expect(parseEnv(readFileSync(path, "utf8")).DEEPSEEK_API_KEY).toBe("replacement-key");
  const restarted = createAiSettings(path, { DEEPSEEK_API_KEY: "old-process-key" });
  expect(restarted.getApiKey()).toBe("replacement-key");
  restarted.setApiKey("");
  expect(restarted.getApiKey()).toBe("");
  expect(createAiSettings(path, { DEEPSEEK_API_KEY: "old-process-key" }).getApiKey()).toBe("");
});

it("preserves other settings and CRLF while replacing duplicate key assignments", () => {
  const path = envFile();
  const prefix = '# Example\r\nPORT=3030\r\nOTHER="keep # this"\r\n';
  writeFileSync(
    path,
    prefix + 'export DEEPSEEK_API_KEY = "old" # key\r\nDEEPSEEK_API_KEY=duplicate\r\n',
  );
  const settings = createAiSettings(path, {});
  settings.setApiKey("sk-literal#+/=");
  const saved = readFileSync(path, "utf8");
  expect(saved).toBe(
    prefix + 'DEEPSEEK_API_KEY="sk-literal#+/="\r\nDEEPSEEK_API_KEY="sk-literal#+/="\r\n',
  );
  expect(parseEnv(saved)).toEqual({
    PORT: "3030",
    OTHER: "keep # this",
    DEEPSEEK_API_KEY: "sk-literal#+/=",
  });
});

it("appends the key without changing comments or newer edits to other settings", () => {
  const path = envFile();
  writeFileSync(path, "# DEEPSEEK_API_KEY=\nPORT=3030");
  const settings = createAiSettings(path, {});
  writeFileSync(path, "# DEEPSEEK_API_KEY=\nPORT=4040");
  settings.setApiKey("new-key");
  expect(readFileSync(path, "utf8")).toBe(
    '# DEEPSEEK_API_KEY=\nPORT=4040\nDEEPSEEK_API_KEY="new-key"\n',
  );
});

it("rejects injected config and leaves the active key unchanged when saving fails", () => {
  const path = envFile();
  const environment = { DEEPSEEK_API_KEY: "active-key" };
  const settings = createAiSettings(path, environment);
  expect(() => settings.setApiKey("bad\nPORT=8080")).toThrow(TypeError);
  expect(() => settings.setApiKey('bad"key')).toThrow(TypeError);
  writeFileSync(path, "PORT=3030\n");
  expect(() => settings.setApiKey("bad key")).toThrow(TypeError);
  expect(readFileSync(path, "utf8")).toBe("PORT=3030\n");
  const invalidPath = join(path, ".env");
  expect(() => createAiSettings(invalidPath, environment)).toThrow();
  rmSync(dirs.pop()!, { recursive: true });
  expect(() => settings.setApiKey("unsaved-key")).toThrow();
  expect(settings.getApiKey()).toBe("active-key");
});

it("preserves assignments appearing inside another variable's multiline value", () => {
  const path = envFile();
  const source = 'OTHER="example\nDEEPSEEK_API_KEY=keep this text\nend"\n';
  writeFileSync(path, source);
  createAiSettings(path, {}).setApiKey("new-key");
  expect(readFileSync(path, "utf8")).toBe(source + 'DEEPSEEK_API_KEY="new-key"\n');
});
