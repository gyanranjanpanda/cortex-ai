import crypto from "crypto";
import { securityError } from "./errors.js";

export const moderateGeneratedImage = async ({ buffer, contentType, traceId }) => {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const endpoint = process.env.IMAGE_MODERATION_URL;
  if (!endpoint) {
    // Moderation is only enforced when IMAGE_MODERATION_REQUIRED is explicitly
    // set to "true". Defaulting to required-in-production silently broke image
    // generation for deployments that have no moderation service configured.
    const required = process.env.IMAGE_MODERATION_REQUIRED === "true";
    if (required) {
      throw securityError(503, "Image moderation is unavailable; the image was not published.", "IMAGE_MODERATION_UNAVAILABLE");
    }
    return { status: "unverified", hash, contentType, traceId };
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-image-content-type": contentType, "x-trace-id": traceId || "" },
    body: buffer,
    signal: AbortSignal.timeout(Number(process.env.IMAGE_MODERATION_TIMEOUT_MS || 5000)),
  });
  if (!response.ok) throw securityError(503, "Image moderation failed; the image was not published.", "IMAGE_MODERATION_UNAVAILABLE");
  const decision = await response.json();
  if (decision.action !== "ALLOW") throw securityError(403, "Generated image blocked by output safety policy.", "IMAGE_OUTPUT_POLICY_DENIED");
  return { ...decision, status: "allowed", hash, contentType, traceId };
};
