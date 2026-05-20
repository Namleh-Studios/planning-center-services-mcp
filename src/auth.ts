export type AuthCheck =
  | { ok: true }
  | { ok: false; response: Response };

export async function requireMcpAuth(request: Request, env: Env): Promise<AuthCheck> {
  if (!requiresAuth(env)) {
    return { ok: true };
  }

  if (!env.MCP_AUTH_TOKEN) {
    return {
      ok: false,
      response: Response.json(
        {
          error: "MCP authentication is required, but MCP_AUTH_TOKEN is not configured."
        },
        { status: 500 }
      )
    };
  }

  const actual = bearerToken(request) ?? request.headers.get("x-mcp-auth-token");
  if (!actual || !(await constantTimeEqual(actual, env.MCP_AUTH_TOKEN))) {
    return {
      ok: false,
      response: new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="planning-center-services-mcp"'
        }
      })
    };
  }

  return { ok: true };
}

export function requiresAuth(env: Pick<Env, "MCP_REQUIRE_AUTH">): boolean {
  return env.MCP_REQUIRE_AUTH?.toLowerCase() !== "false";
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorization.slice("Bearer ".length);
}

async function constantTimeEqual(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);
  const length = Math.max(actualBytes.length, expectedBytes.length);
  let diff = actualBytes.length ^ expectedBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  await crypto.subtle.digest("SHA-256", expectedBytes);
  return diff === 0;
}
