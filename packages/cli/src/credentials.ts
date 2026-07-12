import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ApiAuth } from "./workspace-api.js";

export interface StoredCredentials {
  base_url: string;
  email?: string;
  auth:
    | { kind: "bearer"; access_token: string; refresh_token?: string }
    | { kind: "api_key"; api_key: string };
}

function configDirectory(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  return join(
    xdg && xdg.length > 0 ? xdg : join(homedir(), ".config"),
    "usermaven-wizard",
  );
}

export function credentialsPath(): string {
  return join(configDirectory(), "credentials.json");
}

export async function saveCredentials(
  credentials: StoredCredentials,
): Promise<string> {
  const path = credentialsPath();
  await mkdir(configDirectory(), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(credentials, null, 2)}\n`, {
    mode: 0o600,
  });
  return path;
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const apiKey = process.env["USERMAVEN_API_KEY"];
  if (apiKey && apiKey.length > 0) {
    return {
      base_url: process.env["USERMAVEN_API_URL"] ?? "https://api.usermaven.com",
      auth: { kind: "api_key", api_key: apiKey },
    };
  }
  try {
    const parsed: unknown = JSON.parse(
      await readFile(credentialsPath(), "utf8"),
    );
    if (parsed === null || typeof parsed !== "object") return null;
    const record = parsed as StoredCredentials;
    if (typeof record.base_url !== "string" || !record.auth) return null;
    return record;
  } catch {
    return null;
  }
}

export async function clearCredentials(): Promise<void> {
  await rm(credentialsPath(), { force: true });
}

export function toApiAuth(credentials: StoredCredentials): ApiAuth {
  return credentials.auth.kind === "api_key"
    ? { kind: "api_key", apiKey: credentials.auth.api_key }
    : { kind: "bearer", accessToken: credentials.auth.access_token };
}
