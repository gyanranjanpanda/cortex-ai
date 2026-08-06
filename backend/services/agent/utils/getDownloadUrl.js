import fs from "fs";
import path from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3, isS3Configured } from "./s3.js";

export const getDownloadUrl = async (
  fileName,
  expiresIn = 600
) => {
  if (!isS3Configured()) {
    const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:8000";
    return `${gatewayUrl}/uploads/${fileName}`;
  }

  return await getSignedUrl(
    getS3(),
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