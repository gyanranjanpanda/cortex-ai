import { securityError } from "./errors.js";

const allowedAgents = new Set(["chat", "search", "coding", "pdf", "ppt", "image", "vision", "pdf_rag"]);
const highRiskAgents = () => new Set((process.env.HIGH_RISK_AGENTS || "").split(",").map((v) => v.trim()).filter(Boolean));

const validateToolArguments = (args) => {
  if (args === undefined) return;
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.getPrototypeOf(args) !== Object.prototype) {
    throw securityError(400, "Tool arguments must be a plain object.", "INVALID_TOOL_ARGUMENTS");
  }
  if (Object.keys(args).length > 20 || JSON.stringify(args).length > 16_000) {
    throw securityError(400, "Tool arguments exceed the policy limit.", "INVALID_TOOL_ARGUMENTS");
  }
  for (const key of Object.keys(args)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      throw securityError(400, "Tool arguments contain a prohibited field.", "INVALID_TOOL_ARGUMENTS");
    }
  }
};

const localDecision = (input) => {
  if (!allowedAgents.has(input.tool)) return { allow: false, reason: "Unknown tool" };
  if (!input.user?.id) return { allow: false, reason: "Missing user identity" };
  if (input.modality === "image" && input.classifierSignals?.length) return { allow: false, reason: "Image classifier denied the request" };
  if (input.action === "tool.execute" && input.resource?.tenantId && input.resource.tenantId !== input.tenantId) {
    return { allow: false, reason: "Cross-tenant resource access" };
  }
  const requiresApproval = highRiskAgents().has(input.tool);
  return { allow: true, requiresApproval, reason: requiresApproval ? "High-risk tool" : "Allowed by local policy" };
};

export const authorize = async (input) => {
  validateToolArguments(input.arguments);
  let decision = localDecision(input);
  const opaUrl = process.env.OPA_DECISION_URL;
  if (opaUrl) {
    try {
      const response = await fetch(opaUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
        signal: AbortSignal.timeout(Number(process.env.OPA_TIMEOUT_MS || 1500)),
      });
      if (!response.ok) throw new Error(`OPA returned ${response.status}`);
      const body = await response.json();
      const result = body.result;
      decision = typeof result === "boolean" ? { allow: result } : result;
    } catch (cause) {
      if (process.env.OPA_REQUIRED === "true") {
        throw securityError(503, "Policy service is unavailable.", "POLICY_UNAVAILABLE");
      }
      console.warn("OPA unavailable; using local policy:", cause.message);
    }
  }
  if (!decision?.allow) throw securityError(403, "This action is not permitted by policy.", "POLICY_DENIED");
  if (decision.requiresApproval && !input.approvalId) {
    throw securityError(409, "This action requires human approval.", "HUMAN_APPROVAL_REQUIRED");
  }
  return { ...decision, policyVersion: decision.policyVersion || process.env.POLICY_VERSION || "local-v1" };
};
