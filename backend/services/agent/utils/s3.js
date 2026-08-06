import { S3Client } from "@aws-sdk/client-s3";

/**
 * Single source of truth for S3 availability.
 * Returns true only when all required env vars are present and not placeholders.
 * Used by uploadToS3, getDownloadUrl, and imageGen.agent.
 */
export const isS3Configured = () => {
  const id     = (process.env.AWS_ACCESS_KEY_ID    || "").trim();
  const secret = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.AWS_BUCKET_NAME       || "").trim();
  return (
    Boolean(id)     && !id.toLowerCase().includes("add") &&
    Boolean(secret) && !secret.toLowerCase().includes("add") &&
    Boolean(bucket) && !bucket.toLowerCase().includes("add")
  );
};

// Lazy singleton — only instantiated when credentials are actually present,
// preventing startup errors when placeholders are in .env.
let _s3 = null;

export const getS3 = () => {
  if (!_s3) {
    // Strip surrounding quotes that .env parsers sometimes leave (e.g. "ap-south-1")
    const region = (process.env.AWS_REGION || "us-east-1").replace(/^["']|["']$/g, "");
    _s3 = new S3Client({
      region,
      credentials: {
        accessKeyId:     (process.env.AWS_ACCESS_KEY_ID    || "").trim(),
        secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
      },
    });
  }
  return _s3;
};

// Backward-compat named export — delegates to the lazy singleton.
export const s3 = new Proxy({}, {
  get(_, prop) { return getS3()[prop]; },
});