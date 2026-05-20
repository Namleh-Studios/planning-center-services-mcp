import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { filterPeopleByName, formatDocument } from "./format";
import {
  PlanningCenterApiError,
  PlanningCenterClient,
  fetchOpenApiDocument,
  planningCenterAppMetadata,
  planningCenterApps,
  planningCenterOpenApiUrl,
  type PlanningCenterApp,
  type PlanningCenterDocument,
  type OpenApiDocument,
  type OpenApiOperation,
  type OpenApiPathItem,
  type PlanningCenterWriteBody,
  resourceArray
} from "./planning-center";
import { errorResult, jsonResult } from "./result";

const idSchema = z.string().regex(/^\d+$/, "Planning Center IDs are numeric strings.");
const appSchema = z.enum(planningCenterApps);
const apiPathSchema = z
  .string()
  .min(1)
  .regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/, "Use an app-relative API path beginning with '/'.")
  .refine((path) => !path.includes("..") && !path.includes("//"), "Path cannot contain '..' or '//'.");
const openApiPathSchema = z
  .string()
  .min(1)
  .regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@/{}-]*$/, "Use an app-relative OpenAPI path beginning with '/'.")
  .refine((path) => !path.includes("..") && !path.includes("//"), "Path cannot contain '..' or '//'.");
const perPageSchema = z.number().int().min(1).max(100).default(25);
const maxPagesSchema = z.number().int().min(1).max(10).default(1);
const jsonRecordSchema = z.record(z.string(), z.unknown());
const scalarQuerySchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const httpMethodSchema = z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]);
const apiVersionSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a Planning Center API version date like 2025-11-10.");

export function createPlanningCenterMcpServer(env: Env): McpServer {
  const client = new PlanningCenterClient(env);
  const server = new McpServer({
    name: "planning-center",
    version: "0.2.0"
  });

  server.tool("pco_status", "Report MCP and Planning Center API configuration without secret values.", {}, async () =>
    jsonResult({
      server: "planning-center-mcp",
      mode: "cloudflare-worker",
      ...client.status()
    })
  );

  server.tool(
    "planning_center_apps_list",
    "List Planning Center API products supported by the generic tools, with app slugs and docs URLs.",
    {},
    async () =>
      jsonResult({
        apps: planningCenterApps.map((app) => ({
          app,
          label: planningCenterAppMetadata[app].label,
          base_path: `/${app}/v2`,
          oauth_scope: planningCenterAppMetadata[app].oauth_scope,
          latest_version: planningCenterAppMetadata[app].latest_version,
          docs_url: planningCenterAppMetadata[app].docs_url,
          openapi_url: planningCenterOpenApiUrl(app)
        }))
      })
  );

  server.tool(
    "planning_center_openapi_search",
    "Search Planning Center's official OpenAPI description for one product to discover resources, endpoints, methods, query parameters, and request bodies.",
    {
      app: appSchema,
      version: apiVersionSchema.optional().describe("Optional API version. Defaults to the latest version known to this MCP build."),
      query: z.string().min(1).optional().describe("Search text matched against paths, tags, summaries, and descriptions."),
      method: httpMethodSchema.optional(),
      path: openApiPathSchema.optional().describe("Optional exact app-relative API path such as '/people' or '/service_types/{service_type_id}/plans'."),
      limit: z.number().int().min(1).max(50).default(20)
    },
    async ({ app, version, query, method, path, limit }) =>
      callTool(async () => summarizeOpenApi(await fetchOpenApiDocument(env, app, version), { app, version, query, method, path, limit }))
  );

  server.tool(
    "planning_center_get",
    "Run a read-only GET request against any Planning Center product. Path is app-relative, for example app='people' path='/people' or app='groups' path='/groups'.",
    {
      app: appSchema,
      path: apiPathSchema,
      include: z.array(z.string()).optional(),
      filter: z.array(z.string()).optional(),
      order: z.string().optional(),
      per_page: perPageSchema,
      offset: z.number().int().min(0).optional(),
      after: z.string().optional(),
      before: z.string().optional(),
      where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
      extra_query: z.record(z.string(), scalarQuerySchema).optional(),
      formatted: z.boolean().default(true).describe("Return shaped JSON:API resources when true; return raw document when false.")
    },
    async ({ app, path, include, filter, order, per_page, offset, after, before, where, fields, extra_query, formatted }) =>
      callTool(async () => {
        const document = await client.get(
          path,
          {
            include,
            filter,
            order,
            perPage: per_page,
            offset,
            after,
            before,
            where,
            fields,
            extra: extra_query
          },
          app
        );

        return formatted ? formatDocument(document) : document;
      })
  );

  server.tool(
    "planning_center_create",
    "Create a JSON:API resource in any Planning Center product. Defaults to dry_run. Real writes require PCO_ENABLE_WRITE_TOOLS=true, dry_run=false, and confirm='planning-center-write'.",
    {
      app: appSchema,
      path: apiPathSchema,
      type: z.string().min(1),
      attributes: jsonRecordSchema.default({}),
      relationships: jsonRecordSchema.optional(),
      dry_run: z.boolean().default(true),
      confirm: z.string().optional().describe("Must be exactly 'planning-center-write' for a real write.")
    },
    async ({ app, path, type, attributes, relationships, dry_run, confirm }) =>
      callTool(async () => {
        const body = writeBody({ type, attributes, relationships });
        return genericWrite({
          env,
          dryRun: dry_run,
          confirm,
          app,
          method: "POST",
          path,
          body,
          execute: () => client.post(path, body, app)
        });
      })
  );

  server.tool(
    "planning_center_update",
    "Patch a JSON:API resource in any Planning Center product. Defaults to dry_run. Real writes require PCO_ENABLE_WRITE_TOOLS=true, dry_run=false, and confirm='planning-center-write'.",
    {
      app: appSchema,
      path: apiPathSchema,
      type: z.string().min(1),
      id: z.string().optional(),
      attributes: jsonRecordSchema.default({}),
      relationships: jsonRecordSchema.optional(),
      dry_run: z.boolean().default(true),
      confirm: z.string().optional().describe("Must be exactly 'planning-center-write' for a real write.")
    },
    async ({ app, path, type, id, attributes, relationships, dry_run, confirm }) =>
      callTool(async () => {
        const body = writeBody({ type, id, attributes, relationships });
        return genericWrite({
          env,
          dryRun: dry_run,
          confirm,
          app,
          method: "PATCH",
          path,
          body,
          execute: () => client.patch(path, body, app)
        });
      })
  );

  server.tool(
    "planning_center_delete",
    "Delete a resource in any Planning Center product. Defaults to dry_run. Real deletes require PCO_ENABLE_WRITE_TOOLS=true, dry_run=false, and confirm='planning-center-write'.",
    {
      app: appSchema,
      path: apiPathSchema,
      dry_run: z.boolean().default(true),
      confirm: z.string().optional().describe("Must be exactly 'planning-center-write' for a real delete.")
    },
    async ({ app, path, dry_run, confirm }) =>
      callTool(async () =>
        genericWrite({
          env,
          dryRun: dry_run,
          confirm,
          app,
          method: "DELETE",
          path,
          execute: () => client.delete(path, app)
        })
      )
  );

  server.tool(
    "service_types_list",
    "List Planning Center Services service types. Use this first to find the service_type_id needed by plan and team tools.",
    {
      name: z.string().min(1).optional().describe("Optional exact service type name filter."),
      parent_id: idSchema.optional().describe("Optional folder parent ID."),
      order: z.enum(["name", "-name", "sequence", "-sequence"]).default("sequence"),
      per_page: perPageSchema
    },
    async ({ name, parent_id, order, per_page }) =>
      callTool(async () =>
        formatDocument(
          await client.get("/service_types", {
            order,
            perPage: per_page,
            where: omitUndefined({ name, parent_id })
          })
        )
      )
  );

  server.tool(
    "plans_list",
    "List plans for a service type. Supports future/past/no_dates filters and optional date bounds.",
    {
      service_type_id: idSchema,
      filter: z.enum(["future", "past", "no_dates"]).optional(),
      after: z.string().datetime().optional().describe("ISO8601 lower bound for plans beginning after this time."),
      before: z.string().datetime().optional().describe("ISO8601 upper bound for plans beginning before this time."),
      include_plan_times: z.boolean().default(false),
      order: z.enum(["sort_date", "-sort_date", "title", "-title", "created_at", "-created_at"]).default("sort_date"),
      per_page: perPageSchema
    },
    async ({ service_type_id, filter, after, before, include_plan_times, order, per_page }) =>
      callTool(async () =>
        formatDocument(
          await client.get(`/service_types/${service_type_id}/plans`, {
            filter: filter ? [filter] : undefined,
            after,
            before,
            include: include_plan_times ? ["plan_times"] : undefined,
            order,
            perPage: per_page
          })
        )
      )
  );

  server.tool(
    "plan_get",
    "Get one plan by service_type_id and plan_id.",
    {
      service_type_id: idSchema,
      plan_id: idSchema,
      include_plan_times: z.boolean().default(true),
      include_series: z.boolean().default(false)
    },
    async ({ service_type_id, plan_id, include_plan_times, include_series }) =>
      callTool(async () =>
        formatDocument(
          await client.get(`/service_types/${service_type_id}/plans/${plan_id}`, {
            include: compactArray([include_plan_times ? "plan_times" : undefined, include_series ? "series" : undefined])
          })
        )
      )
  );

  server.tool(
    "teams_list",
    "List teams globally or for a specific service type.",
    {
      service_type_id: idSchema.optional(),
      name: z.string().min(1).optional().describe("Optional exact team name filter."),
      include_team_positions: z.boolean().default(false),
      order: z.enum(["name", "-name", "created_at", "-created_at", "updated_at", "-updated_at"]).default("name"),
      per_page: perPageSchema
    },
    async ({ service_type_id, name, include_team_positions, order, per_page }) =>
      callTool(async () => {
        const path = service_type_id ? `/service_types/${service_type_id}/teams` : "/teams";
        return formatDocument(
          await client.get(path, {
            include: include_team_positions ? ["team_positions"] : undefined,
            order,
            perPage: per_page,
            where: omitUndefined({ name })
          })
        );
      })
  );

  server.tool(
    "team_positions_list",
    "List team positions either for a service type or a team.",
    {
      service_type_id: idSchema.optional(),
      team_id: idSchema.optional(),
      include_team: z.boolean().default(true),
      per_page: perPageSchema
    },
    async ({ service_type_id, team_id, include_team, per_page }) =>
      callTool(async () => {
        if (!service_type_id && !team_id) {
          throw new Error("Provide either service_type_id or team_id.");
        }

        const path = team_id
          ? `/teams/${team_id}/team_positions`
          : `/service_types/${service_type_id}/team_positions`;
        return formatDocument(
          await client.get(path, {
            include: include_team ? ["team"] : undefined,
            order: "name",
            perPage: per_page
          })
        );
      })
  );

  server.tool(
    "needed_positions_list",
    "List unfilled positions needed for a plan.",
    {
      service_type_id: idSchema,
      plan_id: idSchema,
      include_team: z.boolean().default(true),
      include_time: z.boolean().default(true),
      per_page: perPageSchema
    },
    async ({ service_type_id, plan_id, include_team, include_time, per_page }) =>
      callTool(async () =>
        formatDocument(
          await client.get(`/service_types/${service_type_id}/plans/${plan_id}/needed_positions`, {
            include: compactArray([include_team ? "team" : undefined, include_time ? "time" : undefined]),
            perPage: per_page
          })
        )
      )
  );

  server.tool(
    "team_members_list",
    "List people already scheduled to a plan. Use team_id to narrow to one team.",
    {
      service_type_id: idSchema,
      plan_id: idSchema,
      team_id: idSchema.optional(),
      filters: z
        .array(z.enum(["confirmed", "not_archived", "not_declined", "not_deleted"]))
        .default(["not_deleted"]),
      include_person: z.boolean().default(true),
      include_team: z.boolean().default(true),
      per_page: perPageSchema
    },
    async ({ service_type_id, plan_id, team_id, filters, include_person, include_team, per_page }) =>
      callTool(async () =>
        formatDocument(
          await client.get(`/service_types/${service_type_id}/plans/${plan_id}/team_members`, {
            filter: filters,
            include: compactArray([include_person ? "person" : undefined, include_team ? "team" : undefined]),
            perPage: per_page,
            where: omitUndefined({ team_id })
          })
        )
      )
  );

  server.tool(
    "people_list",
    "List Planning Center Services people with scheduling-safe fields. The name query is applied client-side to returned pages.",
    {
      query: z.string().min(1).optional().describe("Optional case-insensitive name search over returned pages."),
      assigned_to_rehearsal_team: z.boolean().optional(),
      order: z.enum(["first_name", "-first_name", "last_name", "-last_name", "updated_at", "-updated_at"]).default("last_name"),
      per_page: perPageSchema,
      max_pages: maxPagesSchema
    },
    async ({ query, assigned_to_rehearsal_team, order, per_page, max_pages }) =>
      callTool(async () => {
        const document = await getPages(client, "/people", {
          order,
          perPage: per_page,
          fields: {
            Person: [
              "full_name",
              "first_name",
              "last_name",
              "status",
              "photo_thumbnail_url",
              "preferred_max_plans_per_day",
              "preferred_max_plans_per_month",
              "passed_background_check"
            ]
          },
          where: omitUndefined({ assigned_to_rehearsal_team })
        }, max_pages);
        return formatDocument({
          ...document,
          data: filterPeopleByName(resourceArray(document), query)
        });
      })
  );

  server.tool(
    "team_position_candidates_list",
    "List people assigned to a team position. Use this to find candidate person IDs for scheduling.",
    {
      service_type_id: idSchema,
      team_position_id: idSchema,
      time_preference_option_ids: z.array(z.string()).optional(),
      include_person: z.boolean().default(true),
      per_page: perPageSchema
    },
    async ({ service_type_id, team_position_id, time_preference_option_ids, include_person, per_page }) =>
      callTool(async () =>
        formatDocument(
          await client.get(
            `/service_types/${service_type_id}/team_positions/${team_position_id}/person_team_position_assignments`,
            {
              include: include_person ? ["person", "team_position"] : ["team_position"],
              perPage: per_page,
              extra: time_preference_option_ids
                ? { "time_preference_option_ids[]": time_preference_option_ids }
                : undefined
            }
          )
        )
      )
  );

  server.tool(
    "person_schedules_list",
    "List a person's schedules, useful for avoiding over-scheduling or seeing declines.",
    {
      person_id: idSchema,
      filter: z.enum(["future", "past", "all", "with_declined", "not_across_organizations"]).default("future"),
      after: z.string().datetime().optional(),
      before: z.string().datetime().optional(),
      include_plan_times: z.boolean().default(false),
      order: z.enum(["starts_at", "-starts_at"]).default("starts_at"),
      per_page: perPageSchema
    },
    async ({ person_id, filter, after, before, include_plan_times, order, per_page }) =>
      callTool(async () =>
        formatDocument(
          await client.get(`/people/${person_id}/schedules`, {
            filter: [filter],
            after,
            before,
            include: include_plan_times ? ["plan_times"] : undefined,
            order,
            perPage: per_page
          })
        )
      )
  );

  server.tool(
    "person_blockouts_list",
    "List a person's blockouts.",
    {
      person_id: idSchema,
      filter: z.enum(["future", "past"]).default("future"),
      per_page: perPageSchema
    },
    async ({ person_id, filter, per_page }) =>
      callTool(async () =>
        formatDocument(
          await client.get(`/people/${person_id}/blockouts`, {
            filter: [filter],
            perPage: per_page
          })
        )
      )
  );

  server.tool(
    "schedule_person",
    "Schedule a person to a Planning Center Services plan. Defaults to dry_run. Real writes require PCO_ENABLE_WRITE_TOOLS=true, dry_run=false, and confirm='schedule-person'.",
    {
      service_type_id: idSchema,
      plan_id: idSchema,
      person_id: idSchema,
      team_id: idSchema,
      team_position_name: z.string().min(1),
      status: z.enum(["Unconfirmed", "Confirmed", "Declined", "U", "C", "D"]).default("Unconfirmed"),
      notes: z.string().max(1000).optional(),
      prepare_notification: z.boolean().default(false),
      responds_to_id: idSchema.optional(),
      dry_run: z.boolean().default(true),
      confirm: z.string().optional().describe("Must be exactly 'schedule-person' for a real write.")
    },
    async ({
      service_type_id,
      plan_id,
      person_id,
      team_id,
      team_position_name,
      status,
      notes,
      prepare_notification,
      responds_to_id,
      dry_run,
      confirm
    }) =>
      callTool(async () => {
        const body = {
          type: "PlanPerson",
          attributes: omitUndefined({
            person_id,
            team_id,
            status,
            notes,
            team_position_name,
            responds_to_id,
            prepare_notification
          })
        };
        const endpoint = `/service_types/${service_type_id}/plans/${plan_id}/team_members`;

        if (dry_run) {
          return {
            dry_run: true,
            write_enabled: env.PCO_ENABLE_WRITE_TOOLS === "true",
            endpoint,
            body
          };
        }

        if (env.PCO_ENABLE_WRITE_TOOLS !== "true") {
          throw new Error("Write tools are disabled. Set PCO_ENABLE_WRITE_TOOLS=true for this deployment.");
        }

        if (confirm !== "schedule-person") {
          throw new Error("Real scheduling requires confirm to be exactly 'schedule-person'.");
        }

        return formatDocument(await client.post(endpoint, body));
      })
  );

  return server;
}

async function callTool(work: () => Promise<unknown>) {
  try {
    return jsonResult(await work());
  } catch (error) {
    if (error instanceof PlanningCenterApiError) {
      return errorResult(error.message, error.body);
    }

    return errorResult(error instanceof Error ? error.message : "Unknown error");
  }
}

async function getPages(
  client: PlanningCenterClient,
  path: string,
  query: Parameters<PlanningCenterClient["get"]>[1],
  maxPages: number
): Promise<PlanningCenterDocument> {
  const perPage = query?.perPage ?? 25;
  const documents: PlanningCenterDocument[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    documents.push(await client.get(path, { ...query, offset: page * perPage }));
  }

  return {
    data: documents.flatMap((document) => resourceArray(document)),
    included: documents.flatMap((document) => document.included ?? []),
    meta: documents.at(-1)?.meta,
    links: documents.at(-1)?.links
  };
}

function omitUndefined(input: Record<string, string | number | boolean | undefined>): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
  );
}

function compactArray(values: Array<string | undefined>): string[] | undefined {
  const filtered = values.filter((value): value is string => Boolean(value));
  return filtered.length > 0 ? filtered : undefined;
}

function summarizeOpenApi(
  document: OpenApiDocument,
  options: {
    app: PlanningCenterApp;
    version?: string;
    query?: string;
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    path?: string;
    limit: number;
  }
) {
  const method = options.method?.toLowerCase() as keyof OpenApiPathItem | undefined;
  const normalizedQuery = options.query?.trim().toLowerCase();
  const endpoints = Object.entries(document.paths ?? {})
    .filter(([path, pathItem]) => {
      if (options.path && path !== options.path) {
        return false;
      }

      if (method && !pathItem[method]) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return endpointSearchText(path, pathItem).includes(normalizedQuery);
    })
    .slice(0, options.limit)
    .map(([path, pathItem]) => ({
      path,
      summary: pathItem.summary,
      description: trimText(pathItem.description),
      operations: summarizeOperations(pathItem, method)
    }));

  return {
    app: options.app,
    label: planningCenterAppMetadata[options.app].label,
    requested_version: options.version ?? planningCenterAppMetadata[options.app].latest_version,
    document: {
      title: document.info?.title,
      version: document.info?.version,
      pco_api_version: document.info?.["x-pco-api-version"],
      openapi: document.openapi,
      servers: document.servers
    },
    tags: (document.tags ?? []).map((tag) => ({
      name: tag.name,
      description: trimText(tag.description)
    })),
    endpoints,
    endpoint_count: Object.keys(document.paths ?? {}).length,
    returned_count: endpoints.length,
    openapi_url: planningCenterOpenApiUrl(options.app, options.version ?? planningCenterAppMetadata[options.app].latest_version)
  };
}

function summarizeOperations(pathItem: OpenApiPathItem, method?: keyof OpenApiPathItem) {
  const methods: Array<keyof OpenApiPathItem> = method
    ? [method]
    : ["get", "post", "patch", "put", "delete"];

  return methods
    .map((candidate) => {
      const operation = pathItem[candidate];
      if (!operation || typeof operation !== "object") {
        return undefined;
      }

      return {
        method: candidate.toUpperCase(),
        tags: operation.tags ?? [],
        summary: operation.summary,
        description: trimText(operation.description),
        parameters: (operation.parameters ?? []).map(summarizeParameter),
        has_request_body: Boolean(operation.requestBody),
        response_statuses: Object.keys(operation.responses ?? {})
      };
    })
    .filter((operation): operation is NonNullable<typeof operation> => Boolean(operation));
}

function summarizeParameter(parameter: unknown) {
  if (!isRecord(parameter)) {
    return { value: parameter };
  }

  if (typeof parameter.$ref === "string") {
    return { ref: parameter.$ref };
  }

  return {
    name: parameter.name,
    in: parameter.in,
    required: parameter.required,
    description: trimText(typeof parameter.description === "string" ? parameter.description : undefined)
  };
}

function endpointSearchText(path: string, pathItem: OpenApiPathItem): string {
  const operations = summarizeOperations(pathItem);
  return [
    path,
    pathItem.summary,
    pathItem.description,
    ...operations.flatMap((operation) => [
      operation.method,
      operation.summary,
      operation.description,
      ...operation.tags
    ])
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function trimText(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 280 ? `${normalized.slice(0, 277)}...` : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function genericWrite(options: {
  env: Env;
  dryRun: boolean;
  confirm?: string;
  app: PlanningCenterApp;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: PlanningCenterWriteBody;
  execute: () => Promise<PlanningCenterDocument>;
}) {
  const preview = {
    dry_run: true,
    write_enabled: options.env.PCO_ENABLE_WRITE_TOOLS === "true",
    app: options.app,
    method: options.method,
    path: options.path,
    body: options.body
  };

  if (options.dryRun) {
    return preview;
  }

  if (options.env.PCO_ENABLE_WRITE_TOOLS !== "true") {
    throw new Error("Write tools are disabled. Set PCO_ENABLE_WRITE_TOOLS=true for this deployment.");
  }

  if (options.confirm !== "planning-center-write") {
    throw new Error("Real generic writes require confirm to be exactly 'planning-center-write'.");
  }

  const document = await options.execute();
  return formatDocument(document);
}

function writeBody(input: {
  type: string;
  id?: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}): PlanningCenterWriteBody {
  return {
    type: input.type,
    ...(input.id ? { id: input.id } : {}),
    attributes: input.attributes,
    ...(input.relationships ? { relationships: input.relationships } : {})
  };
}
