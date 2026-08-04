import { securityError } from "./errors.js";

export const MODALITIES = new Set(["chat", "image", "rag", "tools"]);

export const modalityFor = ({ routeModality, agent } = {}) => {
  if (routeModality && !MODALITIES.has(routeModality)) {
    throw securityError(400, "Unsupported modality.", "UNSUPPORTED_MODALITY");
  }
  if (routeModality) return routeModality;
  if (agent === "image") return "image";
  if (agent === "pdf" || agent === "pdf_rag") return "rag";
  return "chat";
};
