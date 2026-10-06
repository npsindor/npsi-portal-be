import fs from "node:fs";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { HttpErrorFilter, toErrorResponse } from "./common/filters/http-error.filter.js";
import { logServerError, type RequestWithId, requestLogger } from "./common/logging/request-logger.js";
import { AppConfigService } from "./config/app-config.service.js";

export const API_PREFIX = "api/v1";
export const DOCS_PATH = "api/docs";

// Only this project's own frontends: the live domain and its subdomains, the
// Hostinger preview domains, and local dev.
const ALLOWED_ORIGIN_PATTERN = /^https:\/\/([a-z0-9-]+\.)*npsindore\.org$|^https:\/\/([a-z0-9-]+\.)*hostingersite\.com$|^http:\/\/localhost(:\d+)?$/i;

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
  // Security headers. Uploaded images are served to the frontend's own origin
  // (npsindore.org loads them from the API domain), so they must be embeddable cross-origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGIN_PATTERN.test(origin)) return callback(null, true);
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
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

  // API docs everywhere except production (they map every endpoint and field for an attacker).
  if (config.appEnv === "production") return;
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("NPS Indore portal API")
      .setDescription('Backend API for the NPS Indore member portal. Errors are always `{ "error": "message" }`.')
      .setVersion("1")
      .addBearerAuth({ type: "http", scheme: "bearer", description: "Session token from login or OTP verification" })
      .build(),
  );
  SwaggerModule.setup(DOCS_PATH, app, document);
};
