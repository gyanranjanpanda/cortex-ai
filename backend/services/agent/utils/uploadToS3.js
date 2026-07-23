import fs from "fs";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./s3.js";

export const uploadToS3 = async (
  buffer,
  fileName,
  contentType
) => {
  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID.includes("add") ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY.includes("add")
  ) {
    const uploadsDir = path.resolve("../../gateway/uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
    return fileName;
  }

  await s3.send(
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