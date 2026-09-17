import process from "node:process";
import { normalizedScope, releaseEnvStatus } from "./env-contract";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const scope = normalizedScope(argument("scope") ?? process.env.RELEASE_SCOPE ?? "production");
const status = releaseEnvStatus(scope);
process.stdout.write(JSON.stringify(status, null, 2) + "\n");
if (!status.ready) process.exitCode = 2;
