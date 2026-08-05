import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// ─── Resolve preview module path ─────────────────────────────────────────────
// The preview/ folder sits at the repo root, two levels above gateway/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const previewRoot = path.resolve(__dirname, "../../../preview");

let previewManager;
async function loadPreviewManager() {
  if (!previewManager) {
    previewManager = await import(path.join(previewRoot, "previewManager.js"));
  }
  return previewManager;
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = express.Router();

/**
 * POST /api/preview/start
 * Body: { artifact: { files: [{name, content}], type, projectType } }
 * Starts a Docker container for the given artifact and returns the session.
 */
router.post("/start", async (req, res) => {
  try {
    const { artifact } = req.body;
    if (!artifact?.files?.length) {
      return res.status(400).json({ success: false, message: "No files provided." });
    }

    const pm = await loadPreviewManager();
    const session = await pm.startSession(artifact);

    res.status(201).json({ success: true, session });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/preview/:id
 * Returns the current session status.
 */
router.get("/:id", (req, res) => {
  loadPreviewManager().then(pm => {
    const session = pm.getSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: "Session not found." });
    res.json({ success: true, session });
  }).catch(err => res.status(500).json({ success: false, message: err.message }));
});

/**
 * GET /api/preview/:id/events
 * Server-Sent Events stream for build logs and status updates.
 */
router.get("/:id/events", (req, res) => {
  loadPreviewManager().then(pm => {
    pm.streamSessionEvents(req, res);
  }).catch(err => {
    res.status(500).json({ success: false, message: err.message });
  });
});

/**
 * DELETE /api/preview/:id
 * Stops and cleans up the container session.
 */
router.delete("/:id", async (req, res) => {
  try {
    const pm = await loadPreviewManager();
    const session = await pm.stopSession(req.params.id);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ALL /api/preview/:id/proxy  (and any sub-path)
 * Transparent HTTP proxy to the running container.
 * Uses router.use so the full path is preserved without needing a named wildcard.
 */
router.use("/:id/proxy", (req, res) => {
  loadPreviewManager().then(pm => {
    pm.proxySessionRequest(req, res);
  }).catch(err => {
    res.status(502).json({ success: false, message: err.message });
  });
});

export default router;
