import type { PlanningCenterDocument, PlanningCenterResource, RelationshipData } from "./planning-center";

type Formatter = (resource: PlanningCenterResource) => Record<string, unknown>;

const formatters: Record<string, Formatter> = {
  ServiceType: (resource) => pickResource(resource, ["name", "frequency", "permissions", "archived_at"]),
  Plan: (resource) =>
    pickResource(resource, [
      "title",
      "dates",
      "short_dates",
      "sort_date",
      "series_title",
      "needed_positions_count",
      "plan_people_count",
      "planning_center_url",
      "public"
    ]),
  Team: (resource) =>
    pickResource(resource, [
      "name",
      "schedule_to",
      "default_status",
      "rehearsal_team",
      "secure_team",
      "archived_at"
    ]),
  TeamPosition: (resource) => pickResource(resource, ["name", "sequence"]),
  NeededPosition: (resource) => pickResource(resource, ["quantity", "scheduled_to", "team_position_name"]),
  PlanPerson: (resource) =>
    pickResource(resource, [
      "name",
      "status",
      "team_position_name",
      "prepare_notification",
      "notification_prepared_at",
      "notification_sent_at"
    ]),
  Person: (resource) =>
    pickResource(resource, [
      "full_name",
      "first_name",
      "last_name",
      "status",
      "photo_thumbnail_url",
      "preferred_max_plans_per_day",
      "preferred_max_plans_per_month",
      "passed_background_check"
    ]),
  PersonTeamPositionAssignment: (resource) =>
    pickResource(resource, ["schedule_preference", "preferred_weeks"]),
  Schedule: (resource) =>
    pickResource(resource, [
      "person_name",
      "service_type_name",
      "team_name",
      "team_position_name",
      "dates",
      "short_dates",
      "sort_date",
      "status",
      "decline_reason",
      "position_display_times"
    ]),
  Blockout: (resource) =>
    pickResource(resource, ["starts_at", "ends_at", "reason", "repeat_frequency", "time_zone"])
};

export function formatDocument(document: PlanningCenterDocument, options: { includeRaw?: boolean } = {}) {
  const data = Array.isArray(document.data)
    ? document.data.map((resource) => formatResource(resource, options))
    : document.data
      ? formatResource(document.data, options)
      : null;

  return {
    data,
    included: document.included?.map((resource) => formatResource(resource, options)) ?? [],
    meta: document.meta,
    links: document.links
  };
}

export function formatResource(
  resource: PlanningCenterResource,
  options: { includeRaw?: boolean } = {}
): Record<string, unknown> {
  const formatter = formatters[resource.type] ?? formatUnknownResource;
  const formatted = formatter(resource);

  return {
    type: resource.type,
    id: resource.id,
    ...formatted,
    relationships: compactRelationships(resource),
    ...(options.includeRaw ? { raw: resource } : {})
  };
}

function formatUnknownResource(resource: PlanningCenterResource): Record<string, unknown> {
  return {
    attributes: resource.attributes ?? {}
  };
}

export function filterPeopleByName(resources: PlanningCenterResource[], query?: string): PlanningCenterResource[] {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) {
    return resources;
  }

  return resources.filter((resource) => {
    const attributes = resource.attributes ?? {};
    return [attributes.full_name, attributes.first_name, attributes.last_name]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalized));
  });
}

function pickResource(resource: PlanningCenterResource, keys: string[]): Record<string, unknown> {
  const attributes = resource.attributes ?? {};
  const output: Record<string, unknown> = {};

  for (const key of keys) {
    if (attributes[key] !== undefined) {
      output[key] = attributes[key];
    }
  }

  return output;
}

function compactRelationships(resource: PlanningCenterResource): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [name, relationship] of Object.entries(resource.relationships ?? {})) {
    if (!relationship.data) {
      continue;
    }

    output[name] = Array.isArray(relationship.data)
      ? relationship.data.map(compactRelationshipData)
      : compactRelationshipData(relationship.data);
  }

  return output;
}

function compactRelationshipData(data: RelationshipData): RelationshipData {
  return {
    type: data.type,
    id: data.id
  };
}
