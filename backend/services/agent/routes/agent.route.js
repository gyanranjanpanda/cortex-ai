import express from "express";
import { chat } from "../controllers/agent.controller.js";
import multer from "../config/multer.js";



const router =
express.Router();

router.post(
 "/chat",
 multer.single("file"),
 chat
);

const explicitModality = (modality, forcedAgent) => (req, res, next) => {
  req.modality = modality;
  if (forcedAgent) req.body.agent = forcedAgent;
  next();
};

router.post("/image", multer.none(), explicitModality("image", "image"), chat);
router.post("/rag", multer.single("file"), explicitModality("rag", "pdf_rag"), chat);

export default router;
