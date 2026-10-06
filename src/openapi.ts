// Writes the API's OpenAPI description (default docs/openapi.json; pass another
// path, e.g. ../npsi-portal-fe/src/api/openapi.json). Builds the app without
// starting it or connecting to the database.
import "./config/load-env.js";
import { writeFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { buildOpenApiDocument, configureApp } from "./configure-app.js";

const target = process.argv[2] ?? "docs/openapi.json";
process.env.APP_ENV = "development"; // so configureApp mounts the docs
process.env.LOG_REQUESTS = "false";
const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
configureApp(app);
const document = buildOpenApiDocument(app);
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
console.log(`OpenAPI written to ${target} (${Object.keys(document.paths).length} paths)`);
