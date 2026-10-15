import { randomBytes } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

export function escapeGithubCommandData(value: string) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

export function resolveGithubOutputPath(outputPath: string, runnerTemp: string) {
  const resolvedPath = resolve(outputPath);
  const relativePath = relative(resolve(runnerTemp), resolvedPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("GITHUB_OUTPUT_PATH_OUTSIDE_RUNNER_TEMP");
  }
  return resolvedPath;
}

export function formatGithubOutputs(values: Readonly<Record<string, string>>) {
  return Object.entries(values).map(([name, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("INVALID_GITHUB_OUTPUT_NAME");
    let delimiter: string;
    do {
      delimiter = `TI_OUTPUT_${randomBytes(16).toString("hex")}`;
    } while (value.split(/\r?\n/).includes(delimiter));
    return `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
  }).join("");
}
