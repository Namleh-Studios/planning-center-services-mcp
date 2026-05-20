import { describe, expect, it } from "vitest";
import { requireMcpAuth } from "../src/auth";
import { formatDocument } from "../src/format";
import { PlanningCenterClient, fetchOpenApiDocument, planningCenterOpenApiUrl } from "../src/planning-center";

const baseEnv = {
  PCO_API_BASE_URL: "https://api.planningcenteronline.com",
  PCO_APP_ID: "app",
  PCO_SECRET: "secret",
  PCO_ACCESS_TOKEN: "",
  MCP_AUTH_TOKEN: "mcp-secret",
  MCP_REQUIRE_AUTH: "true",
  PCO_ENABLE_WRITE_TOOLS: "false"
} as Env;

describe("PlanningCenterClient", () => {
  it("uses basic auth and JSON:API query parameters", async () => {
    const requests: Request[] = [];
    const client = new PlanningCenterClient(baseEnv, async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ data: [] });
    });

    await client.get("/service_types", {
      perPage: 50,
      where: { name: "Sunday" },
      include: ["time_preference_options"]
    });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    const url = new URL(request.url);
    expect(url.pathname).toBe("/services/v2/service_types");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("where[name]")).toBe("Sunday");
    expect(url.searchParams.get("include")).toBe("time_preference_options");
    expect(request.headers.get("authorization")).toBe("Basic YXBwOnNlY3JldA==");
    expect(request.headers.get("accept")).toBe("application/vnd.api+json");
  });

  it("uses bearer auth when an OAuth access token is configured", async () => {
    const requests: Request[] = [];
    const client = new PlanningCenterClient({ ...baseEnv, PCO_ACCESS_TOKEN: "oauth-token" }, async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ data: null });
    });

    await client.get("/people/1");

    expect(requests[0]!.headers.get("authorization")).toBe("Bearer oauth-token");
  });

  it("can target non-Services Planning Center products", async () => {
    const requests: Request[] = [];
    const client = new PlanningCenterClient(baseEnv, async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ data: [] });
    });

    await client.get("/people", { perPage: 10 }, "people");

    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/people/v2/people");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  it("rejects unsafe API paths", async () => {
    const client = new PlanningCenterClient(baseEnv, async () => Response.json({ data: [] }));

    await expect(client.get("/../people", undefined, "people")).rejects.toThrow("Invalid Planning Center API path");
  });

  it("builds OpenAPI URLs for all-product discovery", async () => {
    expect(planningCenterOpenApiUrl("check-ins", "2025-05-28")).toBe(
      "https://api.planningcenteronline.com/check-ins/v2/open_api/2025-05-28"
    );
  });

  it("fetches OpenAPI documents without Planning Center auth headers", async () => {
    const requests: Request[] = [];
    const document = await fetchOpenApiDocument(baseEnv, "people", "2025-11-10", async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({
        openapi: "3.1.1",
        info: { title: "Planning Center People", version: "2025-11-10" },
        paths: {}
      });
    });

    expect(document.info?.title).toBe("Planning Center People");
    expect(requests[0]!.url).toBe("https://api.planningcenteronline.com/people/v2/open_api/2025-11-10");
    expect(requests[0]!.headers.has("authorization")).toBe(false);
  });
});

describe("formatDocument", () => {
  it("shapes person records without returning notes or login metadata", () => {
    const formatted = formatDocument({
      data: {
        type: "Person",
        id: "7",
        attributes: {
          full_name: "Ada Lovelace",
          first_name: "Ada",
          last_name: "Lovelace",
          notes: "private note",
          logged_in_at: "2026-01-01T00:00:00Z"
        }
      }
    });

    expect(formatted.data).toMatchObject({
      type: "Person",
      id: "7",
      full_name: "Ada Lovelace",
      first_name: "Ada",
      last_name: "Lovelace"
    });
    expect(JSON.stringify(formatted)).not.toContain("private note");
    expect(JSON.stringify(formatted)).not.toContain("logged_in_at");
  });
});

describe("requireMcpAuth", () => {
  it("rejects missing bearer tokens when auth is required", async () => {
    const result = await requireMcpAuth(new Request("https://example.com/mcp"), baseEnv);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("accepts the configured bearer token", async () => {
    const result = await requireMcpAuth(
      new Request("https://example.com/mcp", {
        headers: { authorization: "Bearer mcp-secret" }
      }),
      baseEnv
    );

    expect(result.ok).toBe(true);
  });
});
