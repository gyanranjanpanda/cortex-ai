import fs from "fs";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3, isS3Configured } from "./s3.js";

export const uploadToS3 = async (
  buffer,
  fileName,
  contentType
) => {
  if (!isS3Configured()) {
    // On Railway (or any multi-process deployment) the agent service filesystem
    // is not shared with the gateway, so local file writes produce broken URLs.
    // Return a sentinel so getDownloadUrl can build a data: URL instead.
    return { localFallback: true, buffer, contentType: fileName };
  }

  await getS3().send(
    new PutObjectCommand({
      Bucket:
        process.env.AWS_BUCKET_NAME,

      Key:
        fileName,

      Body:
        buffer,

      ContentType:
        contentType
    })
  );

  return fileName;
};