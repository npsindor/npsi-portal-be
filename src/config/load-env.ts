import path from "node:path";
import dotenv from "dotenv";
import { PROJECT_ROOT } from "./project-root.js";

// Same loading rule as the legacy server/env.js: .env.local first, then .env,
// and anything already set in the process environment wins. Imported first in
// main.ts so every module (and the migration child process) sees the values.
dotenv.config({ path: [path.join(PROJECT_ROOT, ".env.local"), path.join(PROJECT_ROOT, ".env")], quiet: true });
