import path from "node:path";
import { fileURLToPath } from "node:url";

// Repository root, resolved from this file (src/config or dist/config), the
// same way the legacy server resolved paths relative to server/../
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
