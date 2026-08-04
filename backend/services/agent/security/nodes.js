import { authorize } from "./policy.js";
import { sanitizePII, sanitizeUntrustedText } from "./inputSecurity.js";
import { securityError } from "./errors.js";
import { audit } from "./audit.js";
import { assessRisk } from "./risk.js";

export const authorizeToolNode = async (state) => {
  const proposedTool = state.agent;
  let policyDecision;
  try {
    policyDecision = await authorize({
      action: "tool.execute",
      tool: proposedTool,
      user: { id: state.userId, tenantId: state.tenantId },
      tenantId: state.tenantId,
      approvalId: state.approvalId,
      traceId: state.traceId,
      arguments: state.toolArgs,
      modality: state.modality,
      classifierSignals: state.classifierSignals,
      resource: state.resource,
    });
  } catch (error) {
    audit("tool.blocked", {
      ...state,
      proposedTool,
      risk: { score: 0.9, category: "Tool Authorization", action: "Blocked", reason: error.code || "Policy denied" },
    }, { code: error.code });
    throw error;
  }
  const next = { ...state, proposedTool, policyDecision, risk: assessRisk({ text: state.prompt }) };
  audit("tool.authorized", next, { approvalId: state.approvalId || null });
  return next;
};

export const outputValidationNode = async (state) => {
  if (typeof state.response !== "string" || !state.response.trim()) {
    throw securityError(502, "The agent returned an invalid response.", "INVALID_AGENT_OUTPUT");
  }
  const response = sanitizeUntrustedText(state.response);
  // Catch the most common direct disclosure of this application's hidden
  // instructions. This is a last line of defence; policies must not depend on it.
  const normalized = response.toLowerCase();
  const disclosureSignals = ["you are cortexai", "system prompt", "developer message", "if searchcontext exists"];
  if (disclosureSignals.filter((signal) => normalized.includes(signal)).length >= 2) {
    throw securityError(502, "The model response was blocked by the output security policy.", "SYSTEM_PROMPT_DISCLOSURE_BLOCKED");
  }
  const { findings } = sanitizePII(state.response);
  const next = { ...state, response, risk: assessRisk({ text: response, source: "output" }) };
  audit("response.validated", next, { piiRedacted: findings });
  return next;
};
