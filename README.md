# Planning Center MCP

A remote Model Context Protocol server for the Planning Center API, built for Cloudflare Workers.

This server exposes generic tools for all Planning Center products plus higher-level Services scheduling helpers. It is designed to be reusable by the community without Namleh Vault or organization-specific dependencies.

Search terms: Planning Center MCP, Planning Center Online MCP, PCO MCP server, Planning Center API MCP server, Church tech MCP, Services scheduling MCP, Cloudflare Workers MCP.

## Features

- Cloudflare Workers remote MCP server using Streamable HTTP.
- Generic setup: no Vault, no organization-specific dependencies.
- Planning Center credentials via Worker secrets or local `.dev.vars`.
- Private hosted instances can require a bearer token before any MCP request reaches the Planning Center API.
- Official OpenAPI discovery tool for endpoint/resource lookup across Planning Center products.
- Read, create, update, and delete tools for every supported Planning Center product.
- Write tools are disabled by default and require both `PCO_ENABLE_WRITE_TOOLS=true` and an explicit confirmation argument.
- Services scheduling helpers remain available for common plan/team/person workflows.
- Person payloads are shaped into safer scheduling DTOs for the Services helper tools.

## Supported Products

- API
- Calendar
- Check-Ins
- Current
- Giving
- Groups
- People
- Publishing
- Registrations
- Services
- Webhooks

## Tools

- `pco_status`: report server configuration without returning secrets.
- `planning_center_apps_list`: list supported Planning Center product slugs, docs URLs, OAuth scopes, and OpenAPI URLs.
- `planning_center_openapi_search`: search official OpenAPI descriptions for resources, endpoints, methods, parameters, and request bodies.
- `planning_center_get`: run a read-only GET request against any Planning Center product.
- `planning_center_create`: create a JSON:API resource in any Planning Center product.
- `planning_center_update`: patch a JSON:API resource in any Planning Center product.
- `planning_center_delete`: delete a resource in any Planning Center product.
- `service_types_list`: list Services service types.
- `plans_list`: list plans for a service type.
- `plan_get`: get one plan.
- `teams_list`: list teams globally or for a service type.
- `team_positions_list`: list team positions.
- `needed_positions_list`: list unfilled positions for a plan.
- `team_members_list`: list people already scheduled to a plan.
- `people_list`: list/search schedulable Services people with shaped person fields.
- `team_position_candidates_list`: list people assigned to a team position.
- `person_schedules_list`: list a person's schedules.
- `person_blockouts_list`: list a person's blockouts.
- `schedule_person`: schedule a person to a plan, guarded by dry-run defaults and write enablement.

## Local Setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

The MCP endpoint is:

```text
http://localhost:8787/mcp
```

Planning Center supports Personal Access Token authentication for single-user tools. Put the app ID and secret in `.dev.vars`:

```text
PCO_APP_ID="..."
PCO_SECRET="..."
```

You can also use an OAuth access token:

```text
PCO_ACCESS_TOKEN="..."
```

## Authentication

For a private hosted instance, set `MCP_AUTH_TOKEN` and leave `MCP_REQUIRE_AUTH=true`.

Clients must send:

```http
Authorization: Bearer <token>
```

If `MCP_REQUIRE_AUTH=true` and `MCP_AUTH_TOKEN` is missing, `/mcp` returns a configuration error instead of exposing your Planning Center data.

## Generic API Usage

Use `planning_center_apps_list` first to find the product slug, then use `planning_center_openapi_search` to discover paths. Generic API paths are app-relative:

```json
{
  "app": "people",
  "path": "/people",
  "per_page": 25
}
```

The server calls:

```text
https://api.planningcenteronline.com/people/v2/people?per_page=25
```

Generic writes accept JSON:API resource bodies. They default to `dry_run: true`; real writes require `dry_run: false`, `PCO_ENABLE_WRITE_TOOLS=true`, and `confirm: "planning-center-write"`.

## Deploy

Create the Worker secrets:

```bash
npm exec -- wrangler secret put PCO_APP_ID
npm exec -- wrangler secret put PCO_SECRET
npm exec -- wrangler secret put MCP_AUTH_TOKEN
```

Then deploy:

```bash
npm run deploy
```

The deployed endpoint will be:

```text
https://<your-worker>.<your-account>.workers.dev/mcp
```

## Enable Writes

Writes are disabled by default. To enable them for a private deployment, set this non-secret var in `wrangler.jsonc` or your deployment environment:

```jsonc
{
  "vars": {
    "PCO_ENABLE_WRITE_TOOLS": "true"
  }
}
```

The `schedule_person` tool still defaults to `dry_run: true`. A real scheduling write requires `dry_run: false` and `confirm: "schedule-person"`.

Generic create/update/delete tools also default to `dry_run: true`. A real generic write requires `dry_run: false` and `confirm: "planning-center-write"`.

## Security Notes

- Do not deploy with `MCP_REQUIRE_AUTH=false` when real Planning Center credentials are configured.
- Use a Planning Center account with the minimum permissions needed for the products and campuses you manage.
- Start with `PCO_ENABLE_WRITE_TOOLS=false` until read-only tools are working.
- Use `fields`, `where`, and endpoint-specific filters to avoid returning data the client does not need.
- Keep `.dev.vars`, `.env*`, and logs out of git.

## References

- Planning Center API docs: https://api.planningcenteronline.com/docs/
- Planning Center API authentication: https://api.planningcenteronline.com/docs/overview/authentication
- Cloudflare remote MCP guide: https://developers.cloudflare.com/agents/guides/remote-mcp-server/
