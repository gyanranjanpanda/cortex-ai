import crypto from "crypto";

const redact = (value) => String(value ?? "").replace(/\[REDACTED_[A-Z]+\]/g, "[REDACTED]").slice(0, 500);

export const audit = (event, state, extra = {}) => {
  console.info(JSON.stringify({
    event,
    traceId: state.traceId,
    userId: state.userId,
    tenantId: state.tenantId,
    agent: state.agent,
    policyVersion: state.policyDecision?.policyVersion,
    prompt: redact(state.prompt),
    promptHash: state.prompt ? crypto.createHash("sha256").update(String(state.prompt)).digest("hex") : undefined,
    risk: state.risk,
    at: new Date().toISOString(),
    ...extra,
  }));
};
