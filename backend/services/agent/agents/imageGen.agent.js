import axios from "axios";
import { getModel } from "../utils/model.js";

import { uploadToS3 } from "../utils/uploadToS3.js";
import { getDownloadUrl } from "../utils/getDownloadUrl.js";
import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";
import { isS3Configured } from "../utils/s3.js";
import crypto from "crypto";
import { moderateGeneratedImage } from "../security/imageModeration.js";
import { audit } from "../security/audit.js";

const imageFormats = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const imageAgent = async (state) => {

  try {

await checkAgentLimit(
    state.userId,
    "image"
  );
 await deductCredits(

        state.userId,

        "image"

    );


    const llm =
      getModel("image");

    const promptResponse =
      await llm.invoke(`

You are an elite AI image prompt engineer.

Convert the user request into a highly detailed image generation prompt.

Requirements:

- Cinematic lighting
- Professional composition
- Ultra realistic
- High detail
- Beautiful color palette
- Sharp focus
- 8K quality
- Photorealistic
- Depth of field
- Professional photography
- Stunning visuals

Return only the image prompt.

User Request:

${state.prompt}

`);

    const enhancedPrompt =
      promptResponse.content.trim();

    const imageUrl =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(
        enhancedPrompt
      )}`;

    const imageResponse =
      await axios.get(
        imageUrl,
        {
          responseType:
            "arraybuffer"
        }
      );

    const imageBuffer =
      Buffer.from(
        imageResponse.data
      );

    const contentType = String(imageResponse.headers["content-type"] || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const extension = imageFormats[contentType];

    if (!extension || imageBuffer.length < 100) {
      throw new Error(`Image provider returned an unsupported response type: ${contentType || "unknown"}`);
    }

    // The bytes stay in memory (quarantine) until the output moderator allows
    // them. No S3/local publication occurs before this decision.
    const moderation = await moderateGeneratedImage({
      buffer: imageBuffer,
      contentType,
      traceId: state.traceId,
    });
    audit("image.output_moderated", state, {
      moderationStatus: moderation.status,
      imageHash: moderation.hash,
    });

    // S3 is optional: when AWS credentials are not configured (e.g. Railway
    // without an S3 bucket), serve the Pollinations URL directly. Images are
    // still quarantined and moderated above — only the storage backend differs.
    const s3Configured = isS3Configured();

    let downloadUrl;

    if (s3Configured) {
      const fileName = `image-${crypto.randomUUID()}.${extension}`;
      await uploadToS3(imageBuffer, fileName, contentType);
      downloadUrl = await getDownloadUrl(fileName, 10 * 60);
    } else {
      // Direct provider URL — no expiry, no storage cost. Sufficient for demos.
      downloadUrl = imageUrl;
    }

    return {
      ...state,
      images: [downloadUrl],
      response: `
# 🖼️ Image Generated Successfully

📥 [View Image](${downloadUrl})
${s3Configured ? "\n⏳ Link expires in 10 minutes." : ""}
`,
    };

  } catch (error) {

    if (error?.code?.startsWith("IMAGE_") || [403, 503].includes(error?.status)) {
      audit("image.blocked", state, { code: error.code || "IMAGE_POLICY_DENIED" });
      throw error;
    }

    // Log the real error so Railway logs show the actual cause.
    console.error("Image Agent Error:", error?.message || error);

    return {
      ...state,
      response: "❌ Failed to generate image.",
    };

  }

};
