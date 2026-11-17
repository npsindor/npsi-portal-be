import fs from "node:fs";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { ApiError } from "./common/filters/api-error.js";
import { HttpErrorFilter, toErrorResponse } from "./common/filters/http-error.filter.js";
import { logServerError, type RequestWithId, requestLogger } from "./common/logging/request-logger.js";
import { AppConfigService } from "./config/app-config.service.js";

export const API_PREFIX = "api/v1";
export const DOCS_PATH = "api/docs";

// Sites whose scripts may call the API with the member's cookie: exactly this environment's frontend
// (FRONTEND_URL, with and without "www."), any extra origins listed in CORS_ORIGINS, and localhost on
// developer machines only. Never a wildcard: sibling subdomains are "same-site", so SameSite=Strict
// would not protect members from a script on a forgotten or third-party-hosted *.npsindore.org page.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
export const CORS_REJECTED = "Not allowed by CORS";

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin.toLowerCase();
  } catch {
    return null;
  }
};

export const allowedOrigins = (frontendUrl: string, extra: string | undefined): Set<string> => {
  const origins = new Set<string>();
  for (const url of [frontendUrl, ...(extra ?? "").split(",")]) {
    const origin = originOf(url.trim());
    if (!origin) continue;
    origins.add(origin);
    const { protocol, host } = new URL(origin);
    origins.add(host.startsWith("www.") ? `${protocol}//${host.slice(4)}` : `${protocol}//www.${host}`);
  }
  return origins;
};

export const isAllowedOrigin = (origin: string, allowed: Set<string>, appEnv: string): boolean =>
  allowed.has(origin.toLowerCase()) || (!["production", "test"].includes(appEnv) && LOCAL_ORIGIN.test(origin));

// Deeply nested JSON (thousands of levels) overflows the stack in validation and serialisation.
// No request of this API nests anywhere near this deep; checked without recursion.
export const MAX_JSON_DEPTH = 64;
export const jsonDepthExceeds = (value: unknown, max = MAX_JSON_DEPTH): boolean => {
  const stack: Array<[unknown, number]> = [[value, 1]];
  while (stack.length > 0) {
    const [current, depth] = stack.pop() as [unknown, number];
    if (current === null || typeof current !== "object") continue;
    if (depth > max) return true;
    for (const child of Object.values(current)) if (child !== null && typeof child === "object") stack.push([child, depth + 1]);
  }
  return false;
};
const limitJsonDepth = (request: Request, _response: Response, next: NextFunction): void => {
  next(jsonDepthExceeds(request.body) ? new ApiError(400, "The request body is nested too deeply.") : undefined);
};

// Errors raised by Express middleware before Nest's router (CORS rejection,
// invalid or oversized JSON) get the same `{ error }` body as everything else.
const expressErrorHandler = (error: unknown, request: Request, response: Response, _next: NextFunction): void => {
  const { status, body } = toErrorResponse(error);
  logServerError(request as RequestWithId, status, error);
  response.status(status).json(body);
};

// Everything the HTTP app needs besides its modules; shared by main.ts and the
// e2e tests so they exercise exactly the production setup. The app must be
// created with `bodyParser: false` (JSON is parsed here with the legacy 2 MB
// limit, and urlencoded bodies were never accepted).
export const configureApp = (app: NestExpressApplication): void => {
  const config = app.get(AppConfigService);
  // Behind Hostinger's reverse proxy; a fixed hop count (TRUST_PROXY) keeps
  // https upload URLs correct without letting clients spoof X-Forwarded-For.
  app.set("trust proxy", config.trustProxy);
  app.use(requestLogger);
  // API responses carry member data and must not be kept by browsers or shared proxies; uploads are cacheable.
  app.use(`/${API_PREFIX}`, (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  // Security headers. Uploaded images are served to the frontend's own origin
  // (npsindore.org loads them from the API domain), so they must be embeddable cross-origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  const origins = allowedOrigins(config.frontendUrl, process.env.CORS_ORIGINS);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin, origins, config.appEnv)) return callback(null, true);
        callback(new ApiError(403, CORS_REJECTED));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(limitJsonDepth);
  app.use(expressErrorHandler);
  // Each Hostinger deploy is a new version folder; uploads stored inside it vanish on the next deploy.
  if (["production", "test"].includes(config.appEnv) && !process.env.UPLOADS_DIR) {
    console.warn(`⚠️  UPLOADS_DIR is not set: uploads are stored in ${config.uploadsDir}, inside the deployed code, and will be lost on the next deploy.`);
  }
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  app.useStaticAssets(config.uploadsDir, { prefix: "/uploads", maxAge: "7d", index: false });
  app.setGlobalPrefix(API_PREFIX);
  // Request DTOs document and whitelist inputs; business validation (with the
  // legacy messages) stays in the services. Bodiless requests are allowed.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false, stopAtFirstError: true }));
  app.useGlobalFilters(new HttpErrorFilter());

  // API docs only on a developer's machine (or when explicitly enabled): they map every endpoint and
  // field for an attacker, so the public test and production servers don't serve them.
  if (config.appEnv !== "development" && process.env.ENABLE_API_DOCS !== "true") return;
  SwaggerModule.setup(DOCS_PATH, app, buildOpenApiDocument(app));
};

// The OpenAPI description of the configured app (Swagger UI, and `npm run openapi`).
export const buildOpenApiDocument = (app: NestExpressApplication): OpenAPIObject =>
  SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("NPS Indore portal API")
      .setDescription('Backend API for the NPS Indore member portal. Errors are always `{ "error": "message" }`.')
      .setVersion("1")
      .addBearerAuth({ type: "http", scheme: "bearer", description: "Session token (also sent as the httpOnly npsi_session cookie)" })
      .build(),
  );
