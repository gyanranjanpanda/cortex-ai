import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import redis from "../shared/redis/redis.js";
import dotenv from "dotenv";
import proxy from "express-http-proxy";
import { proxyWithUser } from "./utils/proxyWithHeaders.js";
import { protect } from "./middlewares/auth.middleware.js";
import { getCurrentUser } from "./controllers/user.controller.js";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { inspectJsonPrompt } from "./middlewares/security.middleware.js";
import previewRouter from "./routes/preview.routes.js";

dotenv.config();

const app  = express();
const port = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin      = origin.replace(/\/$/, "");
    const allowedFrontend  = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
    if (
      cleanOrigin === allowedFrontend ||
      cleanOrigin.includes("localhost") ||
      cleanOrigin.endsWith(".up.railway.app")
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
}));

// ── COOP / COEP headers for SharedArrayBuffer (WebContainers) ─────────────────
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

// ── Static / middleware ───────────────────────────────────────────────────────
app.use("/uploads", express.static("uploads"));
app.use(morgan("dev"));
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false })); // CSP handled separately

// ── Auth ──────────────────────────────────────────────────────────────────────
app.use("/api/auth", proxy(process.env.AUTH_SERVICE, {
  proxyReqPathResolver: (req) => req.url,
}));
app.use(express.json());
app.use("/api/me", protect, getCurrentUser);

// ── Chat ──────────────────────────────────────────────────────────────────────
app.use("/api/chat", protect, proxyWithUser(process.env.CHAT_SERVICE));

// ── Agent (rate-limited) ──────────────────────────────────────────────────────
const agentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.GATEWAY_AGENT_RATE_LIMIT || 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: new RedisStore({
    prefix: "gateway:agent-rate:",
    sendCommand: (...args) => redis.call(...args),
  }),
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Too many agent requests. Please try again shortly.",
  },
});
app.use("/api/agent", protect, agentRateLimit, inspectJsonPrompt, proxyWithUser(process.env.AGENT_SERVICE));

// ── Billing ───────────────────────────────────────────────────────────────────
app.use("/api/billing", protect, proxyWithUser(process.env.BILLING_SERVICE));

// ── Preview ───────────────────────────────────────────────────────────────────
// Requires Docker to be available on the host for backend-stack previews.
// HTML / React / Vue previews run client-side (no Docker needed).
app.use("/api/preview", protect, previewRouter);

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({ service: "gateway", status: "ok" });
});

app.listen(port, () => {
  console.log(`Gateway running on port ${port}`);
});
