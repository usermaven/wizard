import { describe, expect, it } from "vitest";

import {
  fingerprintWorkspaceKey,
  WorkspaceApiClient,
} from "./workspace-api.js";
import { starterTrends } from "./starter-dashboard.js";

interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeApi(
  handler: (request: RecordedRequest) => { status?: number; json?: unknown },
) {
  const requests: RecordedRequest[] = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const request: RecordedRequest = {
      method: init?.method ?? "GET",
      path: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(
          ([key, value]) => [key.toLowerCase(), value],
        ),
      ),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    requests.push(request);
    const result = handler(request);
    return new Response(JSON.stringify(result.json ?? {}), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { requests, fetchImplementation };
}

describe("WorkspaceApiClient", () => {
  it("logs in and surfaces the two-factor step", async () => {
    const api = fakeApi((request) => {
      if (request.path === "/v1/auth/login") {
        return request.body &&
          (request.body as Record<string, unknown>)["email"] === "2fa@x.com"
          ? { json: { requires_2fa: true, session_token: "user-1" } }
          : { json: { access_token: "at", refresh_token: "rt" } };
      }
      if (request.path === "/v1/auth/2fa/login") {
        return { json: { access_token: "at2", refresh_token: "rt2" } };
      }
      return { status: 404 };
    });
    const client = new WorkspaceApiClient({
      baseUrl: "https://api.test",
      fetchImplementation: api.fetchImplementation,
    });

    const plain = await client.login("user@x.com", "pw");
    expect(plain).toEqual({
      status: "ok",
      accessToken: "at",
      refreshToken: "rt",
    });

    const challenged = await client.login("2fa@x.com", "pw");
    expect(challenged.status).toBe("requires_2fa");
    const completed = await client.loginTwoFactor("user-1", "123456");
    expect(completed.accessToken).toBe("at2");
    expect(api.requests[0]?.body).toMatchObject({ remember_me: true });
  });

  it("lists workspaces with resolved tracking hosts and auth headers", async () => {
    const api = fakeApi(() => ({
      json: [
        {
          id: "ws-1",
          name: "Main",
          identifier: "UMabc12345",
          custom_domain: "events.example.com",
          is_custom_domain_verified: true,
          website: "https://example.com",
          server_token: "should-never-be-used",
        },
        {
          id: "ws-2",
          name: "Side",
          identifier: "UMdef67890",
          custom_domain: "unverified.example.com",
          is_custom_domain_verified: false,
          website: null,
        },
      ],
    }));
    const client = new WorkspaceApiClient({
      baseUrl: "https://api.test",
      fetchImplementation: api.fetchImplementation,
    });

    const workspaces = await client.listWorkspaces({
      kind: "api_key",
      apiKey: "key-1",
    });

    expect(api.requests[0]?.headers["x-api-key"]).toBe("key-1");
    expect(workspaces).toEqual([
      {
        id: "ws-1",
        name: "Main",
        identifier: "UMabc12345",
        trackingHost: "https://events.example.com",
        website: "https://example.com",
      },
      {
        id: "ws-2",
        name: "Side",
        identifier: "UMdef67890",
        trackingHost: "https://events.usermaven.com",
        website: null,
      },
    ]);
    expect(JSON.stringify(workspaces)).not.toContain("should-never-be-used");
  });

  it("rejects invalid credentials with a login hint", async () => {
    const api = fakeApi(() => ({ status: 401, json: {} }));
    const client = new WorkspaceApiClient({
      baseUrl: "https://api.test",
      fetchImplementation: api.fetchImplementation,
    });

    await expect(
      client.listWorkspaces({ kind: "bearer", accessToken: "expired" }),
    ).rejects.toThrow("usermaven-wizard login");
  });

  it("creates the starter dashboard in dependency order", async () => {
    let trendCounter = 0;
    const api = fakeApi((request) => {
      if (request.method === "POST" && request.path === "/v1/dashboards/ws-1")
        return { json: { id: "dash-1" } };
      if (request.method === "POST" && request.path === "/v1/trends/ws-1") {
        trendCounter += 1;
        return { json: { id: `trend-${trendCounter}` } };
      }
      if (request.path === "/v1/dashboards/ws-1/dash-1/tiles/bulk")
        return { json: { created: true } };
      return { status: 404 };
    });
    const client = new WorkspaceApiClient({
      baseUrl: "https://api.test",
      fetchImplementation: api.fetchImplementation,
    });

    const result = await client.createStarterDashboard(
      { kind: "bearer", accessToken: "at" },
      "ws-1",
      { dashboardName: "Web analytics starter", trends: starterTrends() },
    );

    expect(result.dashboardId).toBe("dash-1");
    expect(result.trendIds).toHaveLength(starterTrends().length);
    const bulk = api.requests.at(-1);
    expect(bulk?.path).toBe("/v1/dashboards/ws-1/dash-1/tiles/bulk");
    expect(bulk?.body).toEqual({
      trend_ids: result.trendIds,
    });
    expect(api.requests[0]?.headers["authorization"]).toBe("Bearer at");
  });

  it("computes the documented key fingerprint", () => {
    expect(fingerprintWorkspaceKey("UMabc12345")).toMatch(
      /^sha256:[a-f0-9]{64}$/u,
    );
  });

  it("runs the device sign-in flow and maps poll outcomes", async () => {
    let polls = 0;
    const api = fakeApi((request) => {
      if (request.path === "/v1/auth/device/authorize") {
        return {
          json: {
            device_code: "device-1",
            user_code: "BCDF-GHJK",
            verification_uri: "https://app.test/cli-login",
            verification_uri_complete:
              "https://app.test/cli-login?code=BCDF-GHJK",
            expires_in: 900,
            interval: 5,
          },
        };
      }
      if (request.path === "/v1/auth/device/token") {
        polls += 1;
        if (polls === 1)
          return { status: 400, json: { error: "authorization_pending" } };
        if (polls === 2)
          return { status: 400, json: { error: "access_denied" } };
        if (polls === 3)
          return { status: 400, json: { error: "expired_token" } };
        return {
          json: {
            access_token: "at",
            refresh_token: "rt",
            token_type: "bearer",
            email: "dev@example.com",
          },
        };
      }
      return { status: 404 };
    });
    const client = new WorkspaceApiClient({
      baseUrl: "https://api.test",
      fetchImplementation: api.fetchImplementation,
    });

    const device = await client.startDeviceAuthorization("Usermaven Wizard");
    expect(device).toMatchObject({
      deviceCode: "device-1",
      userCode: "BCDF-GHJK",
      intervalSeconds: 5,
    });
    expect(api.requests[0]?.body).toEqual({ client_name: "Usermaven Wizard" });

    expect(await client.pollDeviceToken("device-1")).toEqual({
      status: "pending",
    });
    expect(await client.pollDeviceToken("device-1")).toEqual({
      status: "denied",
    });
    expect(await client.pollDeviceToken("device-1")).toEqual({
      status: "expired",
    });
    expect(await client.pollDeviceToken("device-1")).toEqual({
      status: "ok",
      accessToken: "at",
      refreshToken: "rt",
      email: "dev@example.com",
    });
  });

  it("signals password fallback when the device endpoint is missing", async () => {
    const api = fakeApi(() => ({ status: 404, json: { detail: "Not Found" } }));
    const client = new WorkspaceApiClient({
      baseUrl: "https://api.test",
      fetchImplementation: api.fetchImplementation,
    });

    expect(
      await client.startDeviceAuthorization("Usermaven Wizard"),
    ).toBeNull();
  });
});

describe("starterTrends", () => {
  it("uses only metric shapes the trend library itself serves", () => {
    for (const trend of starterTrends()) {
      expect(trend.payload["model_name"]).toBe("generated_view_events");
      const metrics = trend.payload["metrics"] as Array<
        Record<string, unknown>
      >;
      for (const metric of metrics) {
        expect(["count", "count_session", "unique_visitor"]).toContain(
          metric["metric"],
        );
        expect(metric["event"]).toBe("event_type='pageview'");
      }
    }
  });
});
