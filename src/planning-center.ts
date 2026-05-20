export type PlanningCenterResource = {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, Relationship>;
};

export type PlanningCenterDocument = {
  data?: PlanningCenterResource | PlanningCenterResource[] | null;
  included?: PlanningCenterResource[];
  meta?: Record<string, unknown>;
  links?: Record<string, unknown>;
};

export type Relationship = {
  data?: RelationshipData | RelationshipData[] | null;
};

export type RelationshipData = {
  type: string;
  id: string;
};

export type RequestOptions = {
  query?: QueryParams;
  body?: PlanningCenterWriteBody;
};

export const planningCenterApps = [
  "api",
  "calendar",
  "check-ins",
  "current",
  "giving",
  "groups",
  "people",
  "publishing",
  "registrations",
  "services",
  "webhooks"
] as const;

export type PlanningCenterApp = (typeof planningCenterApps)[number];

export type PlanningCenterAppMetadata = {
  app: PlanningCenterApp;
  label: string;
  oauth_scope?: string;
  latest_version: string;
  docs_url: string;
};

export const planningCenterAppMetadata: Record<PlanningCenterApp, PlanningCenterAppMetadata> = {
  api: {
    app: "api",
    label: "API",
    oauth_scope: "api",
    latest_version: "2025-09-30",
    docs_url: "https://api.planningcenteronline.com/docs/apps/api"
  },
  calendar: {
    app: "calendar",
    label: "Calendar",
    oauth_scope: "calendar",
    latest_version: "2022-07-07",
    docs_url: "https://api.planningcenteronline.com/docs/apps/calendar"
  },
  "check-ins": {
    app: "check-ins",
    label: "Check-Ins",
    oauth_scope: "check_ins",
    latest_version: "2025-05-28",
    docs_url: "https://api.planningcenteronline.com/docs/apps/check-ins"
  },
  current: {
    app: "current",
    label: "Current",
    latest_version: "2018-08-01",
    docs_url: "https://api.planningcenteronline.com/docs/apps/current"
  },
  giving: {
    app: "giving",
    label: "Giving",
    oauth_scope: "giving",
    latest_version: "2019-10-18",
    docs_url: "https://api.planningcenteronline.com/docs/apps/giving"
  },
  groups: {
    app: "groups",
    label: "Groups",
    oauth_scope: "groups",
    latest_version: "2023-07-10",
    docs_url: "https://api.planningcenteronline.com/docs/apps/groups"
  },
  people: {
    app: "people",
    label: "People",
    oauth_scope: "people",
    latest_version: "2025-11-10",
    docs_url: "https://api.planningcenteronline.com/docs/apps/people"
  },
  publishing: {
    app: "publishing",
    label: "Publishing",
    oauth_scope: "publishing",
    latest_version: "2024-03-25",
    docs_url: "https://api.planningcenteronline.com/docs/apps/publishing"
  },
  registrations: {
    app: "registrations",
    label: "Registrations",
    oauth_scope: "registrations",
    latest_version: "2025-05-01",
    docs_url: "https://api.planningcenteronline.com/docs/apps/registrations"
  },
  services: {
    app: "services",
    label: "Services",
    oauth_scope: "services",
    latest_version: "2018-11-01",
    docs_url: "https://api.planningcenteronline.com/docs/apps/services"
  },
  webhooks: {
    app: "webhooks",
    label: "Webhooks",
    latest_version: "2022-10-20",
    docs_url: "https://api.planningcenteronline.com/docs/apps/webhooks"
  }
};

export type QueryParams = {
  include?: string[];
  filter?: string[];
  order?: string;
  perPage?: number;
  offset?: number;
  after?: string;
  before?: string;
  fields?: Record<string, string[]>;
  where?: Record<string, string | number | boolean>;
  extra?: Record<string, string | number | boolean | string[]>;
};

export type PlanningCenterWriteBody = {
  type: string;
  id?: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, unknown>;
};

export type OpenApiDocument = {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
    "x-pco-api-version"?: string;
  };
  servers?: Array<{ url?: string }>;
  tags?: Array<{ name?: string; description?: string }>;
  paths?: Record<string, OpenApiPathItem>;
};

export type OpenApiPathItem = {
  summary?: string;
  description?: string;
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  patch?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
};

export type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
};

type Fetcher = typeof fetch;

export class PlanningCenterClient {
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(
    private readonly env: Env,
    fetcher: Fetcher = fetch
  ) {
    this.baseUrl = (env.PCO_API_BASE_URL ?? "https://api.planningcenteronline.com").replace(
      /\/+$/g,
      ""
    );
    this.fetcher = fetcher;
  }

  status() {
    return {
      api_base_url: this.baseUrl,
      has_access_token: Boolean(this.env.PCO_ACCESS_TOKEN),
      has_app_id_and_secret: Boolean(this.env.PCO_APP_ID && this.env.PCO_SECRET),
      write_tools_enabled: this.env.PCO_ENABLE_WRITE_TOOLS === "true",
      mcp_auth_required: this.env.MCP_REQUIRE_AUTH?.toLowerCase() !== "false",
      has_mcp_auth_token: Boolean(this.env.MCP_AUTH_TOKEN)
    };
  }

  async get(path: string, query?: QueryParams, app: PlanningCenterApp = "services"): Promise<PlanningCenterDocument> {
    return this.request("GET", app, path, { query });
  }

  async post(path: string, body: PlanningCenterWriteBody, app: PlanningCenterApp = "services"): Promise<PlanningCenterDocument> {
    return this.request("POST", app, path, { body });
  }

  async patch(path: string, body: PlanningCenterWriteBody, app: PlanningCenterApp = "services"): Promise<PlanningCenterDocument> {
    return this.request("PATCH", app, path, { body });
  }

  async delete(path: string, app: PlanningCenterApp = "services"): Promise<PlanningCenterDocument> {
    return this.request("DELETE", app, path);
  }

  async request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    app: PlanningCenterApp,
    path: string,
    options: RequestOptions = {}
  ): Promise<PlanningCenterDocument> {
    if (!planningCenterApps.includes(app)) {
      throw new Error(`Unsupported Planning Center app: ${app}`);
    }

    if (!path.startsWith("/") || path.includes("..") || path.includes("//")) {
      throw new Error(`Invalid Planning Center API path: ${path}`);
    }

    const url = new URL(`${this.baseUrl}/${app}/v2${path}`);
    applyQuery(url, options.query);

    const response = await this.fetcher(url.toString(), {
      method,
      headers: this.headers(Boolean(options.body)),
      body: options.body ? JSON.stringify({ data: options.body }) : undefined
    });

    const text = await response.text();
    const parsed = text.length > 0 ? parseJson(text) : {};
    if (!response.ok) {
      throw new PlanningCenterApiError(response.status, parsed);
    }

    return parsed as PlanningCenterDocument;
  }

  private headers(hasBody: boolean): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/vnd.api+json",
      "User-Agent": "planning-center-mcp/0.2.0"
    };

    if (hasBody) {
      headers["Content-Type"] = "application/vnd.api+json";
    }

    if (this.env.PCO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${this.env.PCO_ACCESS_TOKEN}`;
      return headers;
    }

    if (!this.env.PCO_APP_ID || !this.env.PCO_SECRET) {
      throw new Error("Configure PCO_ACCESS_TOKEN or PCO_APP_ID plus PCO_SECRET.");
    }

    headers.Authorization = `Basic ${btoa(`${this.env.PCO_APP_ID}:${this.env.PCO_SECRET}`)}`;
    return headers;
  }
}

export async function fetchOpenApiDocument(
  env: Env,
  app: PlanningCenterApp,
  version = planningCenterAppMetadata[app].latest_version,
  fetcher: Fetcher = fetch
): Promise<OpenApiDocument> {
  if (!planningCenterApps.includes(app)) {
    throw new Error(`Unsupported Planning Center app: ${app}`);
  }

  const baseUrl = (env.PCO_API_BASE_URL ?? "https://api.planningcenteronline.com").replace(/\/+$/g, "");
  const url = `${baseUrl}/${app}/v2/open_api/${version}`;
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "planning-center-mcp/0.2.0"
    }
  });
  const text = await response.text();
  const parsed = text.length > 0 ? parseJson(text) : {};

  if (!response.ok) {
    throw new PlanningCenterApiError(response.status, parsed);
  }

  return parsed as OpenApiDocument;
}

export function planningCenterOpenApiUrl(app: PlanningCenterApp, version = planningCenterAppMetadata[app].latest_version): string {
  return `https://api.planningcenteronline.com/${app}/v2/open_api/${version}`;
}

export class PlanningCenterApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super(`Planning Center API returned ${status}.`);
  }
}

export function resourceArray(document: PlanningCenterDocument): PlanningCenterResource[] {
  if (!Array.isArray(document.data)) {
    return [];
  }

  return document.data;
}

export function singleResource(document: PlanningCenterDocument): PlanningCenterResource | undefined {
  if (!document.data || Array.isArray(document.data)) {
    return undefined;
  }

  return document.data;
}

function applyQuery(url: URL, query?: QueryParams): void {
  if (!query) {
    return;
  }

  for (const include of query.include ?? []) {
    url.searchParams.set("include", appendParam(url.searchParams.get("include"), include));
  }

  if (query.filter && query.filter.length > 0) {
    url.searchParams.set("filter", query.filter.join(","));
  }

  if (query.order) {
    url.searchParams.set("order", query.order);
  }

  if (query.perPage) {
    url.searchParams.set("per_page", String(query.perPage));
  }

  if (query.offset) {
    url.searchParams.set("offset", String(query.offset));
  }

  if (query.after) {
    url.searchParams.set("after", query.after);
  }

  if (query.before) {
    url.searchParams.set("before", query.before);
  }

  for (const [type, fields] of Object.entries(query.fields ?? {})) {
    url.searchParams.set(`fields[${type}]`, fields.join(","));
  }

  for (const [key, value] of Object.entries(query.where ?? {})) {
    url.searchParams.set(`where[${key}]`, String(value));
  }

  for (const [key, value] of Object.entries(query.extra ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

function appendParam(current: string | null, next: string): string {
  return current ? `${current},${next}` : next;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
