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
    const uploadsDir = path.resolve("../../gateway/uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
    return fileName;
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