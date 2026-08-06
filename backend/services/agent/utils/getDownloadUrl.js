import fs from "fs";
import path from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3, isS3Configured } from "./s3.js";

export const getDownloadUrl = async (
  fileNameOrSentinel,
  expiresIn = 600,
  mimeType = "application/pdf"
) => {
  // When S3 is not configured, uploadToS3 returns a sentinel object
  // containing the raw buffer. Convert to a base64 data URL so the
  // file is always accessible regardless of server filesystem layout.
  if (fileNameOrSentinel && typeof fileNameOrSentinel === "object" && fileNameOrSentinel.localFallback) {
    const { buffer, contentType } = fileNameOrSentinel;
    const mime = contentType || mimeType;
    const b64  = Buffer.isBuffer(buffer) ? buffer.toString("base64") : Buffer.from(buffer).toString("base64");
    return `data:${mime};base64,${b64}`;
  }

  return await getSignedUrl(
    getS3(),
    new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key:    fileNameOrSentinel,
    }),
    { expiresIn }
  );
};