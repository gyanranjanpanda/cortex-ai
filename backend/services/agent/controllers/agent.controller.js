import redis from "../../../shared/redis/redis.js";
import { graph } from "../graph/supervisor.graph.js";
import { addMessage } from "../utils/memory.js";
import axios from "axios"
import crypto from "crypto";
import { securePrompt } from "../security/inputSecurity.js";
import { authorize } from "../security/policy.js";
import { audit } from "../security/audit.js";
import { assessRisk } from "../security/risk.js";
import { sanitizePII } from "../security/inputSecurity.js";
import { modalityFor } from "../security/modality.js";
import { enforceImagePromptPolicyAsync } from "../security/imagePolicy.js";
import { estimateCostCents, reserveBudget } from "../security/budget.js";

export const chat =
async(req,res,next)=>{

 try{

  const {

   prompt: rawPrompt,

   conversationId,

   agent

} = req.body;

  const traceId = req.headers["x-trace-id"] || crypto.randomUUID();
  const userId = req.headers["x-user-id"];
  const tenantId = req.headers["x-tenant-id"] || "default";
  const approvalId = req.headers["x-approval-id"];
  const modality = modalityFor({ routeModality: req.modality, agent });
  let prompt;
  let piiFindings;
  let classifierSignals = [];

  try {
    ({ value: prompt, findings: piiFindings } = securePrompt(rawPrompt));
  } catch (error) {
    const safePrompt = sanitizePII(typeof rawPrompt === "string" ? rawPrompt : "").value;
    audit("request.blocked", {
      prompt: safePrompt,
      userId,
      tenantId,
      traceId,
      agent,
      risk: assessRisk({ text: safePrompt, errorCode: error.code }),
    }, { code: error.code });
    throw error;
  }

  if (modality === "image") {
    try {
      classifierSignals = (await enforceImagePromptPolicyAsync(prompt)).signals;
    } catch (error) {
      audit("request.blocked", { prompt, userId, tenantId, traceId, agent, modality, risk: { score: 0.99, category: "Image Policy", action: "Blocked", reason: error.code } }, { code: error.code });
      throw error;
    }
  }

  // First policy checkpoint: constrain access before the graph plans work.
  let requestPolicy;
  try {
    requestPolicy = await authorize({
      action: "agent.request",
      tool: agent && agent !== "auto" ? agent : "chat",
      modality,
      classifierSignals,
      costCents: estimateCostCents(modality),
      user: { id: userId, tenantId },
      tenantId,
      approvalId,
      traceId,
    });
  } catch (error) {
    audit("request.blocked", {
      prompt,
      userId,
      tenantId,
      traceId,
      agent,
      risk: { score: 0.9, category: "Authorization", action: "Blocked", reason: error.code || "Policy denied" },
    }, { code: error.code });
    throw error;
  }

  const budgetReservation = await reserveBudget({ tenantId, userId, modality, traceId });

  audit("request.accepted", { prompt, userId, tenantId, traceId, agent, modality, classifierSignals, budgetReservation, policyDecision: requestPolicy, risk: assessRisk({ text: prompt }) }, { piiRedacted: piiFindings });

await addMessage(conversationId, "user", prompt);

  await axios.post(`${process.env.CHAT_SERVICE}/save-message`, {
    conversationId,
    role: "user",
    content: prompt,
  });

  const result = await graph.invoke({
    prompt,
    conversationId,
    userId,
    tenantId,
    traceId,
    approvalId,
    requestPolicy,
    modality,
    classifierSignals,
    budgetReservation,
    agent,
    file: req.file,
  });

  // PDF/PPT agents store the real download URL in result.downloadUrl to avoid
  // the PII sanitizer in outputValidationNode corrupting S3 presigned URLs
  // (long digit sequences in presigned URLs match the PHONE PII regex).
  // Inject the real URL here after all sanitization is complete.
  let finalResponse = result.response || "";
  if (result.downloadUrl) {
    finalResponse = finalResponse
      .replace("{{PDF_DOWNLOAD_URL}}", result.downloadUrl)
      .replace("{{PPT_DOWNLOAD_URL}}", result.downloadUrl);
  }

  await addMessage(conversationId, "assistant", finalResponse);
  await axios.post(`${process.env.CHAT_SERVICE}/save-message`, {
    conversationId,
    role: "assistant",
    content: finalResponse,
    images:    result.images    || [],
    artifacts: result.artifacts || [],
  });

  return res.json({
    success:   true,
    answer:    finalResponse,
    images:    result.images    || [],
    artifacts: result.artifacts || [],
    traceId,
  });

 } catch(error) {
   next(error);
 }

}
