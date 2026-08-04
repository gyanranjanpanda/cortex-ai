import redis from "../../../shared/redis/redis.js";
import { securityError } from "./errors.js";

const COST_CENTS = { chat: 1, rag: 3, image: 50, tools: 10 };

export const estimateCostCents = (modality) => COST_CENTS[modality] || COST_CENTS.chat;

export const reserveBudget = async ({ tenantId, userId, modality, traceId }) => {
  const limit = Number(process.env.DAILY_BUDGET_CENTS || 0);
  const cost = estimateCostCents(modality);
  if (!limit) return { reserved: false, costCents: cost, budgetLimitCents: null };
  const key = `budget:${tenantId || "default"}:${new Date().toISOString().slice(0, 10)}`;
  const result = await redis.eval(
    "local current=tonumber(redis.call('GET',KEYS[1]) or '0'); local requested=tonumber(ARGV[1]); local limit=tonumber(ARGV[2]); if current+requested>limit then return {-1,current}; end; redis.call('INCRBY',KEYS[1],requested); redis.call('EXPIRE',KEYS[1],172800); return {current+requested,requested};",
    1, key, cost, limit,
  );
  if (Number(result?.[0]) === -1) {
    throw securityError(402, "Daily AI budget exceeded.", "BUDGET_EXCEEDED");
  }
  return { reserved: true, costCents: cost, budgetLimitCents: limit, reservation: `${traceId}:${userId}:${cost}` };
};
