# Planning Center Services MCP

A remote Model Context Protocol server for Planning Center Services scheduling workflows, built for Cloudflare Workers.

This server is intentionally focused on Services scheduling instead of wrapping the entire Planning Center API. It exposes tools for service types, plans, teams, team positions, needed positions, team members, candidate people, person schedules, person blockouts, and guarded scheduling writes.

## Features

- Cloudflare Workers remote MCP server using Streamable HTTP.
- Generic setup: no Vault, no organization-specific dependencies.
- Planning Center credentials via Worker secrets or local `.dev.vars`.
- Private hosted instances can require a bearer token before any MCP request reaches the Planning Center API.
- Write tools are disabled by default and require both `PCO_ENABLE_WRITE_TOOLS=true` and an explicit confirmation argument.
- Person payloads are shaped into scheduling DTOs instead of returning full raw Planning Center person records by default.

## Tools

- `pco_status`: report server configuration without returning secrets.
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

Scheduling writes are disabled by default. To enable them for a private deployment:

```bash
npm exec -- wrangler secret put PCO_APP_ID
npm exec -- wrangler secret put PCO_SECRET
```

Set this non-secret var in `wrangler.jsonc` or your deployment environment:

```jsonc
{
  "vars": {
    "PCO_ENABLE_WRITE_TOOLS": "true"
  }
}
```

The `schedule_person` tool still defaults to `dry_run: true`. A real write requires `dry_run: false` and `confirm: "schedule-person"`.

## Security Notes

- Do not deploy with `MCP_REQUIRE_AUTH=false` when real Planning Center credentials are configured.
- Use a Planning Center account with the minimum Services permissions needed for the teams you schedule.
- Start with `PCO_ENABLE_WRITE_TOOLS=false` until read-only tools are working.
- Keep `.dev.vars`, `.env*`, and logs out of git.

## References

- Planning Center API docs: https://api.planningcenteronline.com/docs/
- Planning Center Services API: https://api.planningcenteronline.com/docs/apps/services/versions/2018-11-01
- Cloudflare remote MCP guide: https://developers.cloudflare.com/agents/guides/remote-mcp-server/
