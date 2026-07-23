import fs from "fs";
import path from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "./s3.js";

export const getDownloadUrl = async (
  fileName,
  expiresIn = 600
) => {
  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID.includes("add") ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY.includes("add")
  ) {
    const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:8000";
    return `${gatewayUrl}/uploads/${fileName}`;
  }

  return await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket:
        process.env.AWS_BUCKET_NAME,

      Key:
        fileName
    }),
    {
      expiresIn
    }
  );
};