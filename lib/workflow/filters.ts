import type { ActionFilters, AuditFilters, WorkflowStatus } from "./types";

const actionTypes = new Set(["all", "decide", "delegate", "flag"]);
const actionStatuses = new Set(["all", "active", "open", "in_progress", "waiting", "completed", "dismissed"]);
const priorities = new Set(["all", "urgent", "high", "medium", "low"]);
const actionSorts = new Set(["urgency", "deadline", "updated"]);

export const defaultActionFilters: ActionFilters = {
  type: "all",
  status: "active",
  priority: "all",
  flagged: false,
  q: "",
  sort: "urgency"
};

export function parseActionFilters(params: URLSearchParams): ActionFilters {
  const type = params.get("type") ?? defaultActionFilters.type;
  const status = params.get("status") ?? defaultActionFilters.status;
  const priority = params.get("priority") ?? defaultActionFilters.priority;
  const sort = params.get("sort") ?? defaultActionFilters.sort;

  return {
    type: actionTypes.has(type) ? (type as ActionFilters["type"]) : defaultActionFilters.type,
    status: actionStatuses.has(status) ? (status as ActionFilters["status"]) : defaultActionFilters.status,
    priority: priorities.has(priority) ? (priority as ActionFilters["priority"]) : defaultActionFilters.priority,
    flagged: params.get("flagged") === "true",
    q: params.get("q") ?? "",
    sort: actionSorts.has(sort) ? (sort as ActionFilters["sort"]) : defaultActionFilters.sort
  };
}

export function actionFilterToParams(filters: Partial<ActionFilters>) {
  const params = new URLSearchParams();
  params.set("view", "actions");

  const merged = { ...defaultActionFilters, ...filters };
  if (merged.type !== "all") {
    params.set("type", merged.type);
  }
  if (merged.status !== "active") {
    params.set("status", merged.status);
  } else {
    params.set("status", "active");
  }
  if (merged.priority !== "all") {
    params.set("priority", merged.priority);
  }
  if (merged.flagged) {
    params.set("flagged", "true");
  }
  if (merged.q) {
    params.set("q", merged.q);
  }
  if (merged.sort !== "urgency") {
    params.set("sort", merged.sort);
  }

  return `?${params.toString()}`;
}

const categories = new Set(["all", "ignore", "delegate", "decide"]);
const channels = new Set(["all", "email", "slack", "whatsapp", "other"]);
const auditViews = new Set(["messages", "threads"]);

export const defaultAuditFilters: AuditFilters = {
  view: "messages",
  category: "all",
  lifecycle: [],
  channel: "all",
  thread: null,
  flagged: false,
  q: ""
};

export function parseAuditFilters(params: URLSearchParams): AuditFilters {
  const view = params.get("auditView") ?? defaultAuditFilters.view;
  const category = params.get("category") ?? defaultAuditFilters.category;
  const channel = params.get("channel") ?? defaultAuditFilters.channel;
  const lifecycle = (params.get("lifecycle") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => ["active", "superseded", "resolved", "informational"].includes(value));

  return {
    view: auditViews.has(view) ? (view as AuditFilters["view"]) : defaultAuditFilters.view,
    category: categories.has(category) ? (category as AuditFilters["category"]) : defaultAuditFilters.category,
    lifecycle,
    channel: channels.has(channel) ? (channel as AuditFilters["channel"]) : defaultAuditFilters.channel,
    thread: params.get("thread"),
    flagged: params.get("flagged") === "true",
    q: params.get("q") ?? ""
  };
}

export function auditFilterToParams(filters: Partial<AuditFilters>) {
  const params = new URLSearchParams();
  params.set("view", "audit");
  const merged = { ...defaultAuditFilters, ...filters };

  if (merged.view !== "messages") {
    params.set("auditView", merged.view);
  }
  if (merged.category !== "all") {
    params.set("category", merged.category);
  }
  if (merged.channel !== "all") {
    params.set("channel", merged.channel);
  }
  if (merged.lifecycle.length > 0) {
    params.set("lifecycle", merged.lifecycle.join(","));
  }
  if (merged.thread) {
    params.set("thread", merged.thread);
  }
  if (merged.flagged) {
    params.set("flagged", "true");
  }
  if (merged.q) {
    params.set("q", merged.q);
  }

  return `?${params.toString()}`;
}

export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return actionStatuses.has(value) && !["all", "active"].includes(value);
}
