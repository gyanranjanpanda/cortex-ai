import { initializeApp, cert } from "firebase-admin/app";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, "../serviceAccount.json");

let credential;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    credential = cert(parsed);
  } catch (err) {
    console.error("Error parsing FIREBASE_SERVICE_ACCOUNT env var:", err);
  }
}

if (!credential && fs.existsSync(serviceAccountPath)) {
  try {
    const raw = fs.readFileSync(serviceAccountPath, "utf-8");
    credential = cert(JSON.parse(raw));
  } catch (err) {
    console.error("Error reading serviceAccount.json file:", err);
  }
}

if (!credential) {
  console.warn("⚠️ Firebase service account credential not found! Set FIREBASE_SERVICE_ACCOUNT env var or add serviceAccount.json.");
}

export const app = initializeApp({
  credential
});