import { createHash } from "node:crypto";

export const DEFAULT_API_URL = "https://api.usermaven.com";
export const DEFAULT_TRACKING_HOST = "https://events.usermaven.com";

export type ApiAuth =
  { kind: "bearer"; accessToken: string } | { kind: "api_key"; apiKey: string };

export interface WorkspaceApiOptions {
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export interface LoginSuccess {
  status: "ok";
  accessToken: string;
  refreshToken: string | null;
}

export interface LoginNeedsTwoFactor {
  status: "requires_2fa";
  sessionToken: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  identifier: string;
  trackingHost: string;
  website: string | null;
}

export interface StarterDashboardResult {
  dashboardId: string;
  dashboardName: string;
  trendIds: string[];
}

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

export type DeviceTokenResult =
  | { status: "pending" }
  | { status: "denied" }
  | { status: "expired" }
  | {
      status: "ok";
      accessToken: string;
      refreshToken: string | null;
      email: string | null;
    };

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The Usermaven API returned an unexpected response shape");
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`The Usermaven API response is missing ${field}`);
  }
  return value;
}

/**
 * Computes the sha256 fingerprint of a workspace public key the same way the
 * documentation instructs users to compute it by hand.
 */
export function fingerprintWorkspaceKey(identifier: string): string {
  return `sha256:${createHash("sha256").update(identifier, "utf8").digest("hex")}`;
}

/**
 * Minimal authenticated client for the Usermaven workspace API. It only ever
 * sends credentials the user explicitly provided plus the request bodies
 * visible in this file — never repository source, inspection output, or
 * local environment values. The workspace `server_token` is deliberately
 * never read out of API responses.
 */
export class WorkspaceApiClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: WorkspaceApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_URL).replace(/\/+$/u, "");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private async request(
    method: string,
    path: string,
    auth: ApiAuth | null,
    body?: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (auth?.kind === "bearer") {
      headers["authorization"] = `Bearer ${auth.accessToken}`;
    } else if (auth?.kind === "api_key") {
      headers["x-api-key"] = auth.apiKey;
    }
    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new Error(
        `Could not reach the Usermaven API at ${this.baseUrl}; check connectivity or --api-url`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "The Usermaven API rejected the credentials; run `usermaven-wizard login` again",
      );
    }
    if (!response.ok) {
      throw new Error(
        `The Usermaven API returned HTTP ${response.status} for ${method} ${path}`,
      );
    }
    return response.json();
  }

  private async rawRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    try {
      return await this.fetchImplementation(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new Error(
        `Could not reach the Usermaven API at ${this.baseUrl}; check connectivity or --api-url`,
      );
    }
  }

  /**
   * Starts a browser-approved device sign-in. Returns null when the API does
   * not support the device flow yet, so callers can fall back to password
   * login.
   */
  async startDeviceAuthorization(
    clientName: string,
  ): Promise<DeviceAuthorization | null> {
    const response = await this.rawRequest(
      "POST",
      "/v1/auth/device/authorize",
      {
        client_name: clientName,
      },
    );
    if (response.status === 404 || response.status === 405) return null;
    if (!response.ok) {
      throw new Error(
        `The Usermaven API returned HTTP ${response.status} while starting device sign-in`,
      );
    }
    const result = asRecord(await response.json());
    return {
      deviceCode: requireString(result, "device_code"),
      userCode: requireString(result, "user_code"),
      verificationUri: requireString(result, "verification_uri"),
      verificationUriComplete: requireString(
        result,
        "verification_uri_complete",
      ),
      expiresInSeconds:
        typeof result["expires_in"] === "number" ? result["expires_in"] : 900,
      intervalSeconds:
        typeof result["interval"] === "number" ? result["interval"] : 5,
    };
  }

  async pollDeviceToken(deviceCode: string): Promise<DeviceTokenResult> {
    const response = await this.rawRequest("POST", "/v1/auth/device/token", {
      device_code: deviceCode,
    });
    if (response.status === 400) {
      const body = asRecord(await response.json());
      const code = body["error"];
      if (code === "authorization_pending") return { status: "pending" };
      if (code === "access_denied") return { status: "denied" };
      return { status: "expired" };
    }
    if (!response.ok) {
      throw new Error(
        `The Usermaven API returned HTTP ${response.status} while completing device sign-in`,
      );
    }
    const result = asRecord(await response.json());
    return {
      status: "ok",
      accessToken: requireString(result, "access_token"),
      refreshToken:
        typeof result["refresh_token"] === "string"
          ? (result["refresh_token"] as string)
          : null,
      email:
        typeof result["email"] === "string"
          ? (result["email"] as string)
          : null,
    };
  }

  async login(
    email: string,
    password: string,
  ): Promise<LoginSuccess | LoginNeedsTwoFactor> {
    const result = asRecord(
      await this.request("POST", "/v1/auth/login", null, {
        email,
        password,
        remember_me: true,
      }),
    );
    if (result["requires_2fa"] === true) {
      return {
        status: "requires_2fa",
        sessionToken: requireString(result, "session_token"),
      };
    }
    return {
      status: "ok",
      accessToken: requireString(result, "access_token"),
      refreshToken:
        typeof result["refresh_token"] === "string"
          ? (result["refresh_token"] as string)
          : null,
    };
  }

  async loginTwoFactor(
    sessionToken: string,
    code: string,
  ): Promise<LoginSuccess> {
    const result = asRecord(
      await this.request("POST", "/v1/auth/2fa/login", null, {
        session_token: sessionToken,
        code,
      }),
    );
    return {
      status: "ok",
      accessToken: requireString(result, "access_token"),
      refreshToken:
        typeof result["refresh_token"] === "string"
          ? (result["refresh_token"] as string)
          : null,
    };
  }

  async listWorkspaces(auth: ApiAuth): Promise<WorkspaceSummary[]> {
    const result = await this.request(
      "GET",
      "/v1/workspaces?skip=0&limit=100",
      auth,
    );
    if (!Array.isArray(result)) {
      throw new Error(
        "The Usermaven API returned an unexpected workspace list",
      );
    }
    return result.map((item) => {
      const workspace = asRecord(item);
      const customDomain =
        typeof workspace["custom_domain"] === "string" &&
        workspace["custom_domain"].length > 0 &&
        workspace["is_custom_domain_verified"] === true
          ? (workspace["custom_domain"] as string)
          : null;
      return {
        id: requireString(workspace, "id"),
        name: requireString(workspace, "name"),
        identifier: requireString(workspace, "identifier"),
        trackingHost: customDomain
          ? `https://${customDomain.replace(/^https?:\/\//u, "")}`
          : DEFAULT_TRACKING_HOST,
        website:
          typeof workspace["website"] === "string"
            ? (workspace["website"] as string)
            : null,
      };
    });
  }

  async listDashboardNames(
    auth: ApiAuth,
    workspaceId: string,
  ): Promise<string[]> {
    const result = await this.request(
      "GET",
      `/v1/dashboards/${encodeURIComponent(workspaceId)}`,
      auth,
    );
    if (!Array.isArray(result)) return [];
    return result.flatMap((item) => {
      const record = asRecord(item);
      return typeof record["name"] === "string" ? [record["name"]] : [];
    });
  }

  async createStarterDashboard(
    auth: ApiAuth,
    workspaceId: string,
    input: {
      dashboardName: string;
      trends: Array<{ name: string; payload: Record<string, unknown> }>;
    },
  ): Promise<StarterDashboardResult> {
    const dashboard = asRecord(
      await this.request(
        "POST",
        `/v1/dashboards/${encodeURIComponent(workspaceId)}`,
        auth,
        {
          name: input.dashboardName,
          description:
            "Starter web-analytics dashboard created by the Usermaven Wizard.",
          pinned: false,
          visibility: "private",
          tags: [],
        },
      ),
    );
    const dashboardId = requireString(dashboard, "id");
    const trendIds: string[] = [];
    for (const trend of input.trends) {
      const created = asRecord(
        await this.request(
          "POST",
          `/v1/trends/${encodeURIComponent(workspaceId)}`,
          auth,
          trend.payload,
        ),
      );
      trendIds.push(requireString(created, "id"));
    }
    if (trendIds.length > 0) {
      await this.request(
        "POST",
        `/v1/dashboards/${encodeURIComponent(workspaceId)}/${encodeURIComponent(dashboardId)}/tiles/bulk`,
        auth,
        { trend_ids: trendIds },
      );
    }
    return {
      dashboardId,
      dashboardName: input.dashboardName,
      trendIds,
    };
  }
}
