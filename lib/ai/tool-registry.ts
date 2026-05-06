/**
 * BIZOSTO AI TOOL REGISTRY
 *
 * Single source of truth for every tool an AI agent can call.
 * The LLM receives tool definitions from this registry.
 * No tool executes without going through the backend API layer.
 *
 * Phases:
 *   Phase 1B — COO agent uses READ_ONLY tools only
 *   Phase 2  — Finance/Sales agents unlock WRITE tools (approval-gated)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolPhase = "1b" | "2" | "3";

export type ToolAccess = "read_only" | "write";

export type JsonSchemaProperty = {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: { type: string };
  default?: unknown;
};

export type AgentTool = {
  /** Unique snake_case name the LLM uses to call this tool */
  name: string;
  /** Plain-English description for the LLM — be specific */
  description: string;
  /** JSON Schema for the tool's input parameters */
  parameters: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
  };
  /** Read-only tools never mutate data */
  access: ToolAccess;
  /** If true, a human must approve before execution */
  requiresApproval: boolean;
  /** Which agent roles can use this tool */
  allowedAgents: string[];
  /** Which plan tier is required */
  requiredPlan: "pro" | "enterprise";
  /** Which phase this tool is available in */
  phase: ToolPhase;
  /** Internal API endpoint this tool calls */
  endpoint: string;
  /** HTTP method for the endpoint */
  method: "GET" | "POST" | "PATCH" | "DELETE";
};

// ─── Tool Registry ────────────────────────────────────────────────────────────

export const TOOL_REGISTRY: AgentTool[] = [

  // ── PHASE 1B: COO / Admin Agent — READ ONLY ──────────────────────────────

  {
    name: "get_business_summary",
    description:
      "Fetches a high-level summary of the business including total revenue (MRR), number of active clients, open leads, projects in progress, and overdue invoices. Use this as the starting point for daily briefings.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    access: "read_only",
    requiresApproval: false,
    allowedAgents: ["coo", "admin"],
    requiredPlan: "pro",
    phase: "1b",
    endpoint: "/api/ai/tools/business-summary",
    method: "GET",
  },

  {
    name: "get_overdue_invoices",
    description:
      "Returns a list of invoices that are past their due date and unpaid. Includes client name, invoice number, amount, and how many days overdue. Use to identify collection priorities.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of invoices to return. Default is 10.",
          default: 10,
        },
      },
      required: [],
    },
    access: "read_only",
    requiresApproval: false,
    allowedAgents: ["coo", "admin", "finance"],
    requiredPlan: "pro",
    phase: "1b",
    endpoint: "/api/ai/tools/overdue-invoices",
    method: "GET",
  },

  {
    name: "get_open_leads",
    description:
      "Returns open sales leads grouped by stage (New, Contacted, Qualified, Proposal, Negotiation). Includes lead name, source, assigned rep, and days since creation.",
    parameters: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          description: "Filter by a specific stage. Leave empty to return all open leads.",
          enum: ["New", "Contacted", "Qualified", "Proposal", "Negotiation"],
        },
        limit: {
          type: "number",
          description: "Maximum number of leads to return. Default is 20.",
          default: 20,
        },
      },
      required: [],
    },
    access: "read_only",
    requiresApproval: false,
    allowedAgents: ["coo", "admin", "sales"],
    requiredPlan: "pro",
    phase: "1b",
    endpoint: "/api/ai/tools/open-leads",
    method: "GET",
  },

  {
    name: "get_active_projects",
    description:
      "Returns projects currently in progress, including project name, client, assigned team, status, and deadline. Use to identify bottlenecks or overdue deliveries.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by project status.",
          enum: ["active", "in_review", "on_hold", "overdue"],
        },
        limit: {
          type: "number",
          description: "Maximum number of projects to return. Default is 20.",
          default: 20,
        },
      },
      required: [],
    },
    access: "read_only",
    requiresApproval: false,
    allowedAgents: ["coo", "admin"],
    requiredPlan: "pro",
    phase: "1b",
    endpoint: "/api/ai/tools/active-projects",
    method: "GET",
  },

  {
    name: "get_team_overview",
    description:
      "Returns a summary of the team: total headcount, breakdown by role, and count of active vs inactive users. Use to report on team size and structure.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    access: "read_only",
    requiresApproval: false,
    allowedAgents: ["coo", "admin", "hr"],
    requiredPlan: "pro",
    phase: "1b",
    endpoint: "/api/ai/tools/team-overview",
    method: "GET",
  },

  {
    name: "get_recent_activity",
    description:
      "Returns the most recent platform activity events — logins, records created, invoices paid, projects updated. Use to understand what happened in the business today.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of activity events to return. Default is 15.",
          default: 15,
        },
      },
      required: [],
    },
    access: "read_only",
    requiresApproval: false,
    allowedAgents: ["coo", "admin"],
    requiredPlan: "pro",
    phase: "1b",
    endpoint: "/api/ai/tools/recent-activity",
    method: "GET",
  },

  // ── PHASE 2: Finance Agent — WRITE (approval-gated) ──────────────────────

  {
    name: "send_payment_reminder",
    description:
      "Sends a payment reminder email to a client for a specific overdue invoice. Requires approval before sending. Include invoice ID and a reason for urgency if applicable.",
    parameters: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          description: "The ID of the overdue invoice.",
        },
        message: {
          type: "string",
          description: "Optional personalised message to include in the reminder email.",
        },
      },
      required: ["invoiceId"],
    },
    access: "write",
    requiresApproval: true,
    allowedAgents: ["finance"],
    requiredPlan: "pro",
    phase: "2",
    endpoint: "/api/ai/tools/send-payment-reminder",
    method: "POST",
  },

  {
    name: "create_lead",
    description:
      "Creates a new lead in the CRM. Use when a potential client has been identified and their details are available. Requires approval before creating.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Full name of the lead contact.",
        },
        email: {
          type: "string",
          description: "Email address of the lead.",
        },
        company: {
          type: "string",
          description: "Company name of the lead.",
        },
        source: {
          type: "string",
          description: "Where the lead came from.",
          enum: ["Website", "Referral", "Cold Outreach", "Event", "Social Media", "Other"],
        },
        notes: {
          type: "string",
          description: "Any additional context about this lead.",
        },
      },
      required: ["name", "email"],
    },
    access: "write",
    requiresApproval: true,
    allowedAgents: ["sales"],
    requiredPlan: "pro",
    phase: "2",
    endpoint: "/api/ai/tools/create-lead",
    method: "POST",
  },

  {
    name: "update_lead_status",
    description:
      "Moves a lead to a new stage in the sales pipeline. Use when follow-up has occurred and the lead's qualification status has changed.",
    parameters: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "The ID of the lead to update.",
        },
        stage: {
          type: "string",
          description: "The new stage to move the lead to.",
          enum: ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"],
        },
        notes: {
          type: "string",
          description: "Reason for the stage change.",
        },
      },
      required: ["leadId", "stage"],
    },
    access: "write",
    requiresApproval: false,
    allowedAgents: ["sales"],
    requiredPlan: "pro",
    phase: "2",
    endpoint: "/api/ai/tools/update-lead-status",
    method: "POST",
  },

];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get all tools available in a given phase */
export function getToolsByPhase(phase: ToolPhase): AgentTool[] {
  const phases: ToolPhase[] = ["1b"];
  if (phase === "2") phases.push("2");
  if (phase === "3") phases.push("2", "3");
  return TOOL_REGISTRY.filter((t) => phases.includes(t.phase));
}

/** Get read-only tools only — safe for COO agent */
export function getReadOnlyTools(): AgentTool[] {
  return TOOL_REGISTRY.filter((t) => t.access === "read_only");
}

/** Get tools available to a specific agent type */
export function getToolsForAgent(agentType: string): AgentTool[] {
  return TOOL_REGISTRY.filter((t) => t.allowedAgents.includes(agentType));
}

/** Format tools for Anthropic Claude API (tool_use format) */
export function toAnthropicTools(tools: AgentTool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

/** Format tools for OpenAI API (function calling format) */
export function toOpenAITools(tools: AgentTool[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/** Get a single tool by name — throws if not found */
export function getTool(name: string): AgentTool {
  const tool = TOOL_REGISTRY.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found in registry: ${name}`);
  return tool;
}

/** Validate that a tool call is safe to execute for a given agent and tenant plan */
export function validateToolCall(
  toolName: string,
  agentType: string,
  tenantPlan: string
): { valid: boolean; error?: string } {
  let tool: AgentTool;
  try {
    tool = getTool(toolName);
  } catch {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  if (!tool.allowedAgents.includes(agentType)) {
    return { valid: false, error: `Agent type "${agentType}" is not permitted to use tool "${toolName}"` };
  }

  const planRank: Record<string, number> = { trial: 0, starter: 1, pro: 2, enterprise: 3 };
  const requiredRank = planRank[tool.requiredPlan] ?? 2;
  const tenantRank = planRank[tenantPlan] ?? 0;

  if (tenantRank < requiredRank) {
    return { valid: false, error: `Tool "${toolName}" requires ${tool.requiredPlan} plan. Current plan: ${tenantPlan}` };
  }

  return { valid: true };
}
