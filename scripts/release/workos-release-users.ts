import { appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import process from "node:process";
import { escapeGithubCommandData, formatGithubOutputs, resolveGithubOutputPath } from "./github-output";

type WorkosUser = {
  id: string;
  email: string;
};

type ReleaseUser = {
  id: string;
  email: string;
  password: string;
};

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function argumentsFor(name: string): string[] {
  const prefix = `--${name}=`;
  return process.argv
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.slice(prefix.length))
    .filter(Boolean);
}

function required(name: string, value?: string) {
  if (!value?.trim()) throw new Error(`MISSING_RELEASE_USER_INPUT:${name}`);
  return value.trim();
}

function password() {
  return `Ti!9aA-${randomBytes(24).toString("base64url")}`;
}

async function request(path: string, init: RequestInit = {}) {
  const apiKey = required("WORKOS_API_KEY", process.env.WORKOS_API_KEY);
  const response = await fetch(`https://api.workos.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`WORKOS_RELEASE_USER_REQUEST_FAILED:${response.status}:${body.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function createUser(kind: "auth" | "onboarding", suffix: string): Promise<ReleaseUser> {
  const userPassword = password();
  const email = `token-intelligence-release-${kind}-${suffix}@example.com`;
  const created = await request("/user_management/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: userPassword,
      first_name: "Token Intelligence",
      last_name: kind === "auth" ? "Release Auth" : "Release Onboarding",
      email_verified: true,
      metadata: {
        purpose: "release-certification",
        ephemeral: "true",
      },
    }),
  }) as WorkosUser;
  if (!created || typeof created.id !== "string" || !/^user_[A-Za-z0-9_-]{1,128}$/.test(created.id)) {
    throw new Error("WORKOS_RELEASE_USER_RESPONSE_INVALID");
  }
  if (typeof created.email !== "string" || created.email.trim().toLowerCase() !== email.toLowerCase()) {
    await deleteUser(created.id);
    throw new Error("WORKOS_RELEASE_USER_EMAIL_MISMATCH");
  }
  return { id: created.id, email: created.email, password: userPassword };
}

async function deleteUser(id: string) {
  try {
    await request(`/user_management/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(":404:")) throw error;
  }
}

function mask(user: ReleaseUser) {
  for (const value of [user.id, user.email, user.password]) {
    process.stdout.write(`::add-mask::${escapeGithubCommandData(value)}\n`);
  }
}

async function provision() {
  if (process.env.GITHUB_ACTIONS !== "true") throw new Error("GITHUB_ACTIONS_REQUIRED_FOR_RELEASE_USER_PROVISIONING");
  const outputPath = resolveGithubOutputPath(
    required("GITHUB_OUTPUT", process.env.GITHUB_OUTPUT),
    required("RUNNER_TEMP", process.env.RUNNER_TEMP),
  );
  const profile = argument("profile") ?? "preview";
  if (profile !== "preview" && profile !== "auth-only") {
    throw new Error(`UNKNOWN_RELEASE_USER_PROFILE:${profile}`);
  }

  const run = (process.env.GITHUB_RUN_ID ?? Date.now().toString()).replace(/[^0-9A-Za-z_-]/g, "");
  const suffix = `${run}-${randomBytes(5).toString("hex")}`;
  const created: string[] = [];
  try {
    const auth = await createUser("auth", suffix);
    created.push(auth.id);
    mask(auth);

    const output: Record<string, string> = {
      auth_user_id: auth.id,
      auth_email: auth.email,
      auth_password: auth.password,
    };

    if (profile === "preview") {
      const onboarding = await createUser("onboarding", suffix);
      created.push(onboarding.id);
      mask(onboarding);
      output.onboarding_user_id = onboarding.id;
      output.onboarding_email = onboarding.email;
      output.onboarding_password = onboarding.password;
    }

    await appendFile(outputPath, formatGithubOutputs(output));

    process.stdout.write(JSON.stringify({
      provider: "workos-authkit",
      action: "provision",
      profile,
      ephemeralUsers: created.length,
      credentialsPersisted: false,
      githubOutputsMasked: true,
    }, null, 2) + "\n");
  } catch (error) {
    await Promise.allSettled(created.map(deleteUser));
    throw error;
  }
}

async function cleanup() {
  const ids = argumentsFor("user-id");
  if (ids.length === 0) throw new Error("MISSING_RELEASE_USER_INPUT:user-id");
  const results = await Promise.allSettled(ids.map(deleteUser));
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    throw new Error(`WORKOS_RELEASE_USER_CLEANUP_FAILED:${failed.length}`);
  }
  process.stdout.write(JSON.stringify({
    provider: "workos-authkit",
    action: "cleanup",
    deletedUsers: ids.length,
  }, null, 2) + "\n");
}

const action = argument("action") ?? "provision";
if (action === "provision") {
  await provision();
} else if (action === "cleanup") {
  await cleanup();
} else {
  throw new Error(`UNKNOWN_RELEASE_USER_ACTION:${action}`);
}
