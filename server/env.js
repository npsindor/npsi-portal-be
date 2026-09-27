import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({
  path: [
    path.join(backendDir, ".env.local"),
    path.join(backendDir, ".env"),
  ],
});
