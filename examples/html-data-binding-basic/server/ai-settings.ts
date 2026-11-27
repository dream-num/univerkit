import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

function readEnv(path: string) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export function createAiSettings(path: string, environment = process.env) {
  const savedKey = parseEnv(readEnv(path)).DEEPSEEK_API_KEY;
  if (savedKey !== undefined) environment.DEEPSEEK_API_KEY = savedKey;
  return {
    getApiKey: () => environment.DEEPSEEK_API_KEY ?? "",
    setApiKey(value: string) {
      const apiKey = value.trim();
      if (/[\s"'`\\\0]/.test(apiKey))
        throw new TypeError("API Key must be a single token without quotes or whitespace.");
      const source = readEnv(path);
      const newline = source.includes("\r\n") ? "\r\n" : "\n";
      const assignment = `DEEPSEEK_API_KEY="${apiKey}"`;
      // Replace existing assignments (including duplicates), preserving other settings.
      const assignments =
        /^[\t ]*(?:export[\t ]+)?([A-Za-z_][A-Za-z0-9_]*)[\t ]*=[\t ]*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\r\n]*)(?:[\t ]*#[^\r\n]*)?/gm;
      let replaced = false;
      let content = source.replace(assignments, (line, key: string) => {
        if (key !== "DEEPSEEK_API_KEY") return line;
        replaced = true;
        return assignment;
      });
      if (!replaced)
        content += (source && !source.endsWith("\n") ? newline : "") + assignment + newline;
      writeFileSync(path, content, { mode: 0o600 });
      environment.DEEPSEEK_API_KEY = apiKey;
    },
  };
}
