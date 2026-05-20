import { createMcpHandler } from "agents/mcp";
import { requireMcpAuth } from "./auth";
import { PlanningCenterClient } from "./planning-center";
import { createPlanningCenterMcpServer } from "./tools";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "planning-center-mcp" });
    }

    if (url.pathname === "/ready") {
      return Response.json({
        ok: ready(env),
        service: "planning-center-mcp",
        ...new PlanningCenterClient(env).status()
      });
    }

    if (url.pathname === "/mcp") {
      const auth = await requireMcpAuth(request, env);
      if (!auth.ok) {
        return auth.response;
      }

      const server = createPlanningCenterMcpServer(env);
      return createMcpHandler(server, { route: "/mcp" })(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;

function ready(env: Env): boolean {
  const hasPlanningCenterAuth = Boolean(env.PCO_ACCESS_TOKEN || (env.PCO_APP_ID && env.PCO_SECRET));
  const hasMcpAuth = env.MCP_REQUIRE_AUTH?.toLowerCase() === "false" || Boolean(env.MCP_AUTH_TOKEN);
  return hasPlanningCenterAuth && hasMcpAuth;
}
